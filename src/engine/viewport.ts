import type { FractalView } from '../util/fractals';

export type DecimalCoordinate = Readonly<{
  coefficient: bigint;
  exponent: number;
}>;

export type Navigation = Readonly<{
  x: DecimalCoordinate;
  y: DecimalCoordinate;
  z: number;
}>;

export type ViewportGeometry = Readonly<{
  x0: number;
  y0: number;
  xScale: number;
  yScale: number;
  xOffset: number;
  yOffset: number;
  preciseX0: DecimalCoordinate;
  preciseY0: DecimalCoordinate;
}>;

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i;
const MAX_DECIMAL_DIGITS = 1024;
const MAX_DECIMAL_ABS_EXPONENT = 512;

const normaliseDecimal = (
  coefficient: bigint,
  exponent: number,
): DecimalCoordinate => {
  if (coefficient === 0n) {
    return { coefficient: 0n, exponent: 0 };
  }

  let nextCoefficient = coefficient;
  let nextExponent = exponent;
  while (nextCoefficient % 10n === 0n) {
    nextCoefficient /= 10n;
    nextExponent += 1;
  }
  return { coefficient: nextCoefficient, exponent: nextExponent };
};

export const parseDecimalCoordinate = (
  value: string,
  fallback: DecimalCoordinate = { coefficient: 0n, exponent: 0 },
): DecimalCoordinate => {
  const match = value.trim().match(DECIMAL_PATTERN);
  if (!match) {
    return fallback;
  }

  const [, sign, integer, fraction = '', rawExponent = '0'] = match;
  const digits = `${integer}${fraction}`.replace(/^0+(?=\d)/, '');
  if (digits.length > MAX_DECIMAL_DIGITS) {
    return fallback;
  }
  const parsedExponent = Number.parseInt(rawExponent, 10);
  const exponent = parsedExponent - fraction.length;
  if (
    !Number.isSafeInteger(parsedExponent) ||
    !Number.isSafeInteger(exponent) ||
    Math.abs(exponent) > MAX_DECIMAL_ABS_EXPONENT
  ) {
    return fallback;
  }
  const coefficient = BigInt(`${sign === '-' ? '-' : ''}${digits}`);
  const coordinate = normaliseDecimal(coefficient, exponent);
  return Number.isFinite(decimalCoordinateToNumber(coordinate))
    ? coordinate
    : fallback;
};

export const decimalCoordinateFromNumber = (
  value: number,
): DecimalCoordinate => {
  if (!Number.isFinite(value)) {
    return { coefficient: 0n, exponent: 0 };
  }
  return parseDecimalCoordinate(value.toString());
};

export const decimalCoordinateToNumber = ({
  coefficient,
  exponent,
}: DecimalCoordinate): number => Number(`${coefficient}e${exponent}`);

export const formatDecimalCoordinate = ({
  coefficient,
  exponent,
}: DecimalCoordinate): string => {
  if (coefficient === 0n) {
    return '0';
  }

  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient).toString();
  const decimalPosition = digits.length + exponent;
  const scientificExponent = decimalPosition - 1;
  const sign = negative ? '-' : '';

  if (decimalPosition <= -6 || decimalPosition > 21) {
    const fraction = digits.slice(1);
    return `${sign}${digits[0]}${fraction ? `.${fraction}` : ''}e${scientificExponent}`;
  }
  if (exponent >= 0) {
    return `${sign}${digits}${'0'.repeat(exponent)}`;
  }
  if (decimalPosition > 0) {
    return `${sign}${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
  }
  return `${sign}0.${'0'.repeat(-decimalPosition)}${digits}`;
};

export const addDecimalCoordinates = (
  left: DecimalCoordinate,
  right: DecimalCoordinate,
): DecimalCoordinate => {
  const exponent = Math.min(left.exponent, right.exponent);
  const leftScale = 10n ** BigInt(left.exponent - exponent);
  const rightScale = 10n ** BigInt(right.exponent - exponent);
  return normaliseDecimal(
    left.coefficient * leftScale + right.coefficient * rightScale,
    exponent,
  );
};

export const addNumberToDecimalCoordinate = (
  value: DecimalCoordinate,
  delta: number,
): DecimalCoordinate =>
  addDecimalCoordinates(value, decimalCoordinateFromNumber(delta));

export const navigationFromView = (view: FractalView): Navigation => ({
  x: decimalCoordinateFromNumber(view.x),
  y: decimalCoordinateFromNumber(view.y),
  z: view.z,
});

export const parseNavigation = (
  loc: string | undefined,
  fallback: FractalView,
): Navigation => {
  const defaults = navigationFromView(fallback);
  if (!loc) {
    return defaults;
  }

  const numberPattern = '-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?';
  const matches = loc.match(
    new RegExp(
      `@(${numberPattern}),(${numberPattern})(?:x(${numberPattern}))?`,
      'i',
    ),
  );
  if (!matches) {
    return defaults;
  }

  const zoom = matches[3] === undefined ? defaults.z : Number(matches[3]);
  return {
    x: parseDecimalCoordinate(matches[1], defaults.x),
    y: parseDecimalCoordinate(matches[2], defaults.y),
    z: Number.isFinite(zoom) && zoom > 0 ? zoom : defaults.z,
  };
};

export const formatNavigation = (navigation: Navigation): string =>
  `@${formatDecimalCoordinate(navigation.x)},${formatDecimalCoordinate(navigation.y)}x${navigation.z.toString()}`;

export const computeViewportGeometry = (
  navigation: Navigation,
  width: number,
  height: number,
): ViewportGeometry => {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const ratio = safeWidth / safeHeight;
  const halfHeight = 1 / navigation.z;
  const halfWidth = halfHeight * ratio;
  const xOffset = -halfWidth;
  const yOffset = -halfHeight;
  const xScale = (halfWidth * 2) / safeWidth;
  const yScale = (halfHeight * 2) / safeHeight;

  return {
    x0: decimalCoordinateToNumber(
      addNumberToDecimalCoordinate(navigation.x, xOffset),
    ),
    y0: decimalCoordinateToNumber(
      addNumberToDecimalCoordinate(navigation.y, yOffset),
    ),
    xScale,
    yScale,
    xOffset,
    yOffset,
    preciseX0: addNumberToDecimalCoordinate(navigation.x, xOffset),
    preciseY0: addNumberToDecimalCoordinate(navigation.y, yOffset),
  };
};

export const translateNavigation = (
  navigation: Navigation,
  deltaX: number,
  deltaY: number,
  zoom = navigation.z,
): Navigation => ({
  x: addNumberToDecimalCoordinate(navigation.x, deltaX),
  y: addNumberToDecimalCoordinate(navigation.y, deltaY),
  z: zoom,
});

export const navigationDisplayValues = (
  navigation: Navigation,
): FractalView => ({
  x: decimalCoordinateToNumber(navigation.x),
  y: decimalCoordinateToNumber(navigation.y),
  z: navigation.z,
});
