export type RenderSettings = {
  tileSize: number;
  maxIterations: number;
  smooth: boolean;
  blockSteps: number[];
};

export const defaultSettings: RenderSettings = {
  tileSize: 256,
  maxIterations: 256,
  smooth: true,
  blockSteps: [256, 64, 16, 4, 1],
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
