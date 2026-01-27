import { DEFAULT_PALETTE_STOPS, type PaletteStop } from '../util/PaletteGenerator';

export type RenderSettings = {
  tileSize: number;
  maxIterations: number;
  smooth: boolean;
  refinementStepsCount: number;
  finalBlockSize: number;
  colourMode: 'normalize' | 'distribution' | 'cycle' | 'fixed';
  colourPeriod: number;
  autoMaxIterations: boolean;
  autoIterationsScale: number;
  filterMode: 'none' | 'gaussianSoft' | 'vivid' | 'mono' | 'dither';
  gaussianBlur: number;
  ditherStrength: number;
  paletteSmoothness: number;
  hueRotate: number;
  workerCount: number;
  autoUpdateUrl: boolean;
  renderBackend: 'cpu' | 'gpu';
  gpuPrecision: 'single' | 'double' | 'limb';
  gpuLimbProfile: 'balanced' | 'high' | 'extreme' | 'ultra';
  paletteStops: PaletteStop[];
};

const getDefaultWorkerCount = () => {
  if (typeof navigator === 'undefined') {
    return 8;
  }
  return navigator.hardwareConcurrency || 8;
};

export const defaultSettings: RenderSettings = {
  tileSize: 256,
  maxIterations: 256,
  smooth: true,
  refinementStepsCount: 3,
  finalBlockSize: 1,
  colourMode: 'cycle',
  colourPeriod: 256,
  autoMaxIterations: true,
  autoIterationsScale: 128,
  filterMode: 'none',
  gaussianBlur: 0.6,
  ditherStrength: 0.35,
  paletteSmoothness: 0,
  hueRotate: 0,
  workerCount: getDefaultWorkerCount(),
  autoUpdateUrl: true,
  renderBackend: 'cpu',
  gpuPrecision: 'single',
  gpuLimbProfile: 'balanced',
  paletteStops: DEFAULT_PALETTE_STOPS.map((stop) => ({ ...stop })),
};

export type SettingsAction = {
  type: 'update';
  payload: Partial<RenderSettings>;
};

export const settingsReducer = (
  state: RenderSettings,
  action: SettingsAction
): RenderSettings => {
  switch (action.type) {
    case 'update':
      return { ...state, ...action.payload };
    default:
      return state;
  }
};
