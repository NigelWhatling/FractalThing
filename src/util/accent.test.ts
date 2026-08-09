import { describe, expect, it } from 'vitest';
import { accentFrom, formatAccentChannels } from './accent';
import { DEFAULT_PALETTE_STOPS } from './PaletteGenerator';

const chromaOf = ([r, g, b]: readonly [number, number, number]) =>
  (Math.max(r, g, b) - Math.min(r, g, b)) / 255;

describe('accentFrom', () => {
  it('picks a chromatic colour out of the default palette', () => {
    const accent = accentFrom(DEFAULT_PALETTE_STOPS, 'dark');
    expect(chromaOf(accent)).toBeGreaterThan(0.2);
  });

  it('falls back to a legible neutral for a greyscale palette', () => {
    const greyscale = [
      { position: 0, colour: '#000000' },
      { position: 1, colour: '#ffffff' },
    ];
    expect(accentFrom(greyscale, 'dark')).toEqual([214, 218, 222]);
    expect(accentFrom(greyscale, 'light')).toEqual([40, 42, 45]);
  });

  it('rejects a bright palette accent that disappears in the light theme', () => {
    const yellow = [
      { position: 0, colour: '#ffff00' },
      { position: 1, colour: '#ffff00' },
    ];
    expect(accentFrom(yellow, 'light')).toEqual([40, 42, 45]);
    expect(accentFrom(yellow, 'dark')).toEqual([255, 255, 0]);
  });

  it('prefers a mid-lightness colour over an equally saturated dark one', () => {
    const stops = [
      { position: 0, colour: '#110022' },
      { position: 0.5, colour: '#cc44dd' },
      { position: 1, colour: '#110022' },
    ];
    const [r, g, b] = accentFrom(stops, 'dark');
    const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
    expect(lightness).toBeGreaterThan(0.35);
  });

  it('returns integer channels', () => {
    for (const channel of accentFrom(DEFAULT_PALETTE_STOPS, 'dark')) {
      expect(Number.isInteger(channel)).toBe(true);
    }
  });

  it('survives a palette too short to interpolate', () => {
    const accent = accentFrom([{ position: 0, colour: '#ff0000' }], 'dark');
    expect(accent).toHaveLength(3);
  });
});

describe('formatAccentChannels', () => {
  it('emits space-separated channels for rgb() alpha syntax', () => {
    expect(formatAccentChannels([1, 2, 3])).toBe('1 2 3');
  });
});
