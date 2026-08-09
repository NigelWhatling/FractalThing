import { describe, expect, it } from 'vitest';
import {
  FLOAT64_SIGNIFICANT_DIGITS,
  splitAtFloat64Boundary,
} from './precisionReadout';

describe('splitAtFloat64Boundary', () => {
  it('leaves shallow coordinates entirely within reach', () => {
    expect(splitAtFloat64Boundary('-0.5')).toEqual({
      sign: '-',
      head: '0.5',
      tail: '',
      exponent: '',
    });
  });

  it('marks a positive value with an explicit sign so columns align', () => {
    expect(splitAtFloat64Boundary('0.25').sign).toBe('+');
  });

  it('splits after 17 significant digits', () => {
    const split = splitAtFloat64Boundary('-0.74364388703715913371');
    expect(split.head).toBe('-0.74364388703715913'.slice(1));
    expect(split.tail).toBe('371');
    expect(split.head.replace(/\D/g, '').replace(/^0+/, '')).toHaveLength(
      FLOAT64_SIGNIFICANT_DIGITS,
    );
  });

  it('does not count leading zeros as significant', () => {
    // 0.000…1 has one significant digit, so 17 of them run far past the point.
    const value = `0.${'0'.repeat(8)}${'1'.repeat(17)}`;
    expect(splitAtFloat64Boundary(value).tail).toBe('');
    expect(splitAtFloat64Boundary(`${value}9`).tail).toBe('9');
  });

  it('keeps the exponent suffix out of the dim run', () => {
    const split = splitAtFloat64Boundary('1.234567890123456789e-30');
    expect(split.head).toBe('1.2345678901234567');
    expect(split.tail).toBe('89');
    expect(split.exponent).toBe('e-30');
  });

  it('handles an exact zero', () => {
    expect(splitAtFloat64Boundary('0')).toEqual({
      sign: '+',
      head: '0',
      tail: '',
      exponent: '',
    });
  });

  it('honours a custom boundary', () => {
    const split = splitAtFloat64Boundary('1.2345', 3);
    expect(split.head).toBe('1.23');
    expect(split.tail).toBe('45');
  });
});
