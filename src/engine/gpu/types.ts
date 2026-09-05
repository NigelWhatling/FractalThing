import type { FractalAlgorithm } from '../../util/fractals';
import type { DecimalCoordinate } from '../viewport';

export const WEBGL_MAX_ITERATIONS = 4096;
export const WEBGL_FIXED_PALETTE_ITERATIONS = 2048;

export const WEBGL_LIMB_PROFILE_DEFINITIONS = [
  { id: 'balanced', label: 'Balanced', fractionalLimbs: 4 },
  { id: 'high', label: 'High', fractionalLimbs: 6 },
  { id: 'extreme', label: 'Extreme', fractionalLimbs: 7 },
  { id: 'ultra', label: 'Ultra', fractionalLimbs: 8 },
] as const;

export type WebGLPrecisionMode = 'single' | 'double' | 'limb';

export type WebGLLimbProfileId =
  (typeof WEBGL_LIMB_PROFILE_DEFINITIONS)[number]['id'];

export type WebGLColourMode = 'normalize' | 'distribution' | 'cycle' | 'fixed';

export type WebGLFragmentPrecision = 'highp' | 'mediump';

export type WebGLRenderStatus =
  | 'idle'
  | 'rendering'
  | 'complete'
  | 'cancelled'
  | 'unavailable'
  | 'context-lost'
  | 'error'
  | 'disposed';

export type WebGLBounds = {
  x0: number;
  y0: number;
  xScale: number;
  yScale: number;
  /** Exact origins used by limb shaders when absolute doubles lose detail. */
  preciseX0?: DecimalCoordinate;
  preciseY0?: DecimalCoordinate;
};

export type WebGLJuliaConstant = {
  real: number;
  imag: number;
};

export type WebGLRenderRequest = {
  bounds: WebGLBounds;
  maxIterations: number;
  /**
   * Progressive iteration caps, in display order. The controller clamps them
   * to the shader limit, removes duplicates, and ensures the final cap is run.
   */
  iterationSteps?: readonly number[];
  palette: readonly (readonly number[])[];
  colourMode: WebGLColourMode;
  colourPeriod: number;
  smooth: boolean;
  /** Pass zero unless the dither filter is selected. */
  ditherStrength: number;
  algorithm: FractalAlgorithm;
  precision: WebGLPrecisionMode;
  limbProfile?: WebGLLimbProfileId;
  julia?: WebGLJuliaConstant;
};

export type WebGLRendererCapabilities = {
  available: boolean;
  contextLost: boolean;
  webglVersion: 2;
  fragmentPrecision: WebGLFragmentPrecision | null;
  supportsSinglePrecision: boolean;
  supportsDoubleDoublePrecision: boolean;
  /** Profiles successfully compiled on demand for the current context. */
  supportedLimbProfiles: readonly WebGLLimbProfileId[];
  supportsTimerQuery: boolean;
  maxIterations: number;
  unsupportedColourModes: readonly WebGLColourMode[];
  failureReason: string | null;
};

export type WebGLRenderState = {
  renderId: number | null;
  status: WebGLRenderStatus;
  passIndex: number;
  passCount: number;
  iterationCap: number | null;
  message: string | null;
};

export type WebGLTimingSource = 'cpu-submit' | 'gpu-query';

export type WebGLRenderTiming = {
  renderId: number;
  iterationCap: number;
  source: WebGLTimingSource;
  cpuSubmitMs: number;
  gpuElapsedMs: number | null;
};

export type WebGLRenderSubmission = {
  renderId: number;
  accepted: boolean;
  passCount: number;
  reason: string | null;
};

export type WebGLRendererOptions = {
  onCapabilitiesChange?: (capabilities: WebGLRendererCapabilities) => void;
  onStateChange?: (state: WebGLRenderState) => void;
  onTiming?: (timing: WebGLRenderTiming) => void;
  onError?: (message: string, detail?: unknown) => void;
  /** Re-submit the last accepted request after WebGL restores its context. */
  restoreLastRender?: boolean;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
};
