import { FRACTAL_OPTIONS, type FractalAlgorithm } from './fractals';

const SITE_NAME = 'Fractal Thing';
export const SITE_URL = 'https://fractalthing.com';
const OG_IMAGE_PATH = '/og-fractal.png';

const DEFAULT_TITLE = `${SITE_NAME} | Interactive Fractal Explorer`;
const DEFAULT_DESCRIPTION =
  'Explore interactive fractals in your browser. Mandelbrot, Julia, Burning Ship, Tricorn, and Multibrot with real-time zoom and palette controls.';

const FRACTAL_LABELS = FRACTAL_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label;
    return acc;
  },
  {} as Record<FractalAlgorithm, string>,
);

const FRACTAL_DESCRIPTIONS: Record<FractalAlgorithm, string> = {
  mandelbrot:
    'Explore the Mandelbrot set with real-time zoom, custom palettes, and high-precision rendering.',
  julia:
    'Explore Julia sets in real time with interactive zoom controls and custom palettes.',
  'burning-ship':
    'Explore the Burning Ship fractal with real-time zoom and palette customization.',
  tricorn:
    'Explore the Tricorn (Mandelbar) fractal with interactive zoom and palette controls.',
  'multibrot-3':
    'Explore the Multibrot (power 3) fractal with real-time zoom and palette controls.',
};

type SeoPayload = {
  title: string;
  description: string;
  canonicalUrl: string;
  ogImageUrl: string;
};

const toAbsoluteUrl = (path: string) =>
  path.startsWith('http') ? path : `${SITE_URL}${path}`;

const upsertMetaTag = (
  key: 'name' | 'property',
  value: string,
  content: string,
) => {
  if (typeof document === 'undefined') return;
  let element = document.querySelector(
    `meta[${key}="${value}"]`,
  ) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(key, value);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
};

const upsertLinkTag = (rel: string, href: string) => {
  if (typeof document === 'undefined') return;
  let element = document.querySelector(
    `link[rel="${rel}"]`,
  ) as HTMLLinkElement | null;
  if (!element) {
    element = document.createElement('link');
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
};

export const buildSeoPayload = (
  algorithm: FractalAlgorithm,
  options: { isRoot: boolean },
): SeoPayload => {
  if (options.isRoot) {
    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      canonicalUrl: `${SITE_URL}/`,
      ogImageUrl: toAbsoluteUrl(OG_IMAGE_PATH),
    };
  }

  const label = FRACTAL_LABELS[algorithm] ?? 'Fractal';

  return {
    title: `${label} Fractal | ${SITE_NAME}`,
    description: FRACTAL_DESCRIPTIONS[algorithm] ?? DEFAULT_DESCRIPTION,
    canonicalUrl: `${SITE_URL}/${algorithm}`,
    ogImageUrl: toAbsoluteUrl(OG_IMAGE_PATH),
  };
};

export const applySeo = (payload: SeoPayload) => {
  if (typeof document === 'undefined') return;

  document.title = payload.title;
  upsertMetaTag('name', 'description', payload.description);
  upsertLinkTag('canonical', payload.canonicalUrl);

  upsertMetaTag('property', 'og:site_name', SITE_NAME);
  upsertMetaTag('property', 'og:type', 'website');
  upsertMetaTag('property', 'og:url', payload.canonicalUrl);
  upsertMetaTag('property', 'og:title', payload.title);
  upsertMetaTag('property', 'og:description', payload.description);
  upsertMetaTag('property', 'og:image', payload.ogImageUrl);

  upsertMetaTag('name', 'twitter:card', 'summary_large_image');
  upsertMetaTag('name', 'twitter:title', payload.title);
  upsertMetaTag('name', 'twitter:description', payload.description);
  upsertMetaTag('name', 'twitter:image', payload.ogImageUrl);
};
