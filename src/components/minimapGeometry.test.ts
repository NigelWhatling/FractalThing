import { describe, expect, it } from 'vitest';
import { navigationFromView } from '../engine/viewport';
import { calculateMiniMapIndicator } from './minimapGeometry';

const overviewNavigation = navigationFromView({ x: -0.5, y: 0, z: 1 });

const calculate = (zoom: number) =>
  calculateMiniMapIndicator({
    overviewNavigation,
    currentNavigation: navigationFromView({ x: -0.5, y: 0, z: zoom }),
    overviewWidth: 200,
    overviewHeight: 125,
    currentWidth: 1600,
    currentHeight: 1000,
    minimumBoxPixels: 5,
  });

describe('calculateMiniMapIndicator', () => {
  it('shows a viewport box while the region remains visible', () => {
    expect(calculate(2)).toEqual({
      kind: 'box',
      x: 50,
      y: 31.25,
      width: 100,
      height: 62.5,
    });
  });

  it('switches to a downward location arrow below five pixels', () => {
    expect(calculate(50)).toEqual({ kind: 'arrow', x: 100, y: 62.5 });
  });

  it('clamps an off-overview location to the nearest safe arrow point', () => {
    const indicator = calculateMiniMapIndicator({
      overviewNavigation,
      currentNavigation: navigationFromView({ x: 100, y: -100, z: 100 }),
      overviewWidth: 200,
      overviewHeight: 125,
      currentWidth: 1600,
      currentHeight: 1000,
    });

    expect(indicator).toEqual({ kind: 'arrow', x: 192, y: 28 });
  });
});
