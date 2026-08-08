import type { FractalAlgorithm } from '../../util/fractals';
import type { DecimalCoordinate } from '../viewport';

export const CPU_PERTURBATION_ZOOM_THRESHOLD = 1e12;

export type CpuColourMode = 'normalize' | 'distribution' | 'cycle' | 'fixed';

export type CpuBounds = Readonly<{
  x0: number;
  y0: number;
  xScale: number;
  yScale: number;
}>;

export type CpuPerturbationRequest = Readonly<{
  centreReal: DecimalCoordinate;
  centreImag: DecimalCoordinate;
  originReal: DecimalCoordinate;
  originImag: DecimalCoordinate;
  zoom: number;
  glitchThreshold?: number;
}>;

export type CpuRenderRequest = Readonly<{
  bounds: CpuBounds;
  width: number;
  height: number;
  maxIterations: number;
  smooth: boolean;
  algorithm: FractalAlgorithm;
  julia: Readonly<{ real: number; imag: number }>;
  palette: readonly (readonly number[])[];
  colourMode: CpuColourMode;
  colourPeriod: number;
  ditherStrength: number;
  tileSize: number;
  refinementSteps: number;
  finalBlockSize: number;
  perturbation?: CpuPerturbationRequest;
}>;

export type CpuRenderStatus =
  | 'idle'
  | 'rendering'
  | 'complete'
  | 'cancelled'
  | 'unavailable'
  | 'error'
  | 'disposed';

export type CpuRenderState = Readonly<{
  renderId: number | null;
  status: CpuRenderStatus;
  completedJobs: number;
  queuedJobs: number;
  message: string | null;
}>;

export type CpuRenderTiming = Readonly<{
  renderId: number;
  elapsedMs: number;
}>;

export type CpuRenderSubmission = Readonly<{
  renderId: number;
  accepted: boolean;
  reason: string | null;
}>;

export type CpuRendererOptions = Readonly<{
  workerCount?: number;
  rowsPerJob?: number;
  workerFactory?: () => Worker;
  onStateChange?: (state: CpuRenderState) => void;
  onTiming?: (timing: CpuRenderTiming) => void;
  onError?: (message: string, detail?: unknown) => void;
}>;
