import type { FractalAlgorithm } from '../../util/fractals';

export const DISCRETE_BAILOUT_SQUARED = 4;
export const SMOOTH_BAILOUT_SQUARED = 65_536;

export type EscapeTimeOptions = {
  maxIterations: number;
  smooth: boolean;
};

export type PointEvaluatorOptions = EscapeTimeOptions & {
  algorithm: FractalAlgorithm;
  juliaCr: number;
  juliaCi: number;
};

export type PointEvaluator = (realSeed: number, imagSeed: number) => number;

export const getBailoutSquared = (smooth: boolean): number =>
  smooth ? SMOOTH_BAILOUT_SQUARED : DISCRETE_BAILOUT_SQUARED;

export const calculateSmoothIteration = (
  iteration: number,
  magnitudeSquared: number,
  degree: number,
): number => {
  const logMagnitude = Math.log(magnitudeSquared) / 2;
  const nu = Math.log(logMagnitude / Math.LN2) / Math.log(degree);
  return iteration + 1 - nu;
};

export const isInMandelbrotMainCardioidOrPeriod2Bulb = (
  cReal: number,
  cImag: number,
): boolean => {
  const imagSquared = cImag * cImag;
  const cardioidReal = cReal - 0.25;
  const cardioidDistanceSquared = cardioidReal * cardioidReal + imagSquared;
  const inMainCardioid =
    cardioidDistanceSquared * (cardioidDistanceSquared + cardioidReal) <=
    0.25 * imagSquared;
  const bulbReal = cReal + 1;
  const inPeriod2Bulb = bulbReal * bulbReal + imagSquared <= 0.0625;

  return inMainCardioid || inPeriod2Bulb;
};

const finishEscapeTime = (
  iteration: number,
  magnitudeSquared: number,
  options: EscapeTimeOptions,
  degree: number,
): number => {
  if (
    !options.smooth ||
    magnitudeSquared <= getBailoutSquared(options.smooth)
  ) {
    return iteration;
  }

  return calculateSmoothIteration(iteration, magnitudeSquared, degree);
};

export const evaluateMandelbrotPoint = (
  cReal: number,
  cImag: number,
  options: EscapeTimeOptions,
): number => {
  if (isInMandelbrotMainCardioidOrPeriod2Bulb(cReal, cImag)) {
    return options.maxIterations;
  }

  const bailoutSquared = getBailoutSquared(options.smooth);
  let realPart = 0;
  let imagPart = 0;
  let realSquared = 0;
  let imagSquared = 0;
  let iteration = 0;

  let checkpointReal = realPart;
  let checkpointImag = imagPart;
  let checkpointPower = 1;
  let period = 0;

  while (
    realSquared + imagSquared <= bailoutSquared &&
    iteration < options.maxIterations
  ) {
    const nextReal = realSquared - imagSquared + cReal;
    const nextImag = 2 * realPart * imagPart + cImag;
    realPart = nextReal;
    imagPart = nextImag;
    realSquared = realPart * realPart;
    imagSquared = imagPart * imagPart;
    iteration += 1;

    if (realSquared + imagSquared > bailoutSquared) {
      break;
    }

    period += 1;
    if (realPart === checkpointReal && imagPart === checkpointImag) {
      return options.maxIterations;
    }
    if (period === checkpointPower) {
      checkpointReal = realPart;
      checkpointImag = imagPart;
      checkpointPower *= 2;
      period = 0;
    }
  }

  return finishEscapeTime(iteration, realSquared + imagSquared, options, 2);
};

export const evaluateJuliaPoint = (
  realSeed: number,
  imagSeed: number,
  cReal: number,
  cImag: number,
  options: EscapeTimeOptions,
): number => {
  const bailoutSquared = getBailoutSquared(options.smooth);
  let realPart = realSeed;
  let imagPart = imagSeed;
  let realSquared = realPart * realPart;
  let imagSquared = imagPart * imagPart;
  let iteration = 0;

  let checkpointReal = realPart;
  let checkpointImag = imagPart;
  let checkpointPower = 1;
  let period = 0;

  while (
    realSquared + imagSquared <= bailoutSquared &&
    iteration < options.maxIterations
  ) {
    const nextReal = realSquared - imagSquared + cReal;
    const nextImag = 2 * realPart * imagPart + cImag;
    realPart = nextReal;
    imagPart = nextImag;
    realSquared = realPart * realPart;
    imagSquared = imagPart * imagPart;
    iteration += 1;

    if (realSquared + imagSquared > bailoutSquared) {
      break;
    }

    period += 1;
    if (realPart === checkpointReal && imagPart === checkpointImag) {
      return options.maxIterations;
    }
    if (period === checkpointPower) {
      checkpointReal = realPart;
      checkpointImag = imagPart;
      checkpointPower *= 2;
      period = 0;
    }
  }

  return finishEscapeTime(iteration, realSquared + imagSquared, options, 2);
};

export const evaluateBurningShipPoint = (
  cReal: number,
  cImag: number,
  options: EscapeTimeOptions,
): number => {
  const bailoutSquared = getBailoutSquared(options.smooth);
  let realPart = 0;
  let imagPart = 0;
  let realSquared = 0;
  let imagSquared = 0;
  let iteration = 0;

  let checkpointReal = realPart;
  let checkpointImag = imagPart;
  let checkpointPower = 1;
  let period = 0;

  while (
    realSquared + imagSquared <= bailoutSquared &&
    iteration < options.maxIterations
  ) {
    const absReal = Math.abs(realPart);
    const absImag = Math.abs(imagPart);
    const nextReal = absReal * absReal - absImag * absImag + cReal;
    const nextImag = 2 * absReal * absImag + cImag;
    realPart = nextReal;
    imagPart = nextImag;
    realSquared = realPart * realPart;
    imagSquared = imagPart * imagPart;
    iteration += 1;

    if (realSquared + imagSquared > bailoutSquared) {
      break;
    }

    period += 1;
    if (realPart === checkpointReal && imagPart === checkpointImag) {
      return options.maxIterations;
    }
    if (period === checkpointPower) {
      checkpointReal = realPart;
      checkpointImag = imagPart;
      checkpointPower *= 2;
      period = 0;
    }
  }

  return finishEscapeTime(iteration, realSquared + imagSquared, options, 2);
};

export const evaluateTricornPoint = (
  cReal: number,
  cImag: number,
  options: EscapeTimeOptions,
): number => {
  const bailoutSquared = getBailoutSquared(options.smooth);
  let realPart = 0;
  let imagPart = 0;
  let realSquared = 0;
  let imagSquared = 0;
  let iteration = 0;

  let checkpointReal = realPart;
  let checkpointImag = imagPart;
  let checkpointPower = 1;
  let period = 0;

  while (
    realSquared + imagSquared <= bailoutSquared &&
    iteration < options.maxIterations
  ) {
    const nextReal = realSquared - imagSquared + cReal;
    const nextImag = -2 * realPart * imagPart + cImag;
    realPart = nextReal;
    imagPart = nextImag;
    realSquared = realPart * realPart;
    imagSquared = imagPart * imagPart;
    iteration += 1;

    if (realSquared + imagSquared > bailoutSquared) {
      break;
    }

    period += 1;
    if (realPart === checkpointReal && imagPart === checkpointImag) {
      return options.maxIterations;
    }
    if (period === checkpointPower) {
      checkpointReal = realPart;
      checkpointImag = imagPart;
      checkpointPower *= 2;
      period = 0;
    }
  }

  return finishEscapeTime(iteration, realSquared + imagSquared, options, 2);
};

export const evaluateMultibrot3Point = (
  cReal: number,
  cImag: number,
  options: EscapeTimeOptions,
): number => {
  const bailoutSquared = getBailoutSquared(options.smooth);
  let realPart = 0;
  let imagPart = 0;
  let realSquared = 0;
  let imagSquared = 0;
  let iteration = 0;

  let checkpointReal = realPart;
  let checkpointImag = imagPart;
  let checkpointPower = 1;
  let period = 0;

  while (
    realSquared + imagSquared <= bailoutSquared &&
    iteration < options.maxIterations
  ) {
    const nextReal =
      realSquared * realPart - 3 * realPart * imagSquared + cReal;
    const nextImag =
      3 * realSquared * imagPart - imagSquared * imagPart + cImag;
    realPart = nextReal;
    imagPart = nextImag;
    realSquared = realPart * realPart;
    imagSquared = imagPart * imagPart;
    iteration += 1;

    if (realSquared + imagSquared > bailoutSquared) {
      break;
    }

    period += 1;
    if (realPart === checkpointReal && imagPart === checkpointImag) {
      return options.maxIterations;
    }
    if (period === checkpointPower) {
      checkpointReal = realPart;
      checkpointImag = imagPart;
      checkpointPower *= 2;
      period = 0;
    }
  }

  return finishEscapeTime(iteration, realSquared + imagSquared, options, 3);
};

export const createPointEvaluator = (
  options: PointEvaluatorOptions,
): PointEvaluator => {
  const escapeOptions: EscapeTimeOptions = {
    maxIterations: options.maxIterations,
    smooth: options.smooth,
  };

  switch (options.algorithm) {
    case 'julia':
      return (realSeed, imagSeed) =>
        evaluateJuliaPoint(
          realSeed,
          imagSeed,
          options.juliaCr,
          options.juliaCi,
          escapeOptions,
        );
    case 'burning-ship':
      return (realSeed, imagSeed) =>
        evaluateBurningShipPoint(realSeed, imagSeed, escapeOptions);
    case 'tricorn':
      return (realSeed, imagSeed) =>
        evaluateTricornPoint(realSeed, imagSeed, escapeOptions);
    case 'multibrot-3':
      return (realSeed, imagSeed) =>
        evaluateMultibrot3Point(realSeed, imagSeed, escapeOptions);
    case 'mandelbrot':
    default:
      return (realSeed, imagSeed) =>
        evaluateMandelbrotPoint(realSeed, imagSeed, escapeOptions);
  }
};
