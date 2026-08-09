/**
 * When a rendering path runs out of precision.
 *
 * The old model multiplied a per-backend epsilon by a single blunt constant
 * (512) and warned when the pixel scale fell below it. That is not a physical
 * quantity, and it was wrong in both directions: GPU f32 warned from zoom ~45
 * while still rendering cleanly past 1e5, and GPU double stayed silent until
 * ~4e8 when the image was already a flat colour by 1e8.
 *
 * The criterion here is something you can actually see. Coordinates near
 * magnitude C are representable in steps of `2^-mantissaBits * C`. Divide that
 * step by the width of a pixel and you get how many pixels share a single
 * representable coordinate — the block size. Once a block covers two or more
 * pixels the image is visibly quantised, so that is where we warn.
 */

/** Blocks at or above this many pixels are visible, so this is the warning. */
export const VISIBLE_BLOCK_PIXELS = 2;

export type PrecisionQuery = Readonly<{
  /** World units per pixel — the viewport's xScale/yScale. */
  pixelScale: number;
  /** Magnitude of the coordinate being rendered; steps scale with it. */
  coordinateScale: number;
  /** Significand bits the active path actually delivers. */
  mantissaBits: number;
  /** Current zoom. With `maxIterations`, enables the orbit-accuracy check. */
  zoom?: number;
  /** Iteration cap for this view. */
  maxIterations?: number;
}>;

/** How many pixels one representable step spans. Below 1 means no blocking. */
export const representableBlockPixels = ({
  pixelScale,
  coordinateScale,
  mantissaBits,
}: PrecisionQuery): number => {
  if (!Number.isFinite(pixelScale) || pixelScale <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  const step = 2 ** -mantissaBits * Math.max(1, coordinateScale);
  return step / pixelScale;
};

/**
 * Addressing is only half the problem. A path can hold enough bits to give every
 * pixel a distinct coordinate and still produce a visibly wrong picture, because
 * error compounds along the orbit: near the boundary |dz/dc| is enormous, so a
 * last-bit error in c becomes a wrong escape count. That failure looks like
 * smearing and false detail rather than blocking, which is why the addressing
 * test alone stayed silent on it.
 *
 * Bits needed = enough to separate pixels (log2 zoom) + enough headroom for
 * error growth across the orbit (~log2 of the iteration count).
 *
 * Calibrated against measured renders — f32 clean at 1e4 and blocking at 1e5,
 * double-single clean at 1e10, limb-4 clean at 1e8, limb-8 distorted at 3.7e19 —
 * and independently corroborated: it puts plain f64's limit at ~1e12, which is
 * exactly where this codebase already switches to CPU perturbation.
 */
export const bitsRequired = ({ zoom, maxIterations }: PrecisionQuery): number =>
  Math.log2(Math.max(1, zoom ?? 1)) +
  Math.log2(Math.max(1, maxIterations ?? 1));

/** Slack so views sitting right on the boundary do not flicker a warning. */
export const ORBIT_TOLERANCE_BITS = 2;

export const isOrbitPrecisionExhausted = (query: PrecisionQuery): boolean => {
  if (query.zoom === undefined || query.maxIterations === undefined) {
    return false;
  }
  return bitsRequired(query) > query.mantissaBits + ORBIT_TOLERANCE_BITS;
};

export const isPrecisionExhausted = (
  query: PrecisionQuery,
  visibleBlockPixels: number = VISIBLE_BLOCK_PIXELS,
): boolean =>
  representableBlockPixels(query) >= visibleBlockPixels ||
  isOrbitPrecisionExhausted(query);

/**
 * IEEE-754 binary32 and binary64 significands, including the implicit bit.
 */
export const FLOAT32_MANTISSA_BITS = 24;
export const FLOAT64_MANTISSA_BITS = 53;

/**
 * Two f32s carrying a hi/lo pair. Only reachable if the GLSL compiler preserves
 * Dekker's error-free transformations — see `probeShaderDoubleBits`. Where it
 * does not, the path collapses to plain f32.
 */
export const DOUBLE_SINGLE_MANTISSA_BITS = 46;

/** Nominal fractional bits per limb: limbs are base-1024. */
export const BITS_PER_LIMB = 10;

/**
 * Usable bits per limb, which is less than nominal. `limbMul` keeps only the
 * partial products landing inside the retained window and discards the rest
 * without rounding, so each multiply truncates rather than rounds and the bias
 * accumulates along the orbit. Fitted to the two limb renders measured —
 * 4 limbs clean at 1e8, 8 limbs distorted at 3.7e19 — which bracket this to
 * roughly 9.0–9.5. It is an empirical allowance, not a derivation: making
 * `limbMul` round would remove the need for it.
 */
export const USABLE_BITS_PER_LIMB = 9.25;

export const limbMantissaBits = (fractionalLimbs: number): number =>
  fractionalLimbs * USABLE_BITS_PER_LIMB;
