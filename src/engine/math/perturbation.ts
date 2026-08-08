import type { DecimalCoordinate } from '../viewport';
import {
  calculateSmoothIteration,
  getBailoutSquared,
} from './fractalEvaluators';

export const DEFAULT_REFERENCE_GUARD_BITS = 64;
export const MIN_REFERENCE_FRACTION_BITS = 64;
export const DEFAULT_GLITCH_THRESHOLD = 1e-6;

export type PerturbationPrecisionOptions = Readonly<{
  zoom: number;
  guardBits?: number;
  fractionBits?: number;
}>;

export type ReferenceOrbitOptions = PerturbationPrecisionOptions &
  Readonly<{
    cReal: DecimalCoordinate;
    cImag: DecimalCoordinate;
    maxIterations: number;
    smooth: boolean;
  }>;

export type MandelbrotReferenceOrbit = Readonly<{
  cReal: DecimalCoordinate;
  cImag: DecimalCoordinate;
  zoom: number;
  fractionBits: number;
  maxIterations: number;
  smooth: boolean;
  bailoutSquared: number;
  real: Float64Array;
  imag: Float64Array;
  escapedAt: number | null;
}>;

export type PerturbationEvaluationOptions = Readonly<{
  maxIterations?: number;
  glitchThreshold?: number;
}>;

export type PerturbationValueResult = Readonly<{
  status: 'escaped' | 'bounded';
  value: number;
  iterations: number;
  deltaReal: number;
  deltaImag: number;
}>;

export type PerturbationGlitchResult = Readonly<{
  status: 'glitched';
  reason: 'relative-error' | 'non-finite' | 'reference-exhausted';
  glitchIteration: number;
  deltaReal: number;
  deltaImag: number;
}>;

export type PerturbationResult =
  PerturbationValueResult | PerturbationGlitchResult;

export type HighPrecisionPointOptions = PerturbationPrecisionOptions &
  Readonly<{
    maxIterations: number;
    smooth: boolean;
  }>;

const assertNonNegativeInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
};

const assertPositiveFinite = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
};

export const selectReferenceFractionBits = (
  zoom: number,
  guardBits = DEFAULT_REFERENCE_GUARD_BITS,
): number => {
  assertPositiveFinite(zoom, 'zoom');
  assertNonNegativeInteger(guardBits, 'guardBits');

  const zoomBits = Math.max(0, Math.ceil(Math.log2(zoom)));
  return Math.max(MIN_REFERENCE_FRACTION_BITS, zoomBits + guardBits);
};

const resolveFractionBits = ({
  zoom,
  guardBits = DEFAULT_REFERENCE_GUARD_BITS,
  fractionBits,
}: PerturbationPrecisionOptions): number => {
  if (fractionBits === undefined) {
    return selectReferenceFractionBits(zoom, guardBits);
  }

  assertPositiveFinite(zoom, 'zoom');
  assertNonNegativeInteger(fractionBits, 'fractionBits');
  if (fractionBits === 0) {
    throw new RangeError('fractionBits must be greater than zero.');
  }
  return fractionBits;
};

const divideRounded = (numerator: bigint, denominator: bigint): bigint => {
  if (numerator === 0n) {
    return 0n;
  }

  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  let rounded = magnitude / denominator;
  const remainder = magnitude % denominator;
  const doubledRemainder = remainder * 2n;
  if (
    doubledRemainder > denominator ||
    (doubledRemainder === denominator && (rounded & 1n) === 1n)
  ) {
    rounded += 1n;
  }
  return negative ? -rounded : rounded;
};

export const decimalCoordinateToFixed = (
  coordinate: DecimalCoordinate,
  fractionBits: number,
): bigint => {
  assertNonNegativeInteger(fractionBits, 'fractionBits');
  const scale = 1n << BigInt(fractionBits);

  if (coordinate.exponent >= 0) {
    return coordinate.coefficient * 10n ** BigInt(coordinate.exponent) * scale;
  }

  const denominator = 10n ** BigInt(-coordinate.exponent);
  return divideRounded(coordinate.coefficient * scale, denominator);
};

export const fixedToRoundedNumber = (
  value: bigint,
  fractionBits: number,
): number => {
  assertNonNegativeInteger(fractionBits, 'fractionBits');
  if (value === 0n) {
    return 0;
  }

  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const bitLength = magnitude.toString(2).length;

  if (fractionBits > 1022 && bitLength <= fractionBits - 1022) {
    const unitShift = fractionBits - 1074;
    const subnormalUnits =
      unitShift >= 0
        ? divideRounded(magnitude, 1n << BigInt(unitShift))
        : magnitude << BigInt(-unitShift);
    const subnormal = Number(subnormalUnits) * Number.MIN_VALUE;
    return negative ? -subnormal : subnormal;
  }

  const shift = Math.max(0, bitLength - 53);
  let significant = magnitude >> BigInt(shift);

  if (shift > 0) {
    const discarded = magnitude - (significant << BigInt(shift));
    const halfway = 1n << BigInt(shift - 1);
    if (
      discarded > halfway ||
      (discarded === halfway && (significant & 1n) === 1n)
    ) {
      significant += 1n;
    }
  }

  const result = Number(significant) * 2 ** (shift - fractionBits);
  return negative ? -result : result;
};

export const decimalCoordinateDeltaToNumber = (
  value: DecimalCoordinate,
  reference: DecimalCoordinate,
): number => {
  const exponent = Math.min(value.exponent, reference.exponent);
  const valueScale = 10n ** BigInt(value.exponent - exponent);
  const referenceScale = 10n ** BigInt(reference.exponent - exponent);
  const coefficient =
    value.coefficient * valueScale - reference.coefficient * referenceScale;
  return Number(`${coefficient}e${exponent}`);
};

const fixedMagnitudeExceeds = (
  real: bigint,
  imag: bigint,
  scale: bigint,
  bailoutSquared: number,
): boolean =>
  real * real + imag * imag > BigInt(bailoutSquared) * scale * scale;

export const buildMandelbrotReferenceOrbit = (
  options: ReferenceOrbitOptions,
): MandelbrotReferenceOrbit => {
  assertNonNegativeInteger(options.maxIterations, 'maxIterations');
  const fractionBits = resolveFractionBits(options);
  const scale = 1n << BigInt(fractionBits);
  const fixedCReal = decimalCoordinateToFixed(options.cReal, fractionBits);
  const fixedCImag = decimalCoordinateToFixed(options.cImag, fractionBits);
  const bailoutSquared = getBailoutSquared(options.smooth);
  const real = new Float64Array(options.maxIterations + 1);
  const imag = new Float64Array(options.maxIterations + 1);

  let fixedReal = 0n;
  let fixedImag = 0n;
  let escapedAt: number | null = null;
  let orbitLength = 1;

  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    const nextReal =
      divideRounded(fixedReal * fixedReal - fixedImag * fixedImag, scale) +
      fixedCReal;
    const nextImag =
      divideRounded(2n * fixedReal * fixedImag, scale) + fixedCImag;
    fixedReal = nextReal;
    fixedImag = nextImag;
    real[iteration] = fixedToRoundedNumber(fixedReal, fractionBits);
    imag[iteration] = fixedToRoundedNumber(fixedImag, fractionBits);
    orbitLength = iteration + 1;

    if (fixedMagnitudeExceeds(fixedReal, fixedImag, scale, bailoutSquared)) {
      escapedAt = iteration;
      break;
    }
  }

  return {
    cReal: options.cReal,
    cImag: options.cImag,
    zoom: options.zoom,
    fractionBits,
    maxIterations: options.maxIterations,
    smooth: options.smooth,
    bailoutSquared,
    real: orbitLength === real.length ? real : real.slice(0, orbitLength),
    imag: orbitLength === imag.length ? imag : imag.slice(0, orbitLength),
    escapedAt,
  };
};

const glitched = (
  reason: PerturbationGlitchResult['reason'],
  glitchIteration: number,
  deltaReal: number,
  deltaImag: number,
): PerturbationGlitchResult => ({
  status: 'glitched',
  reason,
  glitchIteration,
  deltaReal,
  deltaImag,
});

export const evaluateMandelbrotPerturbation = (
  reference: MandelbrotReferenceOrbit,
  deltaCReal: number,
  deltaCImag: number,
  options: PerturbationEvaluationOptions = {},
): PerturbationResult => {
  const maxIterations = options.maxIterations ?? reference.maxIterations;
  const glitchThreshold = options.glitchThreshold ?? DEFAULT_GLITCH_THRESHOLD;
  assertNonNegativeInteger(maxIterations, 'maxIterations');
  if (!Number.isFinite(glitchThreshold) || glitchThreshold < 0) {
    throw new RangeError(
      'glitchThreshold must be a non-negative finite number.',
    );
  }
  if (!Number.isFinite(deltaCReal) || !Number.isFinite(deltaCImag)) {
    return glitched('non-finite', 0, deltaCReal, deltaCImag);
  }
  const glitchMagnitudeRatio = Math.sqrt(glitchThreshold);

  let deltaReal = 0;
  let deltaImag = 0;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const nextIteration = iteration + 1;
    if (nextIteration >= reference.real.length) {
      return glitched(
        'reference-exhausted',
        nextIteration,
        deltaReal,
        deltaImag,
      );
    }

    const referenceReal = reference.real[iteration];
    const referenceImag = reference.imag[iteration];
    const nextDeltaReal =
      2 * (referenceReal * deltaReal - referenceImag * deltaImag) +
      deltaReal * deltaReal -
      deltaImag * deltaImag +
      deltaCReal;
    const nextDeltaImag =
      2 * (referenceReal * deltaImag + referenceImag * deltaReal) +
      2 * deltaReal * deltaImag +
      deltaCImag;
    deltaReal = nextDeltaReal;
    deltaImag = nextDeltaImag;

    const actualReal = reference.real[nextIteration] + deltaReal;
    const actualImag = reference.imag[nextIteration] + deltaImag;
    if (
      !Number.isFinite(deltaReal) ||
      !Number.isFinite(deltaImag) ||
      !Number.isFinite(actualReal) ||
      !Number.isFinite(actualImag)
    ) {
      return glitched('non-finite', nextIteration, deltaReal, deltaImag);
    }

    const actualMagnitude = Math.hypot(actualReal, actualImag);
    const nextReferenceReal = reference.real[nextIteration];
    const nextReferenceImag = reference.imag[nextIteration];
    const referenceMagnitude = Math.hypot(nextReferenceReal, nextReferenceImag);

    if (
      referenceMagnitude > 0 &&
      actualMagnitude / referenceMagnitude < glitchMagnitudeRatio
    ) {
      return glitched('relative-error', nextIteration, deltaReal, deltaImag);
    }

    if (actualMagnitude > Math.sqrt(reference.bailoutSquared)) {
      return {
        status: 'escaped',
        value: reference.smooth
          ? calculateSmoothIteration(
              nextIteration,
              actualMagnitude * actualMagnitude,
              2,
            )
          : nextIteration,
        iterations: nextIteration,
        deltaReal,
        deltaImag,
      };
    }
  }

  return {
    status: 'bounded',
    value: maxIterations,
    iterations: maxIterations,
    deltaReal,
    deltaImag,
  };
};

export const evaluateMandelbrotPerturbationAt = (
  reference: MandelbrotReferenceOrbit,
  cReal: DecimalCoordinate,
  cImag: DecimalCoordinate,
  options: PerturbationEvaluationOptions = {},
): PerturbationResult =>
  evaluateMandelbrotPerturbation(
    reference,
    decimalCoordinateDeltaToNumber(cReal, reference.cReal),
    decimalCoordinateDeltaToNumber(cImag, reference.cImag),
    options,
  );

export const evaluateMandelbrotPointHighPrecision = (
  cReal: DecimalCoordinate,
  cImag: DecimalCoordinate,
  options: HighPrecisionPointOptions,
): number => {
  assertNonNegativeInteger(options.maxIterations, 'maxIterations');
  const fractionBits = resolveFractionBits(options);
  const scale = 1n << BigInt(fractionBits);
  const fixedCReal = decimalCoordinateToFixed(cReal, fractionBits);
  const fixedCImag = decimalCoordinateToFixed(cImag, fractionBits);
  const bailoutSquared = getBailoutSquared(options.smooth);
  let fixedReal = 0n;
  let fixedImag = 0n;

  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    const nextReal =
      divideRounded(fixedReal * fixedReal - fixedImag * fixedImag, scale) +
      fixedCReal;
    const nextImag =
      divideRounded(2n * fixedReal * fixedImag, scale) + fixedCImag;
    fixedReal = nextReal;
    fixedImag = nextImag;

    if (fixedMagnitudeExceeds(fixedReal, fixedImag, scale, bailoutSquared)) {
      if (!options.smooth) {
        return iteration;
      }

      const real = fixedToRoundedNumber(fixedReal, fractionBits);
      const imag = fixedToRoundedNumber(fixedImag, fractionBits);
      return calculateSmoothIteration(iteration, real * real + imag * imag, 2);
    }
  }

  return options.maxIterations;
};

export const evaluateMandelbrotGlitchFallback = (
  reference: MandelbrotReferenceOrbit,
  cReal: DecimalCoordinate,
  cImag: DecimalCoordinate,
  maxIterations = reference.maxIterations,
): number =>
  evaluateMandelbrotPointHighPrecision(cReal, cImag, {
    zoom: reference.zoom,
    fractionBits: reference.fractionBits,
    maxIterations,
    smooth: reference.smooth,
  });
