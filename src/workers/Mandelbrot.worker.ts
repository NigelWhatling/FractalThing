/// <reference lib="webworker" />

import {
  START,
  STOP,
  type WorkerPerturbationData,
  type WorkerRequestMessage,
  type WorkerResponseMessage,
  type WorkerStartMessage,
} from './WorkerCommands';
import { createPointEvaluator } from '../engine/math/fractalEvaluators';
import {
  buildMandelbrotReferenceOrbit,
  evaluateMandelbrotGlitchFallback,
  evaluateMandelbrotPerturbationAt,
  type MandelbrotReferenceOrbit,
} from '../engine/math/perturbation';
import {
  decimalCoordinateFromNumber,
  type DecimalCoordinate,
} from '../engine/viewport';

const workerContext = globalThis as unknown as DedicatedWorkerGlobalScope;
const MAX_REFERENCE_CACHE_SIZE = 2;

type CachedReference = Readonly<{
  signature: string;
  orbit: MandelbrotReferenceOrbit;
}>;

type PixelEvaluator = (pixelX: number, pixelY: number) => number;

const referenceCache = new Map<number, CachedReference>();
let newestRenderId = -1;

const coordinateSignature = ({
  coefficient,
  exponent,
}: DecimalCoordinate): string => `${coefficient}:${exponent}`;

const referenceSignature = (
  data: WorkerStartMessage,
  perturbation: WorkerPerturbationData,
): string =>
  [
    coordinateSignature(perturbation.centreReal),
    coordinateSignature(perturbation.centreImag),
    perturbation.zoom,
    data.max,
    data.smooth ? 1 : 0,
  ].join('|');

const pruneReferenceCache = (renderId: number): void => {
  if (renderId > newestRenderId) {
    newestRenderId = renderId;
    for (const cachedRenderId of referenceCache.keys()) {
      if (cachedRenderId < renderId) {
        referenceCache.delete(cachedRenderId);
      }
    }
  }

  while (referenceCache.size > MAX_REFERENCE_CACHE_SIZE) {
    const oldestRenderId = referenceCache.keys().next().value as
      number | undefined;
    if (oldestRenderId === undefined) {
      break;
    }
    referenceCache.delete(oldestRenderId);
  }
};

const getReferenceOrbit = (
  data: WorkerStartMessage,
  perturbation: WorkerPerturbationData,
): MandelbrotReferenceOrbit => {
  const signature = referenceSignature(data, perturbation);
  const cached = referenceCache.get(data.renderId);
  if (cached?.signature === signature) {
    return cached.orbit;
  }

  const orbit = buildMandelbrotReferenceOrbit({
    cReal: perturbation.centreReal,
    cImag: perturbation.centreImag,
    zoom: perturbation.zoom,
    maxIterations: data.max,
    smooth: data.smooth,
  });
  referenceCache.set(data.renderId, { signature, orbit });
  pruneReferenceCache(data.renderId);
  return orbit;
};

const createPixelCoordinate = (
  origin: DecimalCoordinate,
  scale: number,
): ((pixel: number) => DecimalCoordinate) => {
  const decimalScale = decimalCoordinateFromNumber(scale);
  const exponent = Math.min(origin.exponent, decimalScale.exponent);
  const originCoefficient =
    origin.coefficient * 10n ** BigInt(origin.exponent - exponent);
  const scaleCoefficient =
    decimalScale.coefficient * 10n ** BigInt(decimalScale.exponent - exponent);

  return (pixel) => ({
    coefficient: originCoefficient + scaleCoefficient * BigInt(pixel),
    exponent,
  });
};

const createWorkerPointEvaluator = (
  data: WorkerStartMessage,
): PixelEvaluator => {
  const perturbation =
    data.algorithm === 'mandelbrot' ? data.perturbation : undefined;
  if (perturbation) {
    const reference = getReferenceOrbit(data, perturbation);
    const preciseRealAt = createPixelCoordinate(
      perturbation.originReal,
      data.xScale,
    );
    const preciseImagAt = createPixelCoordinate(
      perturbation.originImag,
      data.yScale,
    );

    return (pixelX, pixelY) => {
      const cReal = preciseRealAt(pixelX);
      const cImag = preciseImagAt(pixelY);
      const result = evaluateMandelbrotPerturbationAt(reference, cReal, cImag, {
        glitchThreshold: perturbation.glitchThreshold,
      });
      return result.status === 'glitched'
        ? evaluateMandelbrotGlitchFallback(reference, cReal, cImag)
        : result.value;
    };
  }

  const evaluatePoint = createPointEvaluator({
    algorithm: data.algorithm,
    maxIterations: data.max,
    smooth: data.smooth,
    juliaCr: data.juliaCr,
    juliaCi: data.juliaCi,
  });
  return (pixelX, pixelY) =>
    evaluatePoint(
      data.x0 + pixelX * data.xScale,
      data.y0 + pixelY * data.yScale,
    );
};

workerContext.addEventListener(
  'message',
  (event: MessageEvent<WorkerRequestMessage>) => {
    const data = event.data;
    switch (data.cmd) {
      case START: {
        pruneReferenceCache(data.renderId);
        const evaluatePoint = createWorkerPointEvaluator(data);
        const columns = Math.ceil(data.width / data.blockSize);
        const rows = Math.ceil(data.height / data.blockSize);
        const values = new Float64Array(columns * rows);
        let valueIndex = 0;

        for (let py = 0; py < data.height; py += data.blockSize) {
          for (let px = 0; px < data.width; px += data.blockSize) {
            values[valueIndex] = evaluatePoint(data.px + px, data.py + py);
            valueIndex += 1;
          }
        }

        const response: WorkerResponseMessage = {
          renderId: data.renderId,
          tileId: data.tileId,
          stepIndex: data.stepIndex,
          px: data.px,
          py: data.py,
          width: data.width,
          height: data.height,
          blockSize: data.blockSize,
          max: data.max,
          values,
        };

        workerContext.postMessage(response, [values.buffer]);
        break;
      }
      case STOP:
        referenceCache.clear();
        workerContext.close();
        break;
      default:
        break;
    }
  },
);
