import { describe, expect, it } from 'vitest';
import {
  DOUBLE_SINGLE_MANTISSA_BITS,
  FLOAT32_MANTISSA_BITS,
} from '../precisionLimits';
import { resolveShaderDoubleBits } from './precisionProbe';

describe('resolveShaderDoubleBits', () => {
  it('preserves a successful measurement', () => {
    expect(resolveShaderDoubleBits(DOUBLE_SINGLE_MANTISSA_BITS)).toBe(
      DOUBLE_SINGLE_MANTISSA_BITS,
    );
  });

  it('falls back conservatively when the probe cannot measure', () => {
    expect(resolveShaderDoubleBits(null)).toBe(FLOAT32_MANTISSA_BITS);
  });
});
