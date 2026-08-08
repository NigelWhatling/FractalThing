import { describe, expect, it } from 'vitest';
import { decimalCoordinateToNumber, parseDecimalCoordinate } from '../viewport';
import { evaluateMandelbrotPoint } from './fractalEvaluators';
import {
  buildMandelbrotReferenceOrbit,
  decimalCoordinateDeltaToNumber,
  evaluateMandelbrotGlitchFallback,
  evaluateMandelbrotPerturbation,
  evaluateMandelbrotPerturbationAt,
  evaluateMandelbrotPointHighPrecision,
  fixedToRoundedNumber,
  selectReferenceFractionBits,
} from './perturbation';

const coordinate = parseDecimalCoordinate;

describe('Mandelbrot perturbation', () => {
  it('selects fixed-point precision from zoom plus guard bits', () => {
    expect(selectReferenceFractionBits(1)).toBe(64);
    expect(selectReferenceFractionBits(1e30)).toBe(164);
    expect(selectReferenceFractionBits(2 ** 80, 32)).toBe(112);
  });

  it('matches direct evaluation for moderate-zoom points', () => {
    const maxIterations = 200;
    const reference = buildMandelbrotReferenceOrbit({
      cReal: coordinate('-0.5'),
      cImag: coordinate('0'),
      zoom: 1,
      maxIterations,
      smooth: true,
    });
    const points = [
      [coordinate('0.5'), coordinate('0.5')],
      [coordinate('-0.4'), coordinate('0.6')],
      [coordinate('-0.5'), coordinate('0')],
    ] as const;

    for (const [cReal, cImag] of points) {
      const result = evaluateMandelbrotPerturbationAt(reference, cReal, cImag);
      expect(result.status).not.toBe('glitched');
      if (result.status === 'glitched') {
        continue;
      }

      const direct = evaluateMandelbrotPoint(
        decimalCoordinateToNumber(cReal),
        decimalCoordinateToNumber(cImag),
        { maxIterations, smooth: true },
      );
      expect(result.value).toBeCloseTo(direct, 12);

      const highPrecision = evaluateMandelbrotPointHighPrecision(cReal, cImag, {
        zoom: 1,
        maxIterations,
        smooth: true,
      });
      expect(highPrecision).toBeCloseTo(direct, 12);
    }
  });

  it('uses direct high precision as a fallback for a deep glitch', () => {
    const zoom = 1e30;
    const maxIterations = 32;
    const reference = buildMandelbrotReferenceOrbit({
      cReal: coordinate('1e-30'),
      cImag: coordinate('0'),
      zoom,
      maxIterations,
      smooth: false,
    });

    expect(reference.fractionBits).toBe(164);
    const result = evaluateMandelbrotPerturbationAt(
      reference,
      coordinate('0'),
      coordinate('0'),
    );
    expect(result).toMatchObject({
      status: 'glitched',
      reason: 'relative-error',
      glitchIteration: 1,
    });

    const fallback = evaluateMandelbrotGlitchFallback(
      reference,
      coordinate('0'),
      coordinate('0'),
    );
    expect(fallback).toBe(maxIterations);
  });

  it('retains a deep pixel delta that disappears in absolute doubles', () => {
    const centre = coordinate('-0.743643887037151');
    const shifted = coordinate('-0.743643887037150999999999999999');

    expect(decimalCoordinateToNumber(shifted)).toBe(
      decimalCoordinateToNumber(centre),
    );
    expect(decimalCoordinateDeltaToNumber(shifted, centre)).toBe(1e-30);
  });

  it('detects glitches when squared reference magnitudes would underflow', () => {
    const centre = coordinate('0');
    const result = evaluateMandelbrotPerturbationAt(
      {
        cReal: centre,
        cImag: centre,
        zoom: 1e200,
        fractionBits: 800,
        maxIterations: 1,
        smooth: false,
        bailoutSquared: 4,
        real: Float64Array.from([0, 1e-200]),
        imag: Float64Array.from([0, 0]),
        escapedAt: null,
      },
      coordinate('-1e-200'),
      centre,
    );

    expect(result).toMatchObject({
      status: 'glitched',
      reason: 'relative-error',
      glitchIteration: 1,
    });

    const subnormalResult = evaluateMandelbrotPerturbation(
      {
        cReal: centre,
        cImag: centre,
        zoom: Number.MAX_VALUE,
        fractionBits: 1088,
        maxIterations: 1,
        smooth: false,
        bailoutSquared: 4,
        real: Float64Array.from([0, 1e-322]),
        imag: Float64Array.from([0, 0]),
        escapedAt: null,
      },
      -1e-322,
      0,
    );
    expect(subnormalResult).toMatchObject({
      status: 'glitched',
      reason: 'relative-error',
      glitchIteration: 1,
    });
  });

  it('preserves representable subnormals at extreme fixed precision', () => {
    expect(fixedToRoundedNumber(1n << 58n, 1088)).toBe(2 ** -1030);

    const oddSubnormalUnits = (1n << 40n) + 1n;
    const justBelowHalfway = oddSubnormalUnits * (1n << 14n) + (1n << 13n) - 1n;
    expect(fixedToRoundedNumber(justBelowHalfway, 1088)).toBe(
      Number(oddSubnormalUnits) * Number.MIN_VALUE,
    );
  });
});
