export type FractalAlgorithm =
  | 'mandelbrot'
  | 'julia'
  | 'burning-ship'
  | 'tricorn'
  | 'multibrot-3';

export type FractalOption = {
  value: FractalAlgorithm;
  label: string;
};

export const DEFAULT_FRACTAL: FractalAlgorithm = 'mandelbrot';

export const FRACTAL_OPTIONS: FractalOption[] = [
  { value: 'mandelbrot', label: 'Mandelbrot' },
  { value: 'julia', label: 'Julia' },
  { value: 'burning-ship', label: 'Burning Ship' },
  { value: 'tricorn', label: 'Tricorn' },
  { value: 'multibrot-3', label: 'Multibrot (Power 3)' },
];

export const DEFAULT_JULIA = { real: -0.8, imag: 0.156 };

export type FractalView = {
  x: number;
  y: number;
  z: number;
};

export const FRACTAL_DEFAULT_VIEWS: Record<FractalAlgorithm, FractalView> = {
  mandelbrot: { x: -0.5, y: 0, z: 1 },
  julia: { x: 0, y: 0, z: 1.4 },
  'burning-ship': { x: -1.75, y: -0.03, z: 1.2 },
  tricorn: { x: -0.2, y: 0, z: 1.2 },
  'multibrot-3': { x: -0.2, y: 0, z: 1 },
};

export const getDefaultView = (algorithm: FractalAlgorithm): FractalView =>
  FRACTAL_DEFAULT_VIEWS[algorithm] ?? FRACTAL_DEFAULT_VIEWS.mandelbrot;

const algorithmMap: Record<string, FractalAlgorithm> = {
  mandelbrot: 'mandelbrot',
  julia: 'julia',
  'burning-ship': 'burning-ship',
  burningship: 'burning-ship',
  burning_ship: 'burning-ship',
  tricorn: 'tricorn',
  mandelbar: 'tricorn',
  'multibrot-3': 'multibrot-3',
  multibrot3: 'multibrot-3',
  multibrot: 'multibrot-3',
};

export const normaliseAlgorithm = (value?: string | null): FractalAlgorithm => {
  if (!value) {
    return DEFAULT_FRACTAL;
  }
  const key = value.toLowerCase().replaceAll(/[_\s]+/g, '-');
  return algorithmMap[key] ?? DEFAULT_FRACTAL;
};
