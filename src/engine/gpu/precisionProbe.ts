import {
  DOUBLE_SINGLE_MANTISSA_BITS,
  FLOAT32_MANTISSA_BITS,
} from '../precisionLimits';

/**
 * How many significand bits the double-single path actually delivers here.
 *
 * The shader emulates a wider float with an (hi, lo) pair of f32s, which only
 * works if the compiler leaves Dekker's error-free transformations alone.
 * The shader now splits by masking mantissa bits, which is exact and has no
 * algebraic identity for a driver to fold away — unlike Dekker's subtractive
 * split, which ANGLE/D3D11 collapsed, silently reducing the path to f32.
 *
 * This still measures rather than assumes: it runs the real split and checks
 * the recovered error term is non-zero, so a driver that breaks it in some new
 * way is reported honestly instead of being trusted.
 */

const VERTEX_SOURCE = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

/**
 * Multiplies two values whose exact product needs more than f32 can hold. With
 * the split intact the recovered error term is non-zero; folded, it is exactly
 * zero. Red channel reports which.
 */
const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
uniform float uA;
uniform float uB;
out vec4 probeResult;
float ddHighPart(float a) {
  return uintBitsToFloat(floatBitsToUint(a) & 0xfffff000u);
}
void main() {
  float aHigh = ddHighPart(uA);
  float aLow = uA - aHigh;
  float bHigh = ddHighPart(uB);
  float bLow = uB - bHigh;
  float p = uA * uB;
  float err = ((aHigh * bHigh - p) + aHigh * bLow + aLow * bHigh) + aLow * bLow;
  probeResult = vec4(err == 0.0 ? 0.0 : 1.0, 0.0, 0.0, 1.0);
}
`;

const compile = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null => {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

export const resolveShaderDoubleBits = (measured: number | null): number =>
  measured ?? FLOAT32_MANTISSA_BITS;

export const probeShaderDoubleBits = (
  gl: WebGL2RenderingContext,
): number | null => {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  if (!vertex || !fragment) {
    return null;
  }
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  if (!program || !buffer) {
    if (buffer) {
      gl.deleteBuffer(buffer);
    }
    if (program) {
      gl.deleteProgram(program);
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }

  try {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return null;
    }
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    // Irrational-ish operands, so the exact product genuinely needs the low word.
    gl.uniform1f(gl.getUniformLocation(program, 'uA'), Math.SQRT2);
    gl.uniform1f(gl.getUniformLocation(program, 'uB'), Math.PI);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const splitSurvived = pixel[0] > 127;
    return splitSurvived ? DOUBLE_SINGLE_MANTISSA_BITS : FLOAT32_MANTISSA_BITS;
  } finally {
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }
};
