import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseDecimalCoordinate } from '../engine/viewport';
import { buildMandelbrotReferenceOrbit } from '../engine/math/perturbation';
import {
  START,
  STOP,
  type WorkerRequestMessage,
  type WorkerResponseMessage,
  type WorkerStartMessage,
} from './WorkerCommands';

vi.mock('../engine/math/perturbation', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../engine/math/perturbation')>();
  return {
    ...actual,
    buildMandelbrotReferenceOrbit: vi.fn(actual.buildMandelbrotReferenceOrbit),
  };
});

describe('Mandelbrot worker perturbation path', () => {
  let handleMessage!: (event: MessageEvent<WorkerRequestMessage>) => void;
  const postMessage = vi.fn();
  const close = vi.fn();

  beforeAll(async () => {
    vi.stubGlobal(
      'addEventListener',
      vi.fn(
        (
          type: string,
          listener: (event: MessageEvent<WorkerRequestMessage>) => void,
        ) => {
          if (type === 'message') {
            handleMessage = listener;
          }
        },
      ),
    );
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('close', close);
    await import('./Mandelbrot.worker');
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  const createMessage = (
    renderId: number,
    algorithm: WorkerStartMessage['algorithm'] = 'mandelbrot',
  ): WorkerStartMessage => ({
    cmd: START,
    renderId,
    tileId: renderId,
    stepIndex: 0,
    px: 0,
    py: 0,
    x0: 2,
    y0: 0,
    xScale: 1e-30,
    yScale: 1e-30,
    width: 1,
    height: 1,
    blockSize: 1,
    max: 10,
    smooth: false,
    algorithm,
    juliaCr: 0,
    juliaCi: 0,
    perturbation: {
      centreReal: parseDecimalCoordinate('1e-30'),
      centreImag: parseDecimalCoordinate('0'),
      originReal: parseDecimalCoordinate('0'),
      originImag: parseDecimalCoordinate('0'),
      zoom: 1e30,
    },
  });

  it('resolves glitches, reuses references, bounds stale cache and ignores Julia config', () => {
    const buildReference = vi.mocked(buildMandelbrotReferenceOrbit);
    buildReference.mockClear();

    handleMessage({
      data: createMessage(100),
    } as MessageEvent<WorkerRequestMessage>);
    handleMessage({
      data: createMessage(100),
    } as MessageEvent<WorkerRequestMessage>);
    handleMessage({
      data: createMessage(101),
    } as MessageEvent<WorkerRequestMessage>);
    handleMessage({
      data: createMessage(102, 'julia'),
    } as MessageEvent<WorkerRequestMessage>);
    for (const renderId of [100, 101, 99, 100]) {
      handleMessage({
        data: createMessage(renderId),
      } as MessageEvent<WorkerRequestMessage>);
    }

    expect(buildReference).toHaveBeenCalledTimes(6);
    const responses = postMessage.mock.calls.map(
      ([response]) => response as WorkerResponseMessage,
    );
    for (const [response, transfer] of postMessage.mock.calls) {
      const typedResponse = response as WorkerResponseMessage;
      expect(transfer).toEqual([typedResponse.values.buffer]);
    }
    expect(Array.from(responses[0].values)).toEqual([10]);
    expect(Array.from(responses[1].values)).toEqual([10]);
    expect(Array.from(responses[2].values)).toEqual([10]);
    expect(Array.from(responses[3].values)).toEqual([1]);
    for (const response of responses.slice(4)) {
      expect(Array.from(response.values)).toEqual([10]);
    }

    handleMessage({
      data: { cmd: STOP, renderId: 103 },
    } as MessageEvent<WorkerRequestMessage>);
    expect(close).toHaveBeenCalledOnce();
  });
});
