import { describe, expect, it } from 'vitest';
import {
  addNumberToDecimalCoordinate,
  computeViewportGeometry,
  formatDecimalCoordinate,
  formatNavigation,
  navigationFromView,
  parseDecimalCoordinate,
  parseNavigation,
} from './viewport';

describe('decimal coordinates', () => {
  it('round-trips ordinary and scientific decimal coordinates exactly', () => {
    for (const value of [
      '-0.74364388703715100000000000000000001',
      '1.25e-40',
      '-1234567890123456789012345',
    ]) {
      expect(
        parseDecimalCoordinate(
          formatDecimalCoordinate(parseDecimalCoordinate(value)),
        ),
      ).toEqual(parseDecimalCoordinate(value));
    }
  });

  it('retains a pan delta below JavaScript number precision', () => {
    const centre = parseDecimalCoordinate('-0.743643887037151');
    const shifted = addNumberToDecimalCoordinate(centre, 1e-30);
    expect(formatDecimalCoordinate(shifted)).toBe(
      '-0.743643887037150999999999999999',
    );
  });
});

describe('navigation', () => {
  it('round-trips a deep link without truncating the centre', () => {
    const source =
      '@-0.74364388703715100000000000000000001,0.13182590420533000000000000000000002x1e+35';
    const parsed = parseNavigation(source, { x: -0.5, y: 0, z: 1 });
    expect(
      parseNavigation(formatNavigation(parsed), { x: 0, y: 0, z: 1 }),
    ).toEqual(parsed);
  });

  it('derives a non-zero pixel scale after ordinary endpoint subtraction would collapse', () => {
    const navigation = navigationFromView({
      x: -0.743643887037151,
      y: 0.13182590420533,
      z: 1e35,
    });
    const geometry = computeViewportGeometry(navigation, 1920, 1080);
    expect(geometry.xScale).toBeGreaterThan(0);
    expect(geometry.yScale).toBeGreaterThan(0);
    expect(geometry.preciseX0).not.toEqual(navigation.x);
  });

  it('rejects hostile decimal sizes before BigInt alignment', () => {
    const fallback = parseDecimalCoordinate('-0.5');
    expect(parseDecimalCoordinate('1e1000000000', fallback)).toEqual(fallback);
    expect(parseDecimalCoordinate('9'.repeat(1025), fallback)).toEqual(
      fallback,
    );
  });
});
