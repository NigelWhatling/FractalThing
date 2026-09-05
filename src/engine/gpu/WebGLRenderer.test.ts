import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebGLRenderer } from './WebGLRenderer';
import type { WebGLRenderRequest } from './types';

vi.mock('./precisionProbe', () => ({
  probeShaderDoubleBits: vi.fn(() => 48),
  resolveShaderDoubleBits: (value: number | null) => value ?? 24,
}));

const renderers: WebGLRenderer[] = [];
afterEach(() => {
  renderers.splice(0).forEach((renderer) => renderer.dispose());
});

const createHarness = () => {
  const gl = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    HIGH_FLOAT: 36338,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    TEXTURE_2D: 3553,
    UNPACK_ALIGNMENT: 3317,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    LINEAR: 9729,
    CLAMP_TO_EDGE: 33071,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    TEXTURE0: 33984,
    FLOAT: 5126,
    COLOR_BUFFER_BIT: 16384,
    TRIANGLES: 4,
    getShaderPrecisionFormat: vi.fn(() => ({ precision: 23 })),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => 'Link failed'),
    deleteProgram: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    deleteBuffer: vi.fn(),
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    pixelStorei: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    deleteTexture: vi.fn(),
    getUniformLocation: vi.fn(() => null),
    getAttribLocation: vi.fn(() => 0),
    getExtension: vi.fn(() => null),
    viewport: vi.fn(),
    useProgram: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    activeTexture: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    drawArrays: vi.fn(),
  };
  const canvas = Object.assign(new EventTarget(), {
    width: 32,
    height: 32,
    getContext: vi.fn(() => gl),
  });
  const renderer = new WebGLRenderer(canvas as unknown as HTMLCanvasElement, {
    restoreLastRender: false,
  });
  renderers.push(renderer);
  return { renderer, canvas, gl };
};

const request: WebGLRenderRequest = {
  bounds: { x0: -2, y0: -1, xScale: 0.01, yScale: 0.01 },
  maxIterations: 64,
  palette: [
    [0, 0, 0],
    [255, 255, 255],
  ],
  colourMode: 'cycle',
  colourPeriod: 64,
  smooth: true,
  ditherStrength: 0,
  algorithm: 'mandelbrot',
  precision: 'single',
};

describe('on-demand WebGL precision programs', () => {
  it('compiles only the base program initially and caches each requested limb profile', () => {
    const { renderer, gl } = createHarness();
    expect(gl.createProgram).toHaveBeenCalledOnce();
    expect(renderer.getCapabilities().supportedLimbProfiles).toEqual([]);
    expect(renderer.render(request).accepted).toBe(true);
    expect(gl.createProgram).toHaveBeenCalledOnce();
    expect(
      renderer.render({
        ...request,
        precision: 'limb',
        limbProfile: 'balanced',
      }).accepted,
    ).toBe(true);
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    renderer.render({ ...request, precision: 'limb', limbProfile: 'balanced' });
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    renderer.render({ ...request, precision: 'limb', limbProfile: 'high' });
    expect(gl.createProgram).toHaveBeenCalledTimes(3);
    expect(renderer.getCapabilities().supportedLimbProfiles).toEqual([
      'balanced',
      'high',
    ]);
  });

  it('does not repeatedly compile a failed profile or disable working profiles', () => {
    const { renderer, gl } = createHarness();
    gl.getProgramParameter.mockReturnValueOnce(false);
    const limb = {
      ...request,
      precision: 'limb' as const,
      limbProfile: 'balanced' as const,
    };
    expect(renderer.render(limb)).toMatchObject({
      accepted: false,
      reason: 'GPU limb profile balanced is unavailable',
    });
    expect(renderer.render(limb).accepted).toBe(false);
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    expect(renderer.render(request).accepted).toBe(true);
    expect(renderer.render({ ...limb, limbProfile: 'high' }).accepted).toBe(
      true,
    );
    expect(gl.createProgram).toHaveBeenCalledTimes(3);
  });

  it('rebuilds only requested programs after context restoration and retries prior failures', () => {
    const { renderer, gl, canvas } = createHarness();
    gl.getProgramParameter.mockReturnValueOnce(false);
    const limb = {
      ...request,
      precision: 'limb' as const,
      limbProfile: 'balanced' as const,
    };
    renderer.render(limb);
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(renderer.getCapabilities().available).toBe(false);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(renderer.getCapabilities().supportedLimbProfiles).toEqual([]);
    expect(gl.createProgram).toHaveBeenCalledTimes(3);
    expect(renderer.render(limb).accepted).toBe(true);
    expect(gl.createProgram).toHaveBeenCalledTimes(4);
  });
});
