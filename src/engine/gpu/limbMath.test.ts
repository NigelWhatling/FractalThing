import { describe, expect, it } from 'vitest';
import { parseDecimalCoordinate } from '../viewport';
import {
  buildDecimalLimbVectors,
  buildLimbVectors,
  LIMB_BASE,
  type LimbVectors,
} from './limbMath';

const flatten = ({ lo, mid, hi }: LimbVectors) => [...lo, ...mid, ...hi];

describe('GPU limb conversion', () => {
  it('preserves decimal detail that an absolute double loses', () => {
    const first = parseDecimalCoordinate('-0.743643887037151');
    const second = parseDecimalCoordinate('-0.74364388703715100001');
    expect(Number('-0.743643887037151')).toBe(
      Number('-0.74364388703715100001'),
    );
    expect(buildLimbVectors(Number('-0.743643887037151'), 8)).toEqual(
      buildLimbVectors(Number('-0.74364388703715100001'), 8),
    );
    expect(buildDecimalLimbVectors(first, 8)).not.toEqual(
      buildDecimalLimbVectors(second, 8),
    );
  });

  it('uses balanced base-1024 digits', () => {
    const vectors = buildDecimalLimbVectors(
      parseDecimalCoordinate('1.234567890123456789'),
      8,
    );
    expect(
      flatten(vectors).every((digit) => digit >= -512 && digit < 512),
    ).toBe(true);
    expect(flatten(vectors).some((digit) => digit !== 0)).toBe(true);
    expect(LIMB_BASE).toBe(1024);
  });
});
