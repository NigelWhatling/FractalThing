import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDecimalCoordinate } from '../viewport';
import {
  areCpuRequestsPanReuseCompatible,
  buildCpuBlockSteps,
  CpuRenderer,
  resolveCpuPalettePosition,
  resolveCpuWorkerPerturbation,
  shiftCpuValueBuffer,
} from './CpuRenderer';
import type {
  WorkerResponseMessage,
  WorkerStartMessage,
} from '../../workers/WorkerCommands';
import type {
  CpuRendererOptions,
  CpuRenderRequest,
  CpuRenderState,
} from './types';

const buildRequest = (
  overrides: Partial<CpuRenderRequest> = {},
): CpuRenderRequest => ({
  bounds: { x0: -2, y0: -1.5, xScale: 0.01, yScale: 0.01 },
  width: 320,
  height: 240,
  maxIterations: 256,
  smooth: true,
  algorithm: 'mandelbrot',
  julia: { real: -0.8, imag: 0.156 },
  palette: [
    [0, 0, 0],
    [255, 255, 255],
  ],
  colourMode: 'normalize',
  colourPeriod: 64,
  ditherStrength: 0,
  tileSize: 64,
  refinementSteps: 3,
  finalBlockSize: 1,
  ...overrides,
});

type FakeCanvasContext = Readonly<{
  clearRect: ReturnType<typeof vi.fn>;
  createImageData: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  putImageData: ReturnType<typeof vi.fn>;
}> & { fillStyle: string };

const createFakeContext = (): FakeCanvasContext => ({
  fillStyle: '',
  clearRect: vi.fn(),
  createImageData: vi.fn((width: number, height: number) => ({
    data: new Uint8ClampedArray(width * height * 4),
    height,
    width,
  })),
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  putImageData: vi.fn(),
});

const createFakeCanvas = (
  width: number,
  height: number,
  context: FakeCanvasContext,
): HTMLCanvasElement =>
  ({
    width,
    height,
    getContext: vi.fn(() => context),
  }) as unknown as HTMLCanvasElement;

class FakeWorker {
  public readonly postedMessages: WorkerStartMessage[] = [];
  public readonly terminate = vi.fn(() => {
    this.terminated = true;
  });
  public terminated = false;

  private readonly errorListeners: Array<(event: ErrorEvent) => void> = [];
  private readonly messageListeners: Array<
    (event: MessageEvent<WorkerResponseMessage>) => void
  > = [];

  public addEventListener(
    type: string,
    listener: (event: ErrorEvent | MessageEvent<WorkerResponseMessage>) => void,
  ): void {
    if (type === 'message') {
      this.messageListeners.push(
        listener as (event: MessageEvent<WorkerResponseMessage>) => void,
      );
    } else if (type === 'error') {
      this.errorListeners.push(listener as (event: ErrorEvent) => void);
    }
  }

  public emitError(message = 'worker failed'): void {
    const error = new Error(message);
    for (const listener of this.errorListeners) {
      listener({ error, message } as ErrorEvent);
    }
  }

  public emitMessage(message: WorkerResponseMessage): void {
    for (const listener of this.messageListeners) {
      listener({ data: message } as MessageEvent<WorkerResponseMessage>);
    }
  }

  public postMessage(message: WorkerStartMessage): void {
    this.postedMessages.push(message);
  }
}

const createResponse = (
  message: WorkerStartMessage,
  value = 1,
): WorkerResponseMessage => {
  const columns = Math.ceil(message.width / message.blockSize);
  const rows = Math.ceil(message.height / message.blockSize);
  return {
    renderId: message.renderId,
    tileId: message.tileId,
    stepIndex: message.stepIndex,
    px: message.px,
    py: message.py,
    width: message.width,
    height: message.height,
    blockSize: message.blockSize,
    max: message.max,
    values: Float64Array.from({ length: columns * rows }, () => value),
  };
};

const activeRenderers: CpuRenderer[] = [];

const last = <T>(values: readonly T[]): T | undefined =>
  values[values.length - 1];

const createRendererHarness = (
  options: Pick<CpuRendererOptions, 'onError'> = {},
) => {
  const context = createFakeContext();
  const scratchContext = createFakeContext();
  const canvas = createFakeCanvas(2, 1, context);
  const scratchCanvas = createFakeCanvas(2, 1, scratchContext);
  const workers: FakeWorker[] = [];
  const workerFactory = vi.fn(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker as unknown as Worker;
  });
  const states: CpuRenderState[] = [];
  vi.stubGlobal('document', {
    createElement: vi.fn(() => scratchCanvas),
  });
  const renderer = new CpuRenderer(canvas, {
    ...options,
    workerCount: 1,
    workerFactory,
    onStateChange: (state) => states.push(state),
  });
  activeRenderers.push(renderer);
  return { context, renderer, states, workerFactory, workers };
};

const lifecycleRequest = buildRequest({
  bounds: { x0: -2, y0: -1, xScale: 0.5, yScale: 0.5 },
  width: 2,
  height: 1,
  maxIterations: 16,
  smooth: false,
  tileSize: 32,
  refinementSteps: 1,
  finalBlockSize: 1,
});

afterEach(() => {
  for (const renderer of activeRenderers.splice(0)) {
    renderer.dispose();
  }
  vi.unstubAllGlobals();
});

describe('CPU renderer helpers', () => {
  it('builds strictly decreasing progressive block sizes', () => {
    const steps = buildCpuBlockSteps(5, 1);
    expect(steps[0]).toBe(256);
    expect(steps[steps.length - 1]).toBe(1);
    expect(
      steps.every((value, index) => index === 0 || value < steps[index - 1]),
    ).toBe(true);
  });

  it('shifts retained distribution values and clears exposed pixels', () => {
    const source = Float32Array.from([1, 2, 3, 4, 5, 6]);
    const shifted = shiftCpuValueBuffer(source, 1, 0, 3, 2);
    expect(
      Array.from(shifted, (value) => (Number.isNaN(value) ? null : value)),
    ).toEqual([null, 1, 2, null, 4, 5]);
  });

  it('forwards perturbation data only for Mandelbrot renders', () => {
    const perturbation = {
      centreReal: parseDecimalCoordinate('-0.75'),
      centreImag: parseDecimalCoordinate('0'),
      originReal: parseDecimalCoordinate('-1'),
      originImag: parseDecimalCoordinate('-0.25'),
      zoom: 1e20,
      glitchThreshold: 1e-6,
    };

    expect(
      resolveCpuWorkerPerturbation({
        algorithm: 'mandelbrot',
        perturbation,
      }),
    ).toBe(perturbation);
    expect(
      resolveCpuWorkerPerturbation({ algorithm: 'julia', perturbation }),
    ).toBeUndefined();
  });

  it('saturates smooth palette interpolation at non-cyclic endpoints', () => {
    expect(resolveCpuPalettePosition(-2, 5, false)).toEqual({
      paletteIndex: 0,
      firstIndex: 0,
      nextIndex: 1,
      amount: 0,
    });
    expect(resolveCpuPalettePosition(20, 5, false)).toEqual({
      paletteIndex: 4,
      firstIndex: 3,
      nextIndex: 4,
      amount: 1,
    });
  });

  it('reuses panned tiles only when every non-positional input matches', () => {
    const original = buildRequest();
    const translated = buildRequest({
      bounds: { ...original.bounds, x0: -1.9, y0: -1.4 },
    });

    expect(areCpuRequestsPanReuseCompatible(original, translated)).toBe(true);
    expect(
      areCpuRequestsPanReuseCompatible(
        original,
        buildRequest({ algorithm: 'tricorn' }),
      ),
    ).toBe(false);
    expect(
      areCpuRequestsPanReuseCompatible(
        original,
        buildRequest({
          palette: [
            [0, 0, 0],
            [255, 0, 0],
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe('CPU renderer worker lifecycle', () => {
  it('creates the worker pool lazily on the first accepted render', () => {
    const { renderer, workerFactory, workers } = createRendererHarness();

    expect(workerFactory).not.toHaveBeenCalled();
    expect(renderer.render(lifecycleRequest)).toMatchObject({ accepted: true });
    expect(workerFactory).toHaveBeenCalledOnce();
    expect(workers[0]?.postedMessages).toHaveLength(1);
  });

  it('interrupts a shifted render synchronously and ignores its stale response', () => {
    const { context, renderer, states, workerFactory, workers } =
      createRendererHarness();
    renderer.render(lifecycleRequest);
    const staleWorker = workers[0];
    const staleJob = staleWorker?.postedMessages[0];
    expect(staleWorker).toBeDefined();
    expect(staleJob).toBeDefined();

    renderer.shift(1, 0);

    expect(staleWorker?.terminate).toHaveBeenCalledOnce();
    expect(staleWorker!.terminate.mock.invocationCallOrder[0]).toBeLessThan(
      context.drawImage.mock.invocationCallOrder[0],
    );
    expect(workerFactory).toHaveBeenCalledTimes(2);
    expect(last(states)?.status).toBe('cancelled');
    expect(context.fillRect).not.toHaveBeenCalled();

    const translatedRequest = buildRequest({
      ...lifecycleRequest,
      bounds: { ...lifecycleRequest.bounds, x0: -2.5 },
    });
    renderer.render(translatedRequest);
    expect(last(states)).toMatchObject({
      status: 'rendering',
      completedJobs: 0,
    });

    staleWorker?.emitMessage(createResponse(staleJob!));
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(last(states)).toMatchObject({
      status: 'rendering',
      completedJobs: 0,
    });

    const currentWorker = workers[1];
    let responseIndex = 0;
    while (
      currentWorker &&
      responseIndex < currentWorker.postedMessages.length &&
      responseIndex < 4
    ) {
      currentWorker.emitMessage(
        createResponse(currentWorker.postedMessages[responseIndex]),
      );
      responseIndex += 1;
    }

    expect(responseIndex).toBe(2);
    expect(last(states)).toMatchObject({
      status: 'complete',
      completedJobs: 2,
      queuedJobs: 0,
    });
  });

  it('does not automatically respawn a persistently failing worker', () => {
    const onError = vi.fn();
    const { renderer, states, workerFactory, workers } = createRendererHarness({
      onError,
    });
    renderer.render(lifecycleRequest);

    workers[0]?.emitError();
    workers[0]?.emitError();

    expect(onError).toHaveBeenCalledOnce();
    expect(workerFactory).toHaveBeenCalledOnce();
    expect(workers[0]?.terminate).toHaveBeenCalledOnce();
    expect(last(states)?.status).toBe('error');

    expect(renderer.render(lifecycleRequest)).toMatchObject({ accepted: true });
    expect(workerFactory).toHaveBeenCalledTimes(2);
    workers[1]?.emitError();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(workerFactory).toHaveBeenCalledTimes(2);
  });
});
