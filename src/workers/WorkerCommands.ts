import type { FractalAlgorithm } from '../util/fractals';
import type { DecimalCoordinate } from '../engine/viewport';

export const START = 'start' as const;
export const STOP = 'stop' as const;

export type WorkerPerturbationData = Readonly<{
  centreReal: DecimalCoordinate;
  centreImag: DecimalCoordinate;
  originReal: DecimalCoordinate;
  originImag: DecimalCoordinate;
  zoom: number;
  glitchThreshold?: number;
}>;

export type WorkerStartMessage = {
  cmd: typeof START;
  renderId: number;
  tileId: number;
  stepIndex: number;
  px: number;
  py: number;
  x0: number;
  y0: number;
  xScale: number;
  yScale: number;
  width: number;
  height: number;
  blockSize: number;
  max: number;
  smooth: boolean;
  algorithm: FractalAlgorithm;
  juliaCr: number;
  juliaCi: number;
  perturbation?: WorkerPerturbationData;
};

export type WorkerStopMessage = {
  cmd: typeof STOP;
  renderId: number;
};

export type WorkerRequestMessage = WorkerStartMessage | WorkerStopMessage;

export type WorkerResponseMessage = {
  renderId: number;
  tileId: number;
  stepIndex: number;
  px: number;
  py: number;
  width: number;
  height: number;
  blockSize: number;
  max: number;
  values: Float64Array;
};
