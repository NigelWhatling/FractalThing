import type { RenderSettings } from '../state/settings';
import PaletteGenerator, { type PaletteStop } from '../util/PaletteGenerator';

export const RENDER_PALETTE_SIZE = 2048;

const smoothPalette = (palette: readonly (readonly number[])[]): number[][] => {
  const smoothed = new Array<number[]>(palette.length);
  for (let index = 0; index < palette.length; index += 1) {
    const previous = palette[Math.max(0, index - 1)];
    const current = palette[index];
    const next = palette[Math.min(palette.length - 1, index + 1)];
    smoothed[index] = [
      (previous[0] + 2 * current[0] + next[0]) / 4,
      (previous[1] + 2 * current[1] + next[1]) / 4,
      (previous[2] + 2 * current[2] + next[2]) / 4,
    ];
  }
  return smoothed;
};

export const createRenderPalette = (
  stops: PaletteStop[],
  smoothness: number,
): number[][] => {
  const palette = PaletteGenerator(RENDER_PALETTE_SIZE, stops);
  const strength = Math.min(1, Math.max(0, smoothness));
  if (strength === 0) {
    return palette;
  }

  const smoothed = smoothPalette(palette);
  if (strength === 1) {
    return smoothed;
  }
  return palette.map((colour, index) => {
    const target = smoothed[index];
    return [
      colour[0] + (target[0] - colour[0]) * strength,
      colour[1] + (target[1] - colour[1]) * strength,
      colour[2] + (target[2] - colour[2]) * strength,
    ];
  });
};

export const calculateEffectiveMaxIterations = (
  settings: Pick<
    RenderSettings,
    'autoMaxIterations' | 'autoIterationsScale' | 'maxIterations'
  >,
  zoom: number,
): number => {
  if (!settings.autoMaxIterations) {
    return settings.maxIterations;
  }
  return Math.max(
    settings.maxIterations,
    Math.round(
      settings.maxIterations +
        settings.autoIterationsScale * Math.log2(Math.max(1, zoom)),
    ),
  );
};

export const createCanvasFilter = (
  settings: Pick<RenderSettings, 'filterMode' | 'gaussianBlur' | 'hueRotate'>,
): string => {
  const filters: string[] = [];
  switch (settings.filterMode) {
    case 'gaussianSoft':
      filters.push(`blur(${Math.max(0, settings.gaussianBlur)}px)`);
      break;
    case 'vivid':
      filters.push('saturate(1.3)', 'contrast(1.15)');
      break;
    case 'mono':
      filters.push('grayscale(1)');
      break;
    default:
      break;
  }
  if (settings.hueRotate !== 0) {
    filters.push(`hue-rotate(${settings.hueRotate}deg)`);
  }
  return filters.length === 0 ? 'none' : filters.join(' ');
};
