import { describe, expect, it } from 'vitest';
import {
  DOUBLE_SINGLE_MANTISSA_BITS,
  FLOAT32_MANTISSA_BITS,
  FLOAT64_MANTISSA_BITS,
  isOrbitPrecisionExhausted,
  isPrecisionExhausted,
  limbMantissaBits,
  representableBlockPixels,
} from './precisionLimits';

/** Pixel width for a 1240px-wide viewport at the given zoom, aspect ~1.55. */
const pixelScaleAt = (zoom: number) => (2 * 1.55) / (1240 * zoom);

const f32At = (zoom: number) => ({
  pixelScale: pixelScaleAt(zoom),
  coordinateScale: 1,
  mantissaBits: FLOAT32_MANTISSA_BITS,
});

describe('representableBlockPixels', () => {
  it('reports sub-pixel blocks while precision is ample', () => {
    expect(representableBlockPixels(f32At(1e4))).toBeLessThan(1);
  });

  it('matches the block size measured on real GPU output', () => {
    // Measured on an RTX 4070 via ANGLE: f32 at 1e6 gave adjacentSame 0.961,
    // i.e. runs of ~25 identical pixels.
    const blocks = representableBlockPixels(f32At(1e6));
    expect(blocks).toBeGreaterThan(15);
    expect(blocks).toBeLessThan(40);
  });

  it('treats a non-positive pixel scale as fully exhausted', () => {
    expect(representableBlockPixels({ ...f32At(1e6), pixelScale: 0 })).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('scales the step with coordinate magnitude', () => {
    const near = representableBlockPixels({
      ...f32At(1e6),
      coordinateScale: 1,
    });
    const far = representableBlockPixels({ ...f32At(1e6), coordinateScale: 8 });
    expect(far).toBeCloseTo(near * 8, 5);
  });

  it('ignores coordinate scales below one', () => {
    expect(
      representableBlockPixels({ ...f32At(1e6), coordinateScale: 0.01 }),
    ).toBeCloseTo(representableBlockPixels(f32At(1e6)), 10);
  });
});

describe('isPrecisionExhausted', () => {
  it('stays quiet where f32 still renders cleanly', () => {
    // Measured healthy: 576 distinct colours, no visible blocking.
    expect(isPrecisionExhausted(f32At(1e4))).toBe(false);
  });

  it('fires once f32 blocks span whole pixels', () => {
    expect(isPrecisionExhausted(f32At(1e6))).toBe(true);
  });

  it('fires for double-single well before the old 4e8 threshold', () => {
    // Measured dead at 1e8 (3 distinct colours) yet unwarned by the old model.
    const ddAt = (zoom: number) => ({
      pixelScale: pixelScaleAt(zoom),
      coordinateScale: 1,
      mantissaBits: DOUBLE_SINGLE_MANTISSA_BITS,
    });
    expect(isPrecisionExhausted(ddAt(1e8))).toBe(false);
    expect(isPrecisionExhausted(ddAt(1e12))).toBe(true);
  });

  it('degrades to the f32 threshold when the GPU folds the dd split', () => {
    // What this hardware actually delivers: dd collapses to f32 resolution.
    const collapsed = {
      pixelScale: pixelScaleAt(1e6),
      coordinateScale: 1,
      mantissaBits: FLOAT32_MANTISSA_BITS,
    };
    expect(isPrecisionExhausted(collapsed)).toBe(true);
  });

  it('gives deeper limb profiles more headroom', () => {
    // 40-bit limbs still resolve 1e9 (blocks of ~0.4px); they give out near 5e9.
    const at = (limbs: number) => ({
      pixelScale: pixelScaleAt(1e10),
      coordinateScale: 1,
      mantissaBits: limbMantissaBits(limbs),
    });
    expect(isPrecisionExhausted(at(4))).toBe(true);
    expect(isPrecisionExhausted(at(8))).toBe(false);
  });

  it('honours a custom visible-block threshold', () => {
    expect(isPrecisionExhausted(f32At(1e5), 1)).toBe(true);
    expect(isPrecisionExhausted(f32At(1e5), 64)).toBe(false);
  });
});

/**
 * Every case below is a render that was actually measured in the browser, so
 * these lock the model to observed behaviour rather than to theory.
 */
describe('orbit accuracy against measured renders', () => {
  const iterationsAt = (zoom: number) => 256 + 128 * Math.log2(zoom);

  const check = (mantissaBits: number, zoom: number) =>
    isPrecisionExhausted({
      pixelScale: pixelScaleAt(zoom),
      coordinateScale: 1,
      mantissaBits,
      zoom,
      maxIterations: iterationsAt(zoom),
    });

  it('f32 is quiet at 1e4 and warns by 1e5', () => {
    expect(check(FLOAT32_MANTISSA_BITS, 1e4)).toBe(false);
    expect(check(FLOAT32_MANTISSA_BITS, 1e5)).toBe(true);
  });

  it('double-single is quiet at 1e10 once the split works', () => {
    expect(check(DOUBLE_SINGLE_MANTISSA_BITS, 1e10)).toBe(false);
  });

  it('puts f64 at the zoom where the CPU switches to perturbation', () => {
    // Independent corroboration: 1e12 is CPU_PERTURBATION_ZOOM_THRESHOLD.
    expect(check(FLOAT64_MANTISSA_BITS, 1e12)).toBe(false);
    expect(check(FLOAT64_MANTISSA_BITS, 1e13)).toBe(true);
  });

  it('is quiet for 4 limbs at 1e8, which rendered cleanly', () => {
    expect(check(limbMantissaBits(4), 1e8)).toBe(false);
  });

  it('warns for 8 limbs at 3.7e19, which rendered distorted', () => {
    // The view that prompted this: visibly wrong, yet unwarned, and not
    // blocked — adjacentSame was 0.045, so addressing alone never caught it.
    expect(check(limbMantissaBits(8), 3.6893488147419103e19)).toBe(true);
  });

  it('catches orbit failure even where addressing is comfortable', () => {
    const zoom = 3.6893488147419103e19;
    const query = {
      pixelScale: pixelScaleAt(zoom),
      coordinateScale: 1,
      mantissaBits: limbMantissaBits(8),
      zoom,
      maxIterations: iterationsAt(zoom),
    };
    expect(representableBlockPixels(query)).toBeLessThan(1);
    expect(isOrbitPrecisionExhausted(query)).toBe(true);
  });
});
