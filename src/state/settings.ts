export type RenderSettings = {
  tileSize: number;
  maxIterations: number;
  smooth: boolean;
  refinementStepsCount: number;
  finalBlockSize: number;
  colorMode: 'normalize' | 'cycle' | 'fixed';
  colorPeriod: number;
  autoMaxIterations: boolean;
  autoIterationsScale: number;
  filterMode: 'none' | 'gaussianSoft' | 'vivid' | 'mono' | 'dither';
  gaussianBlur: number;
  ditherStrength: number;
  paletteSmoothness: number;
  hueRotate: number;
  workerCount: number;
};

export const defaultSettings: RenderSettings = {
  tileSize: 256,
  maxIterations: 256,
  smooth: true,
  refinementStepsCount: 5,
  finalBlockSize: 1,
  colorMode: 'normalize',
  colorPeriod: 256,
  autoMaxIterations: false,
  autoIterationsScale: 128,
  filterMode: 'none',
  gaussianBlur: 0.6,
  ditherStrength: 0.35,
  paletteSmoothness: 0,
  hueRotate: 0,
  workerCount: 8,
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
