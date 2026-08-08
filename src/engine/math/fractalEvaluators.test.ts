import { describe, expect, it } from 'vitest';
import {
  DISCRETE_BAILOUT_SQUARED,
  SMOOTH_BAILOUT_SQUARED,
  calculateSmoothIteration,
  createPointEvaluator,
  evaluateJuliaPoint,
  evaluateMandelbrotPoint,
  getBailoutSquared,
  isInMandelbrotMainCardioidOrPeriod2Bulb,
} from './fractalEvaluators';

describe('fractal point evaluators', () => {
  it('uses a larger bailout only for smooth escape counts', () => {
    expect(getBailoutSquared(false)).toBe(DISCRETE_BAILOUT_SQUARED);
    expect(getBailoutSquared(true)).toBe(SMOOTH_BAILOUT_SQUARED);
  });

  it('recognises the Mandelbrot main cardioid and period-2 bulb', () => {
    expect(isInMandelbrotMainCardioidOrPeriod2Bulb(0, 0)).toBe(true);
    expect(isInMandelbrotMainCardioidOrPeriod2Bulb(-1, 0)).toBe(true);
    expect(isInMandelbrotMainCardioidOrPeriod2Bulb(0.5, 0.5)).toBe(false);
  });

  it('returns the iteration limit for algebraic and exact periodic interiors', () => {
    const options = { maxIterations: 100, smooth: false };

    expect(evaluateMandelbrotPoint(0, 0, options)).toBe(100);
    expect(evaluateJuliaPoint(1, 0, 0, 0, options)).toBe(100);
  });

  it('selects a specialised evaluator for every supported algorithm', () => {
    const expectedIterations = {
      mandelbrot: 2,
      julia: 1,
      'burning-ship': 2,
      tricorn: 2,
      'multibrot-3': 2,
    } as const;

    for (const [algorithm, expected] of Object.entries(expectedIterations)) {
      const evaluate = createPointEvaluator({
        algorithm: algorithm as keyof typeof expectedIterations,
        maxIterations: 100,
        smooth: false,
        juliaCr: 0,
        juliaCi: 0,
      });

      expect(evaluate(2, 0)).toBe(expected);
    }
  });

  it('normalises smooth counts with the polynomial degree', () => {
    expect(calculateSmoothIteration(10, 65_536, 2)).toBe(8);
    expect(calculateSmoothIteration(10, 65_536, 3)).toBeCloseTo(9.1072107393);
  });

  it('smooths an escape that occurs on the final permitted iteration', () => {
    expect(
      evaluateMandelbrotPoint(2, 0, { maxIterations: 4, smooth: true }),
    ).toBeCloseTo(1.607977764, 9);
  });
});
