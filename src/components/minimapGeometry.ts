import {
  computeViewportGeometry,
  decimalCoordinateToNumber,
  type Navigation,
} from '../engine/viewport';

export type MiniMapIndicator =
  | Readonly<{
      kind: 'box';
      x: number;
      y: number;
      width: number;
      height: number;
    }>
  | Readonly<{
      kind: 'arrow';
      x: number;
      y: number;
    }>;

type MiniMapIndicatorOptions = Readonly<{
  overviewNavigation: Navigation;
  currentNavigation: Navigation;
  overviewWidth: number;
  overviewHeight: number;
  currentWidth: number;
  currentHeight: number;
  minimumBoxPixels?: number;
}>;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const calculateMiniMapIndicator = ({
  overviewNavigation,
  currentNavigation,
  overviewWidth,
  overviewHeight,
  currentWidth,
  currentHeight,
  minimumBoxPixels = 5,
}: MiniMapIndicatorOptions): MiniMapIndicator => {
  const overview = computeViewportGeometry(
    overviewNavigation,
    overviewWidth,
    overviewHeight,
  );
  const current = computeViewportGeometry(
    currentNavigation,
    currentWidth,
    currentHeight,
  );
  const centreX =
    (decimalCoordinateToNumber(currentNavigation.x) - overview.x0) /
    overview.xScale;
  const centreY =
    (decimalCoordinateToNumber(currentNavigation.y) - overview.y0) /
    overview.yScale;
  const boxWidth =
    (current.xScale * Math.max(1, currentWidth)) / overview.xScale;
  const boxHeight =
    (current.yScale * Math.max(1, currentHeight)) / overview.yScale;
  const rawLeft = centreX - boxWidth / 2;
  const rawTop = centreY - boxHeight / 2;
  const rawRight = centreX + boxWidth / 2;
  const rawBottom = centreY + boxHeight / 2;
  const left = clamp(rawLeft, 0, overviewWidth);
  const top = clamp(rawTop, 0, overviewHeight);
  const right = clamp(rawRight, 0, overviewWidth);
  const bottom = clamp(rawBottom, 0, overviewHeight);
  const intersectsOverview = right > left && bottom > top;

  if (
    boxWidth >= minimumBoxPixels &&
    boxHeight >= minimumBoxPixels &&
    intersectsOverview
  ) {
    return {
      kind: 'box',
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }

  return {
    kind: 'arrow',
    x: clamp(centreX, 8, overviewWidth - 8),
    y: clamp(centreY, 28, overviewHeight - 6),
  };
};
