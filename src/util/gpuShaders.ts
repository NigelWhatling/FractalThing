export const GPU_VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const segmentNames = ['lo', 'mid', 'hi', 'top'];
const componentNames = ['x', 'y', 'z', 'w'];

export const buildFragmentShaderSource = (
  maxIterations: number,
  precision: 'highp' | 'mediump',
  includeLimb = true,
  limbFractional = 4,
  limbCount = 12
) => {
  const limbScaleLiteral = Number.isFinite(limbFractional)
    ? Math.pow(1024, limbFractional).toExponential(8)
    : '1.0';
  const buildLimbAccess = (variable: string, index: number) => {
    const segment = segmentNames[Math.floor(index / 4)] ?? 'lo';
    const component = componentNames[index % 4] ?? 'x';
    return `${variable}.${segment}.${component}`;
  };
  const buildLimbComponents = (variable: string, count: number) =>
    Array.from({ length: count }, (_, index) => buildLimbAccess(variable, index));
  const buildLimbNormalizeSource = (count: number) => {
    const components = buildLimbComponents('v', count);
    if (components.length === 0) {
      return '';
    }
    const lines: string[] = [];
    lines.push(`    float carry = floor((${components[0]} + LIMB_HALF) / LIMB_BASE);`);
    lines.push(`    ${components[0]} -= carry * LIMB_BASE;`);
    lines.push(`    ${components[1]} += carry;`);
    for (let index = 1; index < components.length - 1; index += 1) {
      lines.push(
        `    carry = floor((${components[index]} + LIMB_HALF) / LIMB_BASE);`
      );
      lines.push(`    ${components[index]} -= carry * LIMB_BASE;`);
      lines.push(`    ${components[index + 1]} += carry;`);
    }
    const last = components[components.length - 1];
    lines.push(`    carry = floor((${last} + LIMB_HALF) / LIMB_BASE);`);
    lines.push(`    ${last} -= carry * LIMB_BASE;`);
    return lines.join('\n');
  };
  const buildLimbFromFloatSource = (count: number) => {
    const limbs = Array.from({ length: count }, (_, index) => `l${index}`);
    const lines: string[] = [];
    lines.push('    float v = abs(scaled);');
    limbs.forEach((limb, index) => {
      lines.push(`    float ${limb} = mod(v, LIMB_BASE);`);
      lines.push(`    v = floor(v / LIMB_BASE);`);
    });
    const segmentValues = [];
    for (let segment = 0; segment < Math.ceil(count / 4); segment += 1) {
      const start = segment * 4;
      const values = limbs
        .slice(start, start + 4)
        .map((value) => value ?? '0.0')
        .join(', ');
      const name = segmentNames[segment] ?? 'lo';
      segmentValues.push(`    result.${name} = vec4(${values}) * sign;`);
    }
    return `${lines.join('\n')}\n${segmentValues.join('\n')}`;
  };
  const buildLimbIsNegativeSource = (count: number) => {
    const components = buildLimbComponents('v', count);
    const lines: string[] = [];
    for (let index = components.length - 1; index > 0; index -= 1) {
      const component = components[index];
      lines.push(`    if (${component} != 0.0) {`);
      lines.push(`      return ${component} < 0.0;`);
      lines.push('    }');
    }
    const last = components[0];
    lines.push(`    return ${last} < 0.0;`);
    return lines.join('\n');
  };
  const buildLimbMulSource = (fractional: number, count: number) => {
    const termsFor = (target: number) => {
      const terms: string[] = [];
      for (let i = 0; i < count; i += 1) {
        for (let j = 0; j < count; j += 1) {
          if (i + j === target) {
            terms.push(`a${i} * b${j}`);
          }
        }
      }
      return terms.length > 0 ? terms.join(' + ') : '0.0';
    };
    const lines = [];
    for (let idx = 0; idx < count; idx += 1) {
      const target = fractional + idx;
      lines.push(`    float c${idx} = ${termsFor(target)};`);
    }
    return lines.join('\n');
  };
  const limbUniforms = includeLimb
    ? `
  uniform vec4 u_x0_limb_lo;
  uniform vec4 u_x0_limb_mid;
  uniform vec4 u_x0_limb_hi;
  uniform vec4 u_y0_limb_lo;
  uniform vec4 u_y0_limb_mid;
  uniform vec4 u_y0_limb_hi;
  uniform vec4 u_xScale_limb_lo;
  uniform vec4 u_xScale_limb_mid;
  uniform vec4 u_xScale_limb_hi;
  uniform vec4 u_yScale_limb_lo;
  uniform vec4 u_yScale_limb_mid;
  uniform vec4 u_yScale_limb_hi;
  uniform float u_useLimb;`
    : '';

  const limbFunctions = includeLimb
    ? `
  const float LIMB_BASE = 1024.0;
  const float LIMB_HALF = 512.0;
  const float LIMB_B4 = ${limbScaleLiteral};

  struct Limb12 {
    vec4 lo;
    vec4 mid;
    vec4 hi;
  };

  Limb12 limbNormalize(Limb12 v) {
${buildLimbNormalizeSource(limbCount)}
    return v;
  }

  Limb12 limbFromFloatScaled(float value) {
    float scaled = value * LIMB_B4;
    float sign = scaled < 0.0 ? -1.0 : 1.0;
    Limb12 result;
${buildLimbFromFloatSource(limbCount)}
    return limbNormalize(result);
  }

  bool limbIsNegative(Limb12 v) {
${buildLimbIsNegativeSource(limbCount)}
  }

  Limb12 limbAbs(Limb12 v) {
    if (limbIsNegative(v)) {
      v.lo = -v.lo;
      v.mid = -v.mid;
      v.hi = -v.hi;
    }
    return v;
  }

  Limb12 limbAdd(Limb12 a, Limb12 b) {
    Limb12 result;
    result.lo = a.lo + b.lo;
    result.mid = a.mid + b.mid;
    result.hi = a.hi + b.hi;
    return limbNormalize(result);
  }

  Limb12 limbSub(Limb12 a, Limb12 b) {
    Limb12 result;
    result.lo = a.lo - b.lo;
    result.mid = a.mid - b.mid;
    result.hi = a.hi - b.hi;
    return limbNormalize(result);
  }

  Limb12 limbMulFloat(Limb12 a, float s) {
    Limb12 result;
    result.lo = a.lo * s;
    result.mid = a.mid * s;
    result.hi = a.hi * s;
    return limbNormalize(result);
  }

  Limb12 limbMul(Limb12 a, Limb12 b) {
    float a0 = a.lo.x;
    float a1 = a.lo.y;
    float a2 = a.lo.z;
    float a3 = a.lo.w;
    float a4 = a.mid.x;
    float a5 = a.mid.y;
    float a6 = a.mid.z;
    float a7 = a.mid.w;
    float a8 = a.hi.x;
    float a9 = a.hi.y;
    float a10 = a.hi.z;
    float a11 = a.hi.w;
    float b0 = b.lo.x;
    float b1 = b.lo.y;
    float b2 = b.lo.z;
    float b3 = b.lo.w;
    float b4 = b.mid.x;
    float b5 = b.mid.y;
    float b6 = b.mid.z;
    float b7 = b.mid.w;
    float b8 = b.hi.x;
    float b9 = b.hi.y;
    float b10 = b.hi.z;
    float b11 = b.hi.w;
${buildLimbMulSource(limbFractional, limbCount)}

    Limb12 result;
    result.lo = vec4(c0, c1, c2, c3);
    result.mid = vec4(c4, c5, c6, c7);
    result.hi = vec4(c8, c9, c10, c11);
    return limbNormalize(result);
  }

  float limbToFloat(Limb12 v) {
    float value = v.hi.w;
    value = value * LIMB_BASE + v.hi.z;
    value = value * LIMB_BASE + v.hi.y;
    value = value * LIMB_BASE + v.hi.x;
    value = value * LIMB_BASE + v.mid.w;
    value = value * LIMB_BASE + v.mid.z;
    value = value * LIMB_BASE + v.mid.y;
    value = value * LIMB_BASE + v.mid.x;
    value = value * LIMB_BASE + v.lo.w;
    value = value * LIMB_BASE + v.lo.z;
    value = value * LIMB_BASE + v.lo.y;
    value = value * LIMB_BASE + v.lo.x;
    return value / LIMB_B4;
  }`
    : '';

  const limbVars = includeLimb
    ? `
    Limb12 realLimb;
    Limb12 imagLimb;
    Limb12 cRealLimb;
    Limb12 cImagLimb;`
    : '';

  const limbInit = includeLimb
    ? `
    if (u_useLimb > 0.5) {
      Limb12 x0L;
      x0L.lo = u_x0_limb_lo;
      x0L.mid = u_x0_limb_mid;
      x0L.hi = u_x0_limb_hi;
      Limb12 y0L;
      y0L.lo = u_y0_limb_lo;
      y0L.mid = u_y0_limb_mid;
      y0L.hi = u_y0_limb_hi;
      Limb12 xScaleL;
      xScaleL.lo = u_xScale_limb_lo;
      xScaleL.mid = u_xScale_limb_mid;
      xScaleL.hi = u_xScale_limb_hi;
      Limb12 yScaleL;
      yScaleL.lo = u_yScale_limb_lo;
      yScaleL.mid = u_yScale_limb_mid;
      yScaleL.hi = u_yScale_limb_hi;

      Limb12 realSeedL = limbAdd(x0L, limbMulFloat(xScaleL, px));
      Limb12 imagSeedL = limbAdd(y0L, limbMulFloat(yScaleL, py));

      if (isJulia > 0.5) {
        realLimb = realSeedL;
        imagLimb = imagSeedL;
        cRealLimb = limbFromFloatScaled(u_julia.x);
        cImagLimb = limbFromFloatScaled(u_julia.y);
      } else {
        realLimb = limbFromFloatScaled(0.0);
        imagLimb = limbFromFloatScaled(0.0);
        cRealLimb = realSeedL;
        cImagLimb = imagSeedL;
      }
      realPart = limbToFloat(realLimb);
      imagPart = limbToFloat(imagLimb);
      cReal = limbToFloat(cRealLimb);
      cImag = limbToFloat(cImagLimb);
      realSeed = limbToFloat(realSeedL);
      imagSeed = limbToFloat(imagSeedL);
    } else`
    : '';

  const limbIter = includeLimb
    ? `
      if (u_useLimb > 0.5) {
        float realFloat = limbToFloat(realLimb);
        float imagFloat = limbToFloat(imagLimb);
        mag = realFloat * realFloat + imagFloat * imagFloat;
        if (mag > 4.0) {
          break;
        }
        Limb12 realSqL = limbMul(realLimb, realLimb);
        Limb12 imagSqL = limbMul(imagLimb, imagLimb);
        Limb12 realNext;
        Limb12 imagNext;
        if (u_algorithm > 1.5 && u_algorithm < 2.5) {
          Limb12 absReal = limbAbs(realLimb);
          Limb12 absImag = limbAbs(imagLimb);
          Limb12 absRealSq = limbMul(absReal, absReal);
          Limb12 absImagSq = limbMul(absImag, absImag);
          realNext = limbAdd(limbSub(absRealSq, absImagSq), cRealLimb);
          Limb12 realImag = limbMul(absReal, absImag);
          imagNext = limbAdd(limbMulFloat(realImag, 2.0), cImagLimb);
        } else if (u_algorithm > 2.5 && u_algorithm < 3.5) {
          realNext = limbAdd(limbSub(realSqL, imagSqL), cRealLimb);
          Limb12 realImag = limbMul(realLimb, imagLimb);
          imagNext = limbSub(cImagLimb, limbMulFloat(realImag, 2.0));
        } else if (u_algorithm > 3.5 && u_algorithm < 4.5) {
          Limb12 realCub = limbSub(
            limbMul(realSqL, realLimb),
            limbMulFloat(limbMul(realLimb, imagSqL), 3.0)
          );
          Limb12 imagCub = limbSub(
            limbMulFloat(limbMul(realSqL, imagLimb), 3.0),
            limbMul(imagSqL, imagLimb)
          );
          realNext = limbAdd(realCub, cRealLimb);
          imagNext = limbAdd(imagCub, cImagLimb);
        } else {
          realNext = limbAdd(limbSub(realSqL, imagSqL), cRealLimb);
          Limb12 realImag = limbMul(realLimb, imagLimb);
          imagNext = limbAdd(limbMulFloat(realImag, 2.0), cImagLimb);
        }
        realLimb = realNext;
        imagLimb = imagNext;
        realPart = limbToFloat(realLimb);
        imagPart = limbToFloat(imagLimb);
        realSq = realPart * realPart;
        imagSq = imagPart * imagPart;
      } else`
    : '';

  return `
  precision ${precision} float;
  precision mediump int;

  uniform vec2 u_resolution;
  uniform float u_x0;
  uniform float u_y0;
  uniform float u_xScale;
  uniform float u_yScale;${limbUniforms}
  uniform float u_x0_hi;
  uniform float u_x0_lo;
  uniform float u_y0_hi;
  uniform float u_y0_lo;
  uniform float u_xScale_hi;
  uniform float u_xScale_lo;
  uniform float u_yScale_hi;
  uniform float u_yScale_lo;
  uniform float u_pscale;
  uniform float u_max;
  uniform float u_paletteSize;
  uniform float u_colourMode;
  uniform bool u_smooth;
  uniform float u_ditherStrength;
  uniform float u_algorithm;
  uniform float u_useDouble;
  uniform vec2 u_julia;
  uniform sampler2D u_palette;

  float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec2 ddFromFloat(float a) {
    return vec2(a, 0.0);
  }

  vec2 ddTwoSum(float a, float b) {
    float s = a + b;
    float bb = s - a;
    float err = (a - (s - bb)) + (b - bb);
    return vec2(s, err);
  }

  vec2 ddAdd(vec2 a, vec2 b) {
    vec2 sum = ddTwoSum(a.x, b.x);
    float err = a.y + b.y + sum.y;
    vec2 res = ddTwoSum(sum.x, err);
    return res;
  }

  vec2 ddSub(vec2 a, vec2 b) {
    return ddAdd(a, vec2(-b.x, -b.y));
  }

  vec2 ddMul(vec2 a, vec2 b) {
    float split = 4097.0;
    float aSplit = a.x * split;
    float aHigh = aSplit - (aSplit - a.x);
    float aLow = a.x - aHigh;
    float bSplit = b.x * split;
    float bHigh = bSplit - (bSplit - b.x);
    float bLow = b.x - bHigh;
    float p = a.x * b.x;
    float err = ((aHigh * bHigh - p) + aHigh * bLow + aLow * bHigh) + aLow * bLow;
    err += a.x * b.y + a.y * b.x;
    vec2 sum = ddTwoSum(p, err);
    return sum;
  }

  vec2 ddAbs(vec2 a) {
    return a.x < 0.0 ? vec2(-a.x, -a.y) : a;
  }

  float ddToFloat(vec2 a) {
    return a.x + a.y;
  }${limbFunctions}

  void main() {
    float px = gl_FragCoord.x;
    float py = u_resolution.y - gl_FragCoord.y;
    float isJulia = step(0.5, u_algorithm) * step(u_algorithm, 1.5);
    float realSeed = u_x0 + px * u_xScale;
    float imagSeed = u_y0 + py * u_yScale;
    float realPart = 0.0;
    float imagPart = 0.0;
    float cReal = 0.0;
    float cImag = 0.0;

    vec2 realDD = vec2(0.0);
    vec2 imagDD = vec2(0.0);
    vec2 cRealDD = vec2(0.0);
    vec2 cImagDD = vec2(0.0);${limbVars}

    ${limbInit} if (u_useDouble > 0.5) {
      vec2 x0DD = vec2(u_x0_hi, u_x0_lo);
      vec2 y0DD = vec2(u_y0_hi, u_y0_lo);
      vec2 xScaleDD = vec2(u_xScale_hi, u_xScale_lo);
      vec2 yScaleDD = vec2(u_yScale_hi, u_yScale_lo);
      vec2 pxDD = ddMul(ddFromFloat(px), xScaleDD);
      vec2 pyDD = ddMul(ddFromFloat(py), yScaleDD);
      vec2 realSeedDD = ddAdd(x0DD, pxDD);
      vec2 imagSeedDD = ddAdd(y0DD, pyDD);

      if (isJulia > 0.5) {
        realDD = realSeedDD;
        imagDD = imagSeedDD;
        cRealDD = ddFromFloat(u_julia.x);
        cImagDD = ddFromFloat(u_julia.y);
      } else {
        realDD = ddFromFloat(0.0);
        imagDD = ddFromFloat(0.0);
        cRealDD = realSeedDD;
        cImagDD = imagSeedDD;
      }
      realPart = ddToFloat(realDD);
      imagPart = ddToFloat(imagDD);
      cReal = ddToFloat(cRealDD);
      cImag = ddToFloat(cImagDD);
      realSeed = ddToFloat(realSeedDD);
      imagSeed = ddToFloat(imagSeedDD);
    } else {
      realSeed = u_x0 + px * u_xScale;
      imagSeed = u_y0 + py * u_yScale;
      realPart = mix(0.0, realSeed, isJulia);
      imagPart = mix(0.0, imagSeed, isJulia);
      cReal = mix(realSeed, u_julia.x, isJulia);
      cImag = mix(imagSeed, u_julia.y, isJulia);
      realDD = ddFromFloat(realPart);
      imagDD = ddFromFloat(imagPart);
      cRealDD = ddFromFloat(cReal);
      cImagDD = ddFromFloat(cImag);
    }

    float realSq = realPart * realPart;
    float imagSq = imagPart * imagPart;
    float iterCount = 0.0;
    float mag = realSq + imagSq;

    for (int i = 0; i < ${maxIterations}; i += 1) {
      if (float(i) >= u_max) {
        break;
      }
      ${limbIter} if (u_useDouble > 0.5) {
        vec2 realSqDD = ddMul(realDD, realDD);
        vec2 imagSqDD = ddMul(imagDD, imagDD);
        mag = ddToFloat(ddAdd(realSqDD, imagSqDD));
        if (mag > 4.0) {
          break;
        }
        vec2 realNext;
        vec2 imagNext;
        if (u_algorithm > 1.5 && u_algorithm < 2.5) {
          vec2 absReal = ddAbs(realDD);
          vec2 absImag = ddAbs(imagDD);
          vec2 absRealSq = ddMul(absReal, absReal);
          vec2 absImagSq = ddMul(absImag, absImag);
          realNext = ddAdd(ddSub(absRealSq, absImagSq), cRealDD);
          vec2 realImag = ddMul(absReal, absImag);
          imagNext = ddAdd(ddAdd(realImag, realImag), cImagDD);
        } else if (u_algorithm > 2.5 && u_algorithm < 3.5) {
          vec2 realSqDD2 = ddMul(realDD, realDD);
          vec2 imagSqDD2 = ddMul(imagDD, imagDD);
          realNext = ddAdd(ddSub(realSqDD2, imagSqDD2), cRealDD);
          vec2 realImag = ddMul(realDD, imagDD);
          imagNext = ddAdd(ddSub(ddFromFloat(0.0), ddAdd(realImag, realImag)), cImagDD);
        } else if (u_algorithm > 3.5 && u_algorithm < 4.5) {
          vec2 realSqDD2 = ddMul(realDD, realDD);
          vec2 imagSqDD2 = ddMul(imagDD, imagDD);
          vec2 realCub = ddSub(ddMul(realSqDD2, realDD), ddMul(ddFromFloat(3.0), ddMul(realDD, imagSqDD2)));
          vec2 imagCub = ddSub(ddMul(ddFromFloat(3.0), ddMul(realSqDD2, imagDD)), ddMul(imagSqDD2, imagDD));
          realNext = ddAdd(realCub, cRealDD);
          imagNext = ddAdd(imagCub, cImagDD);
        } else {
          vec2 realSqDD2 = ddMul(realDD, realDD);
          vec2 imagSqDD2 = ddMul(imagDD, imagDD);
          realNext = ddAdd(ddSub(realSqDD2, imagSqDD2), cRealDD);
          vec2 realImag = ddMul(realDD, imagDD);
          imagNext = ddAdd(ddAdd(realImag, realImag), cImagDD);
        }
        realDD = realNext;
        imagDD = imagNext;
        realPart = ddToFloat(realDD);
        imagPart = ddToFloat(imagDD);
        realSq = realPart * realPart;
        imagSq = imagPart * imagPart;
      } else {
        mag = realSq + imagSq;
        if (mag > 4.0) {
          break;
        }
        if (u_algorithm > 1.5 && u_algorithm < 2.5) {
          float absReal = abs(realPart);
          float absImag = abs(imagPart);
          float absRealSq = absReal * absReal;
          float absImagSq = absImag * absImag;
          realPart = absRealSq - absImagSq + cReal;
          imagPart = 2.0 * absReal * absImag + cImag;
        } else if (u_algorithm > 2.5 && u_algorithm < 3.5) {
          float nextReal = realSq - imagSq + cReal;
          float nextImag = -2.0 * realPart * imagPart + cImag;
          realPart = nextReal;
          imagPart = nextImag;
        } else if (u_algorithm > 3.5 && u_algorithm < 4.5) {
          float nextReal = realSq * realPart - 3.0 * realPart * imagSq + cReal;
          float nextImag = 3.0 * realSq * imagPart - imagSq * imagPart + cImag;
          realPart = nextReal;
          imagPart = nextImag;
        } else {
          float nextReal = realSq - imagSq + cReal;
          float nextImag = 2.0 * realPart * imagPart + cImag;
          realPart = nextReal;
          imagPart = nextImag;
        }
        realSq = realPart * realPart;
        imagSq = imagPart * imagPart;
      }
      iterCount = float(i) + 1.0;
    }

    if (iterCount >= u_max) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    float smoothCount = iterCount;
    if (u_smooth) {
      float logZn = log(realSq + imagSq) / 2.0;
      float nu = log(logZn / log(2.0)) / log(2.0);
      smoothCount = iterCount + 1.0 - nu;
    }

    float scaled = smoothCount * u_pscale;
    if (u_colourMode > 1.5) {
      scaled = clamp(scaled, 0.0, u_paletteSize - 1.0);
    } else if (u_colourMode > 0.5) {
      scaled = mod(scaled, u_paletteSize);
    } else {
      scaled = clamp(scaled, 0.0, u_paletteSize - 1.0);
    }

    if (u_ditherStrength > 0.0) {
      scaled += (rand(vec2(px, py)) - 0.5) * u_ditherStrength;
      scaled = clamp(scaled, 0.0, u_paletteSize - 1.0);
    }

    float index = floor(scaled);
    float t = scaled - index;
    vec4 colourA = texture2D(u_palette, vec2((index + 0.5) / u_paletteSize, 0.5));
    vec4 colourB = texture2D(u_palette, vec2((min(index + 1.0, u_paletteSize - 1.0) + 0.5) / u_paletteSize, 0.5));
    gl_FragColor = vec4(mix(colourA.rgb, colourB.rgb, t), 1.0);
  }
`;
};
