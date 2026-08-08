import { describe, expect, it, vi } from 'vitest';

import type { PalettePreset } from '../../util/palettes';
import { storePalettePresets } from './usePaletteEditor';

const palettes: PalettePreset[] = [
  {
    id: 'custom-test',
    name: 'Test',
    stops: [
      { position: 0, colour: '#000000' },
      { position: 1, colour: '#ffffff' },
    ],
  },
];

describe('storePalettePresets', () => {
  it('serialises custom palettes to the expected storage key', () => {
    const setItem = vi.fn();

    expect(storePalettePresets({ setItem }, palettes)).toBe(true);
    expect(setItem).toHaveBeenCalledWith(
      'fractal:palettes',
      JSON.stringify(palettes),
    );
  });

  it('reports storage failures without throwing', () => {
    const storage = {
      setItem: () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      },
    };

    let stored: boolean | undefined;
    expect(() => {
      stored = storePalettePresets(storage, palettes);
    }).not.toThrow();
    expect(stored).toBe(false);
  });
});
