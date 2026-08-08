import { describe, expect, it } from 'vitest';
import {
  calculateEffectiveMaxIterations,
  createCanvasFilter,
  createRenderPalette,
  RENDER_PALETTE_SIZE,
} from './renderPresentation';

describe('render presentation', () => {
  it('builds a complete render palette', () => {
    const palette = createRenderPalette(
      [
        { position: 0, colour: '#000000' },
        { position: 1, colour: '#ffffff' },
      ],
      0,
    );
    expect(palette).toHaveLength(RENDER_PALETTE_SIZE + 1);
    expect(palette[0]).toEqual([0, 0, 0]);
    expect(palette[palette.length - 1]).toEqual([255, 255, 255]);
  });

  it('scales automatic iterations logarithmically', () => {
    expect(
      calculateEffectiveMaxIterations(
        {
          autoMaxIterations: true,
          autoIterationsScale: 32,
          maxIterations: 128,
        },
        16,
      ),
    ).toBe(256);
  });

  it('combines presentation filters', () => {
    expect(
      createCanvasFilter({
        filterMode: 'vivid',
        gaussianBlur: 1,
        hueRotate: 15,
      }),
    ).toBe('saturate(1.3) contrast(1.15) hue-rotate(15deg)');
  });
});
