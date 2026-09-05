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
  return { context, renderer, scratchCanvas, states, workerFactory, workers };
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
    const source = Float64Array.from([1, 2, 3, 4, 5, 6]);
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
    expect(context.putImageData).not.toHaveBeenCalled();

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
    expect(context.putImageData).not.toHaveBeenCalled();
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

const drainWorker = (
  worker: FakeWorker,
  start = 0,
  valueAt = (x: number, y: number, max: number) =>
    (x + y) % 5 === 0 ? max : ((x + y) % 8) + 0.25,
) => {
  let index = start;
  while (index < worker.postedMessages.length) {
    if (index > 10000) throw new Error('Renderer did not complete');
    const job = worker.postedMessages[index++];
    const response = createResponse(job);
    let pixel = 0;
    for (let y = 0; y < job.height; y += job.blockSize) {
      for (let x = 0; x < job.width; x += job.blockSize) {
        response.values[pixel++] = valueAt(job.px + x, job.py + y, job.max);
      }
    }
    worker.emitMessage(response);
  }
  return index;
};

const paintedPixels = (
  context: FakeCanvasContext,
  width: number,
  height: number,
) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (const [image, x, y] of context.putImageData.mock.calls) {
    for (let row = 0; row < image.height; row += 1) {
      pixels.set(
        image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4),
        ((y + row) * width + x) * 4,
      );
    }
  }
  return pixels;
};

// Memory ownership is observable here without exposing controller internals in its API.
const retainedIterationBuffer = (renderer: CpuRenderer): Float64Array | null =>
  Reflect.get(renderer, 'iterationBuffer');

describe('CPU retained-value memory budget', () => {
  const largeRequest = {
    ...lifecycleRequest,
    width: 2049,
    height: 2048,
    tileSize: 4096,
    finalBlockSize: 256,
  };

  it.each(['cycle', 'distribution'] as const)(
    'releases %s values and pending pan reuse on suspension, then renders fully on resume',
    (colourMode) => {
      const { context, renderer, scratchCanvas, workers } =
        createRendererHarness();
      const request = { ...lifecycleRequest, colourMode };
      renderer.render(request);
      drainWorker(workers[0]);
      expect(retainedIterationBuffer(renderer)?.byteLength).toBe(16);
      renderer.shift(1, 0);
      expect(scratchCanvas.width).toBe(2);
      renderer.suspend('GPU renderer active');
      expect(retainedIterationBuffer(renderer)?.byteLength ?? 0).toBe(0);
      expect(scratchCanvas.width).toBe(1);
      expect(scratchCanvas.height).toBe(1);
      expect(workers[0].terminate).toHaveBeenCalledOnce();
      context.putImageData.mockClear();
      workers[0].emitMessage(createResponse(workers[0].postedMessages[0]));
      expect(context.putImageData).not.toHaveBeenCalled();

      renderer.render(request);
      expect(workers).toHaveLength(2);
      expect(workers[1].postedMessages[0]).toMatchObject({
        px: 0,
        py: 0,
        width: 2,
        height: 1,
      });
      drainWorker(workers[1]);
      const fresh = createRendererHarness();
      fresh.renderer.render(request);
      drainWorker(fresh.workers[0]);
      expect(paintedPixels(context, 2, 1)).toEqual(
        paintedPixels(fresh.context, 2, 1),
      );
    },
  );

  it.each([2048, 2049])(
    'bounds optional retention to 32 MiB at width %i',
    (width) => {
      const { renderer } = createRendererHarness();
      const request = { ...largeRequest, width };
      renderer.render(request);
      const buffer = retainedIterationBuffer(renderer);
      if (width === 2048) {
        expect(buffer).toBeInstanceOf(Float64Array);
        expect(buffer?.byteLength).toBe(32 * 1024 * 1024);
      } else {
        expect(buffer?.byteLength ?? 0).toBe(0);
      }
      renderer.render({ ...request, maxIterations: 32 });
      expect(retainedIterationBuffer(renderer) === buffer).toBe(true);
    },
  );

  it('recomputes and paints colour changes when a completed view exceeds the optional budget', () => {
    const { renderer, context, states, workers } = createRendererHarness();
    renderer.render(largeRequest);
    const jobs = drainWorker(workers[0], 0, () => 1);
    expect(last(states)?.status).toBe('complete');
    expect(retainedIterationBuffer(renderer)?.byteLength ?? 0).toBe(0);
    context.putImageData.mockClear();
    renderer.render({
      ...largeRequest,
      palette: [
        [255, 0, 0],
        [0, 0, 255],
      ],
    });
    expect(workers[0].postedMessages.length).toBeGreaterThan(jobs);
    drainWorker(workers[0], jobs, () => 1);
    expect(last(states)?.status).toBe('complete');
    expect(
      Array.from(context.putImageData.mock.calls[0][0].data.subarray(0, 4)),
    ).toEqual([255, 0, 0, 255]);
    expect(retainedIterationBuffer(renderer)?.byteLength ?? 0).toBe(0);
  });

  it('preserves required distribution values above the budget and releases them when leaving that mode', () => {
    const { renderer, context, workers } = createRendererHarness();
    const request = { ...largeRequest, colourMode: 'distribution' as const };
    renderer.render(request);
    const jobs = drainWorker(workers[0], 0, () => 1);
    expect(retainedIterationBuffer(renderer)?.byteLength).toBe(2049 * 2048 * 8);
    expect(
      Array.from(last(context.putImageData.mock.calls)![0].data.subarray(0, 4)),
    ).toEqual([255, 255, 255, 255]);

    context.putImageData.mockClear();
    const next = {
      ...request,
      colourMode: 'cycle' as const,
      palette: [
        [255, 0, 0],
        [0, 0, 255],
      ],
    };
    renderer.render(next);
    // The required buffer can supply this last recolour before it is released.
    expect(workers[0].postedMessages).toHaveLength(jobs);
    expect(
      Array.from(context.putImageData.mock.calls[0][0].data.subarray(0, 4)),
    ).toEqual([255, 0, 0, 255]);
    expect(retainedIterationBuffer(renderer)?.byteLength ?? 0).toBe(0);
    renderer.render({ ...next, colourPeriod: 8 });
    expect(workers[0].postedMessages.length).toBeGreaterThan(jobs);
  });
});

describe('CPU pixel batching and recolouring', () => {
  it('submits one image per response and retains clipped coarse blocks and black interiors', () => {
    const { renderer, context, workers } = createRendererHarness();
    renderer.render({
      ...lifecycleRequest,
      width: 3,
      height: 3,
      finalBlockSize: 2,
      palette: [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
      ],
      colourMode: 'cycle',
      colourPeriod: 2,
    });
    workers[0].emitMessage({
      ...createResponse(workers[0].postedMessages[0]),
      values: Float64Array.from([0, 1, 2, 16]),
    });
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.putImageData).toHaveBeenCalledOnce();
    const red = [255, 0, 0, 255],
      green = [0, 255, 0, 255],
      blue = [0, 0, 255, 255],
      black = [0, 0, 0, 255];
    expect(Array.from(paintedPixels(context, 3, 3))).toEqual([
      ...red,
      ...red,
      ...green,
      ...red,
      ...red,
      ...green,
      ...blue,
      ...blue,
      ...black,
    ]);
  });

  it.each(['normalize', 'cycle', 'fixed', 'distribution'] as const)(
    'recolours %s without worker jobs and matches a fresh render',
    (colourMode) => {
      const initial = {
        ...lifecycleRequest,
        width: 33,
        height: 17,
        smooth: true,
      };
      const next = {
        ...initial,
        colourMode,
        colourPeriod: 3,
        ditherStrength: 0.8,
        palette: [
          [240, 10, 20],
          [20, 250, 30],
          [10, 20, 255],
        ],
      };
      const cached = createRendererHarness();
      cached.renderer.render(initial);
      drainWorker(cached.workers[0]);
      const jobCount = cached.workers[0].postedMessages.length;
      cached.context.putImageData.mockClear();
      expect(cached.renderer.render(next).accepted).toBe(true);
      expect(cached.workers[0].postedMessages).toHaveLength(jobCount);
      expect(last(cached.states)).toMatchObject({
        status: 'complete',
        queuedJobs: 0,
        completedJobs: 0,
      });
      const fresh = createRendererHarness();
      fresh.renderer.render(next);
      drainWorker(fresh.workers[0]);
      expect(paintedPixels(cached.context, 33, 17)).toEqual(
        paintedPixels(fresh.context, 33, 17),
      );
    },
  );

  it('retains Float64 escape values near the iteration cap', () => {
    const { renderer, context, workers } = createRendererHarness();
    const request = { ...lifecycleRequest, smooth: true, maxIterations: 4096 };
    renderer.render(request);
    drainWorker(workers[0], 0, () => 4096 - 0.00001);
    context.putImageData.mockClear();
    renderer.render({
      ...request,
      palette: [
        [0, 0, 0],
        [255, 0, 0],
      ],
    });
    expect(Array.from(paintedPixels(context, 2, 1))).toEqual([
      254, 0, 0, 255, 254, 0, 0, 255,
    ]);
    expect(workers[0].postedMessages).toHaveLength(1);
  });

  it('keeps clipped coarse sample boundaries after panning and repeated recolouring', () => {
    const { renderer, context, workers } = createRendererHarness();
    const request = {
      ...lifecycleRequest,
      width: 4,
      height: 1,
      finalBlockSize: 2,
      colourMode: 'cycle' as const,
      colourPeriod: 2,
      palette: [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
      ],
    };
    renderer.render(request);
    drainWorker(workers[0], 0, (x) => x / 2);
    const start = workers[0].postedMessages.length;
    renderer.shift(-1, 0);
    const panned = {
      ...request,
      bounds: {
        ...request.bounds,
        x0: request.bounds.x0 + request.bounds.xScale,
      },
    };
    renderer.render(panned);
    drainWorker(workers[0], start, () => 2);
    const jobCount = workers[0].postedMessages.length;
    context.putImageData.mockClear();
    renderer.render({
      ...panned,
      palette: [
        [200, 0, 0],
        [0, 200, 0],
        [0, 0, 200],
      ],
    });
    renderer.render(panned);
    expect(workers[0].postedMessages).toHaveLength(jobCount);
    expect(Array.from(paintedPixels(context, 4, 1))).toEqual([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
    ]);
  });

  it('repaints an all-interior distribution view black', () => {
    const { renderer, context, workers } = createRendererHarness();
    renderer.render(lifecycleRequest);
    drainWorker(workers[0], 0, (_x, _y, max) => max);
    context.putImageData.mockClear();
    renderer.render({ ...lifecycleRequest, colourMode: 'distribution' });
    expect(Array.from(paintedPixels(context, 2, 1))).toEqual([
      0, 0, 0, 255, 0, 0, 0, 255,
    ]);
  });

  it.each([
    { maxIterations: 32 },
    { smooth: true },
    { algorithm: 'tricorn' },
    { julia: { real: 0.1, imag: 0.2 } },
    { width: 3 },
    { height: 2 },
    { finalBlockSize: 2 },
    { refinementSteps: 3 },
    { tileSize: 64 },
    { bounds: { ...lifecycleRequest.bounds, x0: -1 } },
    { bounds: { ...lifecycleRequest.bounds, y0: 1 } },
    { bounds: { ...lifecycleRequest.bounds, xScale: 0.25 } },
  ] satisfies Partial<CpuRenderRequest>[])(
    'invalidates escape values when computation inputs change: %j',
    (change) => {
      const { renderer, workers, states } = createRendererHarness();
      renderer.render(lifecycleRequest);
      drainWorker(workers[0]);
      const jobCount = workers[0].postedMessages.length;
      renderer.render({ ...lifecycleRequest, ...change });
      expect(workers[0].postedMessages.length).toBeGreaterThan(jobCount);
      expect(last(states)?.status).toBe('rendering');
    },
  );

  it('invalidates a precise origin change even when Float64 bounds are unchanged', () => {
    const { renderer, workers } = createRendererHarness();
    const origin = parseDecimalCoordinate('-0.75000000000000000001');
    const request = {
      ...lifecycleRequest,
      perturbation: {
        centreReal: origin,
        centreImag: origin,
        originReal: origin,
        originImag: origin,
        zoom: 1e20,
      },
    };
    renderer.render(request);
    drainWorker(workers[0]);
    renderer.render({
      ...request,
      perturbation: {
        ...request.perturbation,
        originReal: parseDecimalCoordinate('-0.75000000000000000002'),
      },
    });
    expect(workers[0].postedMessages).toHaveLength(2);
  });
});
