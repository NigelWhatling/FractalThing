import PaletteGenerator, { type PaletteStop } from './PaletteGenerator';

/**
 * The interface accent is derived from the active palette, so editing the
 * palette recolours the chrome. See docs/ui-direction.md — this is the reason
 * everything else in the UI is greyscale.
 */

/** Legible neutrals for palettes with no usable chroma to borrow. */
const NEUTRAL_LIGHT: Rgb = [40, 42, 45];
const NEUTRAL_DARK: Rgb = [214, 218, 222];

/** Below this, the best candidate is too grey to read as an accent. */
const MIN_CHROMA_SCORE = 0.04;

/** Samples taken across the palette when hunting for the accent. */
const SAMPLE_COUNT = 41;

/** Accents sit best around here; further away costs the candidate score. */
const TARGET_LIGHTNESS = 0.62;
const LIGHTNESS_PENALTY = 1.4;

/** Focus indicators and active controls need at least non-text contrast. */
const MIN_ACCENT_CONTRAST = 3;

const LIGHT_SURFACE: Rgb = [252, 252, 251];
const DARK_SURFACE: Rgb = [18, 20, 23];

export type Rgb = readonly [number, number, number];

const relativeLuminance = ([r, g, b]: Rgb) => {
  const linearise = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
};

const contrastRatio = (first: Rgb, second: Rgb) => {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Highest-chroma palette colour at a usable lightness. Chroma is what makes an
 * accent read as one; the lightness term keeps it off the near-black and
 * near-white ends where it would disappear against a panel.
 */
export const accentFrom = (
  stops: readonly PaletteStop[],
  theme: 'light' | 'dark',
): Rgb => {
  const samples = PaletteGenerator(SAMPLE_COUNT, [...stops]);
  const surface = theme === 'light' ? LIGHT_SURFACE : DARK_SURFACE;

  let best: Rgb = theme === 'light' ? NEUTRAL_LIGHT : NEUTRAL_DARK;
  let bestScore = -1;

  for (const sample of samples) {
    const [r, g, b] = sample;
    const candidate: Rgb = [r, g, b];
    if (contrastRatio(candidate, surface) < MIN_ACCENT_CONTRAST) {
      continue;
    }
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2 / 255;
    const chroma = (max - min) / 255;
    const score =
      chroma * (1 - Math.abs(lightness - TARGET_LIGHTNESS) * LIGHTNESS_PENALTY);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (bestScore < MIN_CHROMA_SCORE) {
    return theme === 'light' ? NEUTRAL_LIGHT : NEUTRAL_DARK;
  }

  return [Math.round(best[0]), Math.round(best[1]), Math.round(best[2])];
};

/** Space-separated channels, for `rgb(var(--ft-accent-rgb) / 0.12)` washes. */
export const formatAccentChannels = ([r, g, b]: Rgb) => `${r} ${g} ${b}`;
