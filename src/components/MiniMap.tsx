import { useEffect, useMemo, useRef } from 'react';
import { CpuRenderer, type CpuRenderRequest } from '../engine/cpu';
import {
  calculateEffectiveMaxIterations,
  createCanvasFilter,
  createRenderPalette,
} from '../engine/renderPresentation';
import {
  computeViewportGeometry,
  navigationFromView,
  type Navigation,
} from '../engine/viewport';
import type { RenderSettings } from '../state/settings';
import {
  DEFAULT_JULIA,
  getDefaultView,
  type FractalAlgorithm,
} from '../util/fractals';
import { calculateMiniMapIndicator } from './minimapGeometry';

type MiniMapProps = Readonly<{
  algorithm: FractalAlgorithm;
  navigation: Navigation;
  viewportWidth: number;
  viewportHeight: number;
  settings: RenderSettings;
}>;

const MINI_MAP_WIDTH = 224;
const MINI_MAP_HEIGHT = 140;
const MINIMUM_BOX_PIXELS = 5;

const MiniMap = ({
  algorithm,
  navigation,
  viewportWidth,
  viewportHeight,
  settings,
}: MiniMapProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<CpuRenderer | null>(null);
  const overviewNavigation = useMemo(
    () => navigationFromView(getDefaultView(algorithm)),
    [algorithm],
  );
  const palette = useMemo(
    () =>
      createRenderPalette(settings.paletteStops, settings.paletteSmoothness),
    [settings.paletteSmoothness, settings.paletteStops],
  );
  const overviewGeometry = useMemo(
    () =>
      computeViewportGeometry(
        overviewNavigation,
        MINI_MAP_WIDTH,
        MINI_MAP_HEIGHT,
      ),
    [overviewNavigation],
  );
  const indicator = useMemo(
    () =>
      calculateMiniMapIndicator({
        overviewNavigation,
        currentNavigation: navigation,
        overviewWidth: MINI_MAP_WIDTH,
        overviewHeight: MINI_MAP_HEIGHT,
        currentWidth: viewportWidth,
        currentHeight: viewportHeight,
        minimumBoxPixels: MINIMUM_BOX_PIXELS,
      }),
    [navigation, overviewNavigation, viewportHeight, viewportWidth],
  );
  const maxIterations = calculateEffectiveMaxIterations(
    settings,
    overviewNavigation.z,
  );
  const ditherStrength =
    settings.filterMode === 'dither' ? settings.ditherStrength : 0;
  const canvasFilter = createCanvasFilter(settings);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const renderer = new CpuRenderer(canvas, { workerCount: 1 });
    renderer.resize(MINI_MAP_WIDTH, MINI_MAP_HEIGHT);
    rendererRef.current = renderer;
    return () => {
      if (rendererRef.current === renderer) {
        rendererRef.current = null;
      }
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) {
      return;
    }
    const request: CpuRenderRequest = {
      bounds: {
        x0: overviewGeometry.x0,
        y0: overviewGeometry.y0,
        xScale: overviewGeometry.xScale,
        yScale: overviewGeometry.yScale,
      },
      width: MINI_MAP_WIDTH,
      height: MINI_MAP_HEIGHT,
      maxIterations,
      smooth: settings.smooth,
      algorithm,
      julia: DEFAULT_JULIA,
      palette,
      colourMode: settings.colourMode,
      colourPeriod: settings.colourPeriod,
      ditherStrength,
      tileSize: MINI_MAP_WIDTH,
      refinementSteps: 1,
      finalBlockSize: 1,
    };
    renderer.render(request);
  }, [
    algorithm,
    ditherStrength,
    maxIterations,
    overviewGeometry.x0,
    overviewGeometry.xScale,
    overviewGeometry.y0,
    overviewGeometry.yScale,
    palette,
    settings.colourMode,
    settings.colourPeriod,
    settings.smooth,
  ]);

  const indicatorLabel =
    indicator.kind === 'box'
      ? 'Current viewport shown as a box.'
      : 'Current location shown by a red arrow.';

  return (
    <aside
      className='pointer-events-none absolute right-3 z-40 aspect-[8/5] w-44 overflow-hidden rounded-panel border border-rule bg-panel-solid shadow-panel backdrop-blur-md sm:w-56'
      style={{ bottom: 'calc(var(--info-panel-height, 24px) + 12px)' }}
      role='img'
      aria-label={`Fractal overview. ${indicatorLabel}`}
    >
      <canvas
        ref={canvasRef}
        width={MINI_MAP_WIDTH}
        height={MINI_MAP_HEIGHT}
        className='absolute inset-0 h-full w-full'
        style={{ filter: canvasFilter }}
        aria-hidden
      />
      <svg
        className='absolute inset-0 h-full w-full'
        viewBox={`0 0 ${MINI_MAP_WIDTH} ${MINI_MAP_HEIGHT}`}
        aria-hidden='true'
      >
        {indicator.kind === 'box' ? (
          <>
            <rect
              x={indicator.x}
              y={indicator.y}
              width={indicator.width}
              height={indicator.height}
              fill='none'
              stroke='rgba(0, 0, 0, 0.8)'
              strokeWidth='2'
            />
            <rect
              x={indicator.x}
              y={indicator.y}
              width={indicator.width}
              height={indicator.height}
              fill='rgba(34, 211, 238, 0.12)'
              stroke='rgb(103, 232, 249)'
              strokeWidth='1'
            />
          </>
        ) : (
          <>
            <path
              d={`M ${indicator.x} ${indicator.y - 24} V ${indicator.y - 8} M ${indicator.x - 7} ${indicator.y - 14} L ${indicator.x} ${indicator.y - 5} L ${indicator.x + 7} ${indicator.y - 14}`}
              fill='none'
              stroke='rgba(0, 0, 0, 0.85)'
              strokeWidth='6'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
            <path
              d={`M ${indicator.x} ${indicator.y - 24} V ${indicator.y - 8} M ${indicator.x - 7} ${indicator.y - 14} L ${indicator.x} ${indicator.y - 5} L ${indicator.x + 7} ${indicator.y - 14}`}
              fill='none'
              stroke='rgb(248, 113, 113)'
              strokeWidth='3'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </>
        )}
      </svg>
    </aside>
  );
};

export default MiniMap;
