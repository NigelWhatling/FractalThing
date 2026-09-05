import {
  START,
  type WorkerPerturbationData,
  type WorkerResponseMessage,
  type WorkerStartMessage,
} from '../../workers/WorkerCommands';
import type {
  CpuRenderRequest,
  CpuRendererOptions,
  CpuRenderState,
  CpuRenderSubmission,
} from './types';
import type { DecimalCoordinate } from '../viewport';

const BASE_BLOCK_SIZE = 256;
const FIXED_PALETTE_ITERATIONS = 2048;

export const resolveCpuWorkerPerturbation = (
  request: Pick<CpuRenderRequest, 'algorithm' | 'perturbation'>,
): WorkerPerturbationData | undefined =>
  request.algorithm === 'mandelbrot' ? request.perturbation : undefined;

type Tile = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  stepIndex: number;
  inFlight: boolean;
};

type RenderConfig = {
  request: CpuRenderRequest;
  renderId: number;
  blockSteps: readonly number[];
  paletteScale: number;
};

type WorkerJob = {
  message: WorkerStartMessage;
};

type WorkerSlot = {
  worker: Worker;
  busy: boolean;
};

type PanShift = { dx: number; dy: number };

const palettesEqual = (
  first: CpuRenderRequest['palette'],
  second: CpuRenderRequest['palette'],
): boolean =>
  first === second ||
  (first.length === second.length &&
    first.every(
      (colour, index) =>
        colour.length === second[index]?.length &&
        colour.every((channel, channelIndex) =>
          Object.is(channel, second[index]?.[channelIndex]),
        ),
    ));

export const areCpuRequestsPanReuseCompatible = (
  first: CpuRenderRequest,
  second: CpuRenderRequest,
): boolean =>
  first.width === second.width &&
  first.height === second.height &&
  first.bounds.xScale === second.bounds.xScale &&
  first.bounds.yScale === second.bounds.yScale &&
  first.maxIterations === second.maxIterations &&
  first.smooth === second.smooth &&
  first.algorithm === second.algorithm &&
  first.julia.real === second.julia.real &&
  first.julia.imag === second.julia.imag &&
  first.colourMode === second.colourMode &&
  first.colourPeriod === second.colourPeriod &&
  first.ditherStrength === second.ditherStrength &&
  first.tileSize === second.tileSize &&
  first.refinementSteps === second.refinementSteps &&
  first.finalBlockSize === second.finalBlockSize &&
  Boolean(first.perturbation) === Boolean(second.perturbation) &&
  first.perturbation?.zoom === second.perturbation?.zoom &&
  first.perturbation?.glitchThreshold ===
    second.perturbation?.glitchThreshold &&
  palettesEqual(first.palette, second.palette);

const coordinatesEqual = (
  first: DecimalCoordinate | undefined,
  second: DecimalCoordinate | undefined,
): boolean =>
  first?.coefficient === second?.coefficient &&
  first?.exponent === second?.exponent;

/** Colour mapping can change without invalidating the completed escape values. */
const canRecolourCpuRequest = (
  first: CpuRenderRequest,
  second: CpuRenderRequest,
): boolean =>
  areCpuRequestsPanReuseCompatible(first, {
    ...second,
    palette: first.palette,
    colourMode: first.colourMode,
    colourPeriod: first.colourPeriod,
    ditherStrength: first.ditherStrength,
  }) &&
  first.bounds.x0 === second.bounds.x0 &&
  first.bounds.y0 === second.bounds.y0 &&
  coordinatesEqual(
    first.perturbation?.centreReal,
    second.perturbation?.centreReal,
  ) &&
  coordinatesEqual(
    first.perturbation?.centreImag,
    second.perturbation?.centreImag,
  ) &&
  coordinatesEqual(
    first.perturbation?.originReal,
    second.perturbation?.originReal,
  ) &&
  coordinatesEqual(
    first.perturbation?.originImag,
    second.perturbation?.originImag,
  );

export const buildCpuBlockSteps = (
  stepsCount: number,
  finalBlockSize: number,
): number[] => {
  const clampedSteps = Math.max(1, Math.round(stepsCount));
  const clampedFinal = Math.min(
    BASE_BLOCK_SIZE,
    Math.max(1, Math.round(finalBlockSize)),
  );
  if (clampedSteps === 1) {
    return [clampedFinal];
  }

  const start = Math.log(BASE_BLOCK_SIZE);
  const end = Math.log(clampedFinal);
  const step = (end - start) / (clampedSteps - 1);
  const steps = new Array<number>(clampedSteps);
  for (let index = 0; index < clampedSteps; index += 1) {
    steps[index] = Math.round(Math.exp(start + step * index));
  }
  steps[0] = BASE_BLOCK_SIZE;
  steps[clampedSteps - 1] = clampedFinal;
  for (let index = 1; index < steps.length; index += 1) {
    if (steps[index] >= steps[index - 1]) {
      steps[index] = Math.max(clampedFinal, steps[index - 1] - 1);
    }
  }
  return steps;
};

export const shiftCpuValueBuffer = (
  buffer: Float64Array,
  dx: number,
  dy: number,
  width: number,
  height: number,
): Float64Array => {
  const shifted = new Float64Array(buffer.length);
  shifted.fill(Number.NaN);
  for (let y = 0; y < height; y += 1) {
    const shiftedY = y + dy;
    if (shiftedY < 0 || shiftedY >= height) {
      continue;
    }
    const rowOffset = y * width;
    const shiftedRowOffset = shiftedY * width;
    for (let x = 0; x < width; x += 1) {
      const shiftedX = x + dx;
      if (shiftedX >= 0 && shiftedX < width) {
        shifted[shiftedRowOffset + shiftedX] = buffer[rowOffset + x];
      }
    }
  }
  return shifted;
};

const lerpRgb = (
  first: readonly number[],
  second: readonly number[],
  amount: number,
): [number, number, number] => [
  first[0] + (second[0] - first[0]) * amount,
  first[1] + (second[1] - first[1]) * amount,
  first[2] + (second[2] - first[2]) * amount,
];

const hash2d = (x: number, y: number): number => {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43_758.5453;
  return value - Math.floor(value);
};

export const resolveCpuPalettePosition = (
  scaled: number,
  paletteSize: number,
  cycle: boolean,
): Readonly<{
  paletteIndex: number;
  firstIndex: number;
  nextIndex: number;
  amount: number;
}> => {
  if (cycle) {
    const base = Math.floor(scaled);
    const firstIndex = ((base % paletteSize) + paletteSize) % paletteSize;
    return {
      paletteIndex: firstIndex,
      firstIndex,
      nextIndex: (firstIndex + 1) % paletteSize,
      amount: scaled - base,
    };
  }

  const clamped = Math.min(paletteSize - 1, Math.max(0, scaled));
  const paletteIndex = Math.floor(clamped);
  const firstIndex = Math.min(paletteSize - 2, paletteIndex);
  return {
    paletteIndex,
    firstIndex,
    nextIndex: firstIndex + 1,
    amount: clamped - firstIndex,
  };
};

export class CpuRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly scratchCanvas: HTMLCanvasElement;
  private readonly workerFactory: () => Worker;
  private readonly rowsPerJob: number;
  private readonly onStateChange?: CpuRendererOptions['onStateChange'];
  private readonly onTiming?: CpuRendererOptions['onTiming'];
  private readonly onError?: CpuRendererOptions['onError'];
  private workerSlots: WorkerSlot[] = [];
  private workerCount: number;
  private jobs: WorkerJob[] = [];
  private jobHead = 0;
  private pendingByTask = new Map<string, number>();
  private tiles = new Map<number, Tile>();
  private nextTileId = 1;
  private renderConfig: RenderConfig | null = null;
  private renderId = 0;
  private completedJobs = 0;
  private finalPassStartedAt: number | null = null;
  private iterationBuffer: Float64Array | null = null;
  private completedRequest: CpuRenderRequest | null = null;
  private pendingPanShift: PanShift | null = null;
  private reusableRequest: CpuRenderRequest | null = null;
  private tileSize = 0;
  private disposed = false;
  private workerPoolGeneration = 0;
  private workerPoolFailed = false;

  public constructor(
    canvas: HTMLCanvasElement,
    options: CpuRendererOptions = {},
  ) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.scratchCanvas = document.createElement('canvas');
    this.workerCount = Math.max(1, Math.round(options.workerCount ?? 1));
    this.rowsPerJob = Math.max(1, Math.round(options.rowsPerJob ?? 8));
    this.workerFactory =
      options.workerFactory ??
      (() =>
        new Worker(
          new URL('../../workers/Mandelbrot.worker.ts', import.meta.url),
          {
            type: 'module',
          },
        ));
    this.onStateChange = options.onStateChange;
    this.onTiming = options.onTiming;
    this.onError = options.onError;

    if (this.context) {
      this.emitState('idle');
    } else {
      this.emitState('unavailable', '2D canvas unavailable');
    }
  }

  public resize(width: number, height: number): void {
    if (this.disposed) {
      return;
    }
    const nextWidth = Math.max(1, Math.round(width));
    const nextHeight = Math.max(1, Math.round(height));
    if (this.canvas.width !== nextWidth || this.canvas.height !== nextHeight) {
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
      this.tiles.clear();
      this.iterationBuffer = null;
      this.completedRequest = null;
      this.pendingPanShift = null;
      this.reusableRequest = null;
    }
  }

  public setWorkerCount(workerCount: number): void {
    const nextCount = Math.max(1, Math.round(workerCount));
    if (this.disposed || nextCount === this.workerCount) {
      return;
    }
    this.workerCount = nextCount;
    const hadWorkers = this.workerSlots.length > 0;
    const hadBusyWorkers = this.hasBusyWorkers();
    this.cancel('Worker pool changed');
    if (hadWorkers && !hadBusyWorkers) {
      this.rebuildWorkers();
    }
  }

  public shift(dx: number, dy: number): void {
    if (this.disposed || !this.context || (dx === 0 && dy === 0)) {
      return;
    }
    this.interruptActiveRender('View shifted');
    const hadPendingShift = this.pendingPanShift !== null;
    const width = this.canvas.width;
    const height = this.canvas.height;
    this.scratchCanvas.width = width;
    this.scratchCanvas.height = height;
    const scratchContext = this.scratchCanvas.getContext('2d');
    if (!scratchContext) {
      return;
    }
    scratchContext.clearRect(0, 0, width, height);
    scratchContext.drawImage(this.canvas, 0, 0);
    this.context.clearRect(0, 0, width, height);
    this.context.drawImage(this.scratchCanvas, dx, dy);
    if (this.iterationBuffer) {
      this.iterationBuffer = shiftCpuValueBuffer(
        this.iterationBuffer,
        dx,
        dy,
        width,
        height,
      );
    }
    if (hadPendingShift) {
      // Sequential bitmap translations lose different edge strips, so a net
      // delta cannot describe all exposed pixels. Force a full next render.
      this.pendingPanShift = { dx: 0, dy: 0 };
      this.reusableRequest = null;
    } else {
      this.pendingPanShift = { dx, dy };
    }
  }

  public render(request: CpuRenderRequest): CpuRenderSubmission {
    const nextRenderId = this.renderId + 1;
    this.renderId = nextRenderId;
    if (this.disposed || !this.context) {
      const reason = this.disposed
        ? 'CPU renderer disposed'
        : 'CPU renderer unavailable';
      this.emitState('unavailable', reason);
      return { renderId: nextRenderId, accepted: false, reason };
    }
    if (
      request.width <= 0 ||
      request.height <= 0 ||
      request.maxIterations <= 0 ||
      request.palette.length < 2
    ) {
      const reason = 'Invalid CPU render request';
      this.emitState('error', reason);
      return { renderId: nextRenderId, accepted: false, reason };
    }

    const blockSteps = buildCpuBlockSteps(
      request.refinementSteps,
      request.finalBlockSize,
    );
    const paletteScale =
      request.colourMode === 'normalize' ||
      request.colourMode === 'distribution'
        ? (request.palette.length - 1) / request.maxIterations
        : request.colourMode === 'cycle'
          ? (request.palette.length - 1) / Math.max(1, request.colourPeriod)
          : (request.palette.length - 1) / FIXED_PALETTE_ITERATIONS;
    const config: RenderConfig = {
      request,
      renderId: nextRenderId,
      blockSteps,
      paletteScale,
    };
    if (
      this.completedRequest &&
      this.iterationBuffer &&
      !this.pendingPanShift &&
      canRecolourCpuRequest(this.completedRequest, request)
    ) {
      const startedAt = performance.now();
      this.renderConfig = config;
      this.completedJobs = 0;
      this.emitState('rendering');
      this.recolour(config);
      this.completedRequest = request;
      this.reusableRequest = request;
      this.onTiming?.({
        renderId: nextRenderId,
        elapsedMs: Math.max(0, performance.now() - startedAt),
      });
      this.emitState('complete');
      return { renderId: nextRenderId, accepted: true, reason: null };
    }
    this.completedRequest = null;
    if (
      (this.workerPoolFailed || this.workerSlots.length === 0) &&
      !this.rebuildWorkers()
    ) {
      return {
        renderId: nextRenderId,
        accepted: false,
        reason: 'CPU renderer unavailable',
      };
    }

    if (this.renderConfig && this.hasBusyWorkers() && !this.rebuildWorkers()) {
      const reason = 'CPU renderer unavailable';
      return { renderId: nextRenderId, accepted: false, reason };
    }

    this.resize(request.width, request.height);
    this.jobs = [];
    this.jobHead = 0;
    this.pendingByTask.clear();
    this.completedJobs = 0;
    this.finalPassStartedAt = null;
    this.renderConfig = config;

    this.prepareIterationBuffer(request);
    this.prepareTiles(request, blockSteps);
    for (const tile of this.tiles.values()) {
      if (!tile.inFlight && tile.stepIndex < blockSteps.length) {
        this.enqueueTileStep(tile, this.renderConfig);
      }
    }
    const hasWork = this.queuedJobCount() > 0 || this.pendingByTask.size > 0;
    this.emitState(hasWork ? 'rendering' : 'complete');
    this.dispatch();
    return { renderId: nextRenderId, accepted: true, reason: null };
  }

  public cancel(reason = 'Render cancelled'): void {
    if (this.disposed) {
      return;
    }
    this.interruptActiveRender(reason);
  }

  public suspend(reason = 'CPU renderer suspended'): void {
    if (this.disposed) {
      return;
    }
    this.interruptActiveRender(reason, false);
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.renderId += 1;
    this.renderConfig = null;
    this.jobs = [];
    this.jobHead = 0;
    this.pendingByTask.clear();
    this.finalPassStartedAt = null;
    for (const slot of this.workerSlots) {
      slot.worker.terminate();
    }
    this.workerSlots = [];
    this.tiles.clear();
    this.iterationBuffer = null;
    this.completedRequest = null;
    this.pendingPanShift = null;
    this.reusableRequest = null;
    this.emitState('disposed');
  }

  private rebuildWorkers(): boolean {
    this.workerPoolGeneration += 1;
    const generation = this.workerPoolGeneration;
    this.terminateWorkers();
    this.workerPoolFailed = false;
    this.workerSlots = [];
    const nextSlots: WorkerSlot[] = [];
    try {
      for (let index = 0; index < this.workerCount; index += 1) {
        const worker = this.workerFactory();
        const slot: WorkerSlot = { worker, busy: false };
        worker.addEventListener(
          'message',
          (event: MessageEvent<WorkerResponseMessage>) => {
            if (generation !== this.workerPoolGeneration) {
              return;
            }
            this.handleWorkerMessage(slot, event.data);
          },
        );
        worker.addEventListener('error', (event) => {
          if (
            this.disposed ||
            generation !== this.workerPoolGeneration ||
            this.workerPoolFailed
          ) {
            return;
          }
          this.workerPoolFailed = true;
          this.workerPoolGeneration += 1;
          const message = event.message || 'Fractal worker failed';
          this.onError?.('Fractal worker failed', event.error ?? event.message);
          this.failRender(message);
          this.terminateWorkers();
        });
        nextSlots.push(slot);
      }
      this.workerSlots = nextSlots;
      return true;
    } catch (error) {
      for (const slot of nextSlots) {
        slot.worker.terminate();
      }
      this.workerPoolFailed = true;
      this.onError?.('Unable to create fractal workers', error);
      this.emitState('unavailable', 'Unable to create fractal workers');
      return false;
    }
  }

  private terminateWorkers(): void {
    for (const slot of this.workerSlots) {
      slot.worker.terminate();
    }
    this.workerSlots = [];
  }

  private prepareIterationBuffer(request: CpuRenderRequest): void {
    const requiredLength = request.width * request.height;
    if (
      !this.iterationBuffer ||
      this.iterationBuffer.length !== requiredLength
    ) {
      this.iterationBuffer = new Float64Array(requiredLength);
      this.iterationBuffer.fill(Number.NaN);
    }
  }

  private prepareTiles(
    request: CpuRenderRequest,
    blockSteps: readonly number[],
  ): void {
    const tileSize = Math.max(32, Math.round(request.tileSize));
    const panShift = this.pendingPanShift;
    this.pendingPanShift = null;
    const canReuseShift =
      panShift !== null &&
      Math.abs(panShift.dx) < request.width &&
      Math.abs(panShift.dy) < request.height &&
      this.tiles.size > 0 &&
      this.tileSize === tileSize &&
      this.reusableRequest !== null &&
      areCpuRequestsPanReuseCompatible(this.reusableRequest, request);
    this.tileSize = tileSize;
    this.reusableRequest = request;

    if (!canReuseShift || !panShift) {
      this.tiles = new Map();
      this.nextTileId = 1;
      this.iterationBuffer?.fill(Number.NaN);
      this.addTilesForRegion(0, 0, request.width, request.height, tileSize, 0);
      return;
    }

    const shiftedTiles = new Map<number, Tile>();
    for (const tile of this.tiles.values()) {
      const shiftedX = tile.x + panShift.dx;
      const shiftedY = tile.y + panShift.dy;
      const x = Math.max(0, shiftedX);
      const y = Math.max(0, shiftedY);
      const width = Math.min(shiftedX + tile.width, request.width) - x;
      const height = Math.min(shiftedY + tile.height, request.height) - y;
      if (width > 0 && height > 0) {
        shiftedTiles.set(tile.id, {
          ...tile,
          x,
          y,
          width,
          height,
          inFlight: false,
        });
      }
    }
    this.tiles = shiftedTiles;

    if (panShift.dx !== 0) {
      this.addTilesForRegion(
        panShift.dx > 0 ? 0 : request.width + panShift.dx,
        0,
        Math.abs(panShift.dx),
        request.height,
        tileSize,
        0,
      );
    }
    if (panShift.dy !== 0) {
      this.addTilesForRegion(
        0,
        panShift.dy > 0 ? 0 : request.height + panShift.dy,
        request.width,
        Math.abs(panShift.dy),
        tileSize,
        0,
      );
    }

    for (const tile of this.tiles.values()) {
      tile.stepIndex = Math.min(tile.stepIndex, blockSteps.length);
    }
  }

  private addTilesForRegion(
    regionX: number,
    regionY: number,
    regionWidth: number,
    regionHeight: number,
    tileSize: number,
    stepIndex: number,
  ): void {
    const xEnd = regionX + regionWidth;
    const yEnd = regionY + regionHeight;
    for (let y = regionY; y < yEnd; y += tileSize) {
      const height = Math.min(tileSize, yEnd - y);
      for (let x = regionX; x < xEnd; x += tileSize) {
        const width = Math.min(tileSize, xEnd - x);
        if (width <= 0 || height <= 0) {
          continue;
        }
        const tile: Tile = {
          id: this.nextTileId,
          x,
          y,
          width,
          height,
          stepIndex,
          inFlight: false,
        };
        this.nextTileId += 1;
        this.tiles.set(tile.id, tile);
      }
    }
  }

  private enqueueTileStep(tile: Tile, config: RenderConfig): void {
    if (tile.inFlight || tile.stepIndex >= config.blockSteps.length) {
      return;
    }
    const blockSize = config.blockSteps[tile.stepIndex] ?? 1;
    const stripeHeight = Math.max(blockSize, blockSize * this.rowsPerJob);
    const jobCount = Math.ceil(tile.height / stripeHeight);
    const taskKey = `${tile.id}:${tile.stepIndex}`;
    this.pendingByTask.set(taskKey, jobCount);
    tile.inFlight = true;
    if (
      tile.stepIndex === config.blockSteps.length - 1 &&
      this.finalPassStartedAt === null
    ) {
      this.finalPassStartedAt = performance.now();
    }

    const { request, renderId } = config;
    const perturbation = resolveCpuWorkerPerturbation(request);
    for (let py = tile.y; py < tile.y + tile.height; py += stripeHeight) {
      const height = Math.min(stripeHeight, tile.y + tile.height - py);
      this.jobs.push({
        message: {
          cmd: START,
          renderId,
          tileId: tile.id,
          stepIndex: tile.stepIndex,
          px: tile.x,
          py,
          x0: request.bounds.x0,
          y0: request.bounds.y0,
          xScale: request.bounds.xScale,
          yScale: request.bounds.yScale,
          width: tile.width,
          height,
          blockSize,
          max: request.maxIterations,
          smooth: request.smooth,
          algorithm: request.algorithm,
          juliaCr: request.julia.real,
          juliaCi: request.julia.imag,
          ...(perturbation ? { perturbation } : {}),
        },
      });
    }
  }

  private dispatch(): void {
    if (this.disposed) {
      return;
    }
    for (const slot of this.workerSlots) {
      if (slot.busy) {
        continue;
      }
      const job = this.dequeueJob();
      if (!job) {
        break;
      }
      slot.busy = true;
      slot.worker.postMessage(job.message);
    }
    if (
      this.renderConfig &&
      (this.queuedJobCount() > 0 || this.pendingByTask.size > 0)
    ) {
      this.emitState('rendering');
    }
  }

  private handleWorkerMessage(
    slot: WorkerSlot,
    response: WorkerResponseMessage,
  ): void {
    slot.busy = false;
    const config = this.renderConfig;
    if (!config || response.renderId !== config.renderId) {
      this.dispatch();
      return;
    }

    this.drawResponse(response, config);
    this.completedJobs += 1;
    const taskKey = `${response.tileId}:${response.stepIndex}`;
    const remaining = (this.pendingByTask.get(taskKey) ?? 0) - 1;
    if (remaining <= 0) {
      this.pendingByTask.delete(taskKey);
      const tile = this.tiles.get(response.tileId);
      if (tile && tile.stepIndex === response.stepIndex) {
        tile.stepIndex += 1;
        tile.inFlight = false;
        this.enqueueTileStep(tile, config);
      }
    } else {
      this.pendingByTask.set(taskKey, remaining);
    }

    const allComplete =
      this.pendingByTask.size === 0 &&
      this.queuedJobCount() === 0 &&
      Array.from(this.tiles.values()).every(
        (tile) => tile.stepIndex >= config.blockSteps.length,
      );
    if (allComplete) {
      this.completedRequest = config.request;
      if (config.request.colourMode === 'distribution') {
        this.applyDistributionColouring(config);
      }
      if (this.finalPassStartedAt !== null) {
        this.onTiming?.({
          renderId: config.renderId,
          elapsedMs: Math.max(0, performance.now() - this.finalPassStartedAt),
        });
      }
      this.finalPassStartedAt = null;
      this.emitState('complete');
    }
    this.dispatch();
  }

  private drawResponse(
    response: WorkerResponseMessage,
    config: RenderConfig,
  ): void {
    const context = this.context;
    if (!context) {
      return;
    }
    const { request, paletteScale } = config;
    const palette = request.palette;
    const paletteSize = palette.length;
    const finalBlockSize = config.blockSteps[config.blockSteps.length - 1] ?? 1;
    const iterationBuffer = this.iterationBuffer;
    const imageData = context.createImageData(response.width, response.height);
    let valueIndex = 0;

    for (let py = 0; py < response.height; py += response.blockSize) {
      for (let px = 0; px < response.width; px += response.blockSize) {
        const iterationValue = response.values[valueIndex];
        valueIndex += 1;
        const drawWidth = Math.min(response.blockSize, response.width - px);
        const drawHeight = Math.min(response.blockSize, response.height - py);

        if (iterationBuffer && response.blockSize === finalBlockSize) {
          const baseX = response.px + px;
          const baseY = response.py + py;
          for (let by = 0; by < drawHeight; by += 1) {
            const rowOffset = (baseY + by) * request.width + baseX;
            iterationBuffer.fill(
              iterationValue,
              rowOffset,
              rowOffset + drawWidth,
            );
          }
        }

        const rgb = this.resolveColour(
          iterationValue,
          response.px + px,
          response.py + py,
          config,
          paletteScale,
          paletteSize,
        );
        const red = Math.floor(rgb[0]);
        const green = Math.floor(rgb[1]);
        const blue = Math.floor(rgb[2]);
        for (let by = 0; by < drawHeight; by += 1) {
          let offset = ((py + by) * response.width + px) * 4;
          for (let bx = 0; bx < drawWidth; bx += 1) {
            imageData.data[offset++] = red;
            imageData.data[offset++] = green;
            imageData.data[offset++] = blue;
            imageData.data[offset++] = 255;
          }
        }
      }
    }
    context.putImageData(imageData, response.px, response.py);
  }

  private recolour(config: RenderConfig): void {
    const values = this.iterationBuffer;
    const context = this.context;
    if (!values || !context) return;
    if (config.request.colourMode === 'distribution') {
      this.applyDistributionColouring(config);
      return;
    }
    const blockSize = config.blockSteps[config.blockSteps.length - 1];
    // Paint retained pixels directly: a pan can crop a coarse block mid-sample.
    // Reconstructing blocks from their top-left pixel would lose those boundaries.
    for (const tile of this.tiles.values()) {
      for (let py = tile.y; py < tile.y + tile.height; py += this.rowsPerJob) {
        const height = Math.min(this.rowsPerJob, tile.y + tile.height - py);
        const imageData = context.createImageData(tile.width, height);
        let offset = 0;
        for (let y = py; y < py + height; y += 1) {
          for (let x = tile.x; x < tile.x + tile.width; x += 1) {
            const rgb = this.resolveColour(
              values[y * config.request.width + x],
              x - ((x - tile.x) % blockSize),
              y - ((y - tile.y) % blockSize),
              config,
              config.paletteScale,
              config.request.palette.length,
            );
            imageData.data[offset++] = Math.floor(rgb[0]);
            imageData.data[offset++] = Math.floor(rgb[1]);
            imageData.data[offset++] = Math.floor(rgb[2]);
            imageData.data[offset++] = 255;
          }
        }
        context.putImageData(imageData, tile.x, py);
      }
    }
  }

  private resolveColour(
    iterationValue: number,
    x: number,
    y: number,
    config: RenderConfig,
    paletteScale: number,
    paletteSize: number,
  ): readonly number[] {
    const { request } = config;
    if (
      !Number.isFinite(iterationValue) ||
      iterationValue >= request.maxIterations
    ) {
      return [0, 0, 0];
    }
    let scaled = paletteScale * iterationValue;
    if (request.ditherStrength > 0) {
      scaled += (hash2d(x, y) - 0.5) * request.ditherStrength;
    }
    const palettePosition = resolveCpuPalettePosition(
      scaled,
      paletteSize,
      request.colourMode === 'cycle',
    );
    if (!request.smooth) {
      return request.palette[palettePosition.paletteIndex];
    }
    return lerpRgb(
      request.palette[palettePosition.firstIndex],
      request.palette[palettePosition.nextIndex],
      palettePosition.amount,
    );
  }

  private applyDistributionColouring(config: RenderConfig): void {
    const context = this.context;
    const buffer = this.iterationBuffer;
    if (!context || !buffer) {
      return;
    }
    const { request } = config;
    const bins = Math.max(1, Math.ceil(request.maxIterations));
    const histogram = new Uint32Array(bins);
    let total = 0;
    for (const value of buffer) {
      if (Number.isFinite(value) && value < request.maxIterations) {
        histogram[Math.min(bins - 1, Math.floor(value))] += 1;
        total += 1;
      }
    }
    const cdf = new Float32Array(bins);
    let cumulative = 0;
    let cdfMin = 0;
    for (let index = 0; index < bins; index += 1) {
      cumulative += histogram[index];
      if (cdfMin === 0 && cumulative > 0) {
        cdfMin = cumulative / total;
      }
      cdf[index] = total > 0 ? cumulative / total : 0;
    }
    const denominator = 1 - cdfMin;
    if (denominator > 0) {
      for (let index = 0; index < cdf.length; index += 1) {
        cdf[index] = Math.max(0, (cdf[index] - cdfMin) / denominator);
      }
    }

    const imageData = context.createImageData(request.width, request.height);
    const paletteSize = request.palette.length;
    let imageIndex = 0;
    for (let y = 0; y < request.height; y += 1) {
      const rowOffset = y * request.width;
      for (let x = 0; x < request.width; x += 1) {
        const value = buffer[rowOffset + x];
        let rgb: readonly number[] = [0, 0, 0];
        if (Number.isFinite(value) && value < request.maxIterations) {
          const base = Math.floor(value);
          const fraction = value - base;
          const baseIndex = Math.min(cdf.length - 1, Math.max(0, base));
          const nextIndex = Math.min(cdf.length - 1, baseIndex + 1);
          const cdfValue =
            cdf[baseIndex] + (cdf[nextIndex] - cdf[baseIndex]) * fraction;
          let scaled = cdfValue * (paletteSize - 1);
          if (request.ditherStrength > 0) {
            scaled += (hash2d(x, y) - 0.5) * request.ditherStrength;
          }
          scaled = Math.min(paletteSize - 1, Math.max(0, scaled));
          const paletteIndex = Math.min(
            paletteSize - 2,
            Math.max(0, Math.floor(scaled)),
          );
          rgb = request.smooth
            ? lerpRgb(
                request.palette[paletteIndex],
                request.palette[paletteIndex + 1],
                scaled - paletteIndex,
              )
            : request.palette[Math.floor(scaled)];
        }
        imageData.data[imageIndex] = Math.floor(rgb[0]);
        imageData.data[imageIndex + 1] = Math.floor(rgb[1]);
        imageData.data[imageIndex + 2] = Math.floor(rgb[2]);
        imageData.data[imageIndex + 3] = 255;
        imageIndex += 4;
      }
    }
    context.putImageData(imageData, 0, 0);
  }

  private interruptActiveRender(reason: string, keepWorkerPool = true): void {
    this.completedRequest = null;
    const hadBusyWorkers = this.hasBusyWorkers();
    this.renderId += 1;
    this.renderConfig = null;
    this.jobs = [];
    this.jobHead = 0;
    this.pendingByTask.clear();
    this.finalPassStartedAt = null;
    for (const tile of this.tiles.values()) {
      tile.inFlight = false;
    }
    if (!keepWorkerPool) {
      this.workerPoolGeneration += 1;
      this.terminateWorkers();
      this.workerPoolFailed = false;
    } else if (hadBusyWorkers && !this.rebuildWorkers()) {
      return;
    }
    this.emitState('cancelled', reason);
  }

  private queuedJobCount(): number {
    return Math.max(0, this.jobs.length - this.jobHead);
  }

  private dequeueJob(): WorkerJob | undefined {
    if (this.jobHead >= this.jobs.length) {
      return undefined;
    }
    const job = this.jobs[this.jobHead];
    this.jobHead += 1;
    if (this.jobHead >= 1024 && this.jobHead * 2 >= this.jobs.length) {
      this.jobs = this.jobs.slice(this.jobHead);
      this.jobHead = 0;
    }
    return job;
  }

  private emitState(
    status: CpuRenderState['status'],
    message: string | null = null,
  ): void {
    this.onStateChange?.({
      renderId: this.renderConfig?.renderId ?? null,
      status,
      completedJobs: this.completedJobs,
      queuedJobs: this.queuedJobCount(),
      message,
    });
  }

  private failRender(message: string): void {
    this.completedRequest = null;
    this.renderId += 1;
    this.renderConfig = null;
    this.jobs = [];
    this.jobHead = 0;
    this.pendingByTask.clear();
    this.finalPassStartedAt = null;
    this.pendingPanShift = null;
    this.reusableRequest = null;
    for (const slot of this.workerSlots) {
      slot.busy = false;
    }
    this.emitState('error', message);
  }

  private hasBusyWorkers(): boolean {
    return this.workerSlots.some((slot) => slot.busy);
  }
}
