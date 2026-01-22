export const START = 'start' as const;
export const STOP = 'stop' as const;

export type WorkerStartMessage = {
  cmd: typeof START;
  renderId: number;
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
};

export type WorkerStopMessage = {
  cmd: typeof STOP;
  renderId: number;
};

export type WorkerRequestMessage = WorkerStartMessage | WorkerStopMessage;

export type WorkerResponseMessage = {
  renderId: number;
  px: number;
  py: number;
  width: number;
  height: number;
  blockSize: number;
  max: number;
  values: number[];
};
