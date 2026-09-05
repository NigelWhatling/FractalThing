import {
  useLayoutEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  calculateEffectiveMaxIterations,
  createCanvasFilter,
  createRenderPalette,
} from '../engine/renderPresentation';
import { formatDecimalCoordinate, type Navigation } from '../engine/viewport';
import { useCanvasInteractions } from '../hooks/useCanvasInteractions';
import { useFractalRenderer } from '../hooks/useFractalRenderer';
import type { RenderSettings } from '../state/settings';
import type { FractalAlgorithm } from '../util/fractals';
import InfoPanel from './InfoPanel';
import type { InteractionMode, PanelId } from '../state/ui';
import MiniMap from './MiniMap';

type FractalCanvasProps = Readonly<{
  /** Render surface width. Deliberately independent of the open panel. */
  width: number;
  /**
   * Width actually on screen. When a panel is open this is narrower than the
   * render surface: the canvas is shifted left rather than resized, so opening
   * a panel costs no re-render — which at 1e14 is several seconds of work.
   */
  visibleWidth?: number;
  height: number;
  algorithm: FractalAlgorithm;
  navigation: Navigation;
  setNavigation: Dispatch<SetStateAction<Navigation>>;
  settings: RenderSettings;
  interactionMode: InteractionMode;
  resetSignal?: number;
  uiOverlayOpen?: boolean;
  /** Distance from the viewport's left edge; non-zero when the rail is left. */
  offsetLeft?: number;
  /** Safe distance from the viewport's top edge. */
  offsetTop?: number;
  onOpenPanel?: (panel: PanelId) => void;
}>;

const FractalCanvas = ({
  width,
  visibleWidth = width,
  height,
  algorithm,
  navigation,
  setNavigation,
  settings,
  interactionMode,
  resetSignal = 0,
  uiOverlayOpen = false,
  offsetLeft = 0,
  offsetTop = 0,
  onOpenPanel,
}: FractalCanvasProps) => {
  const cpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (containerRef.current) {
      containerRef.current.inert = uiOverlayOpen;
    }
  }, [uiOverlayOpen]);
  const effectiveMaxIterations = useMemo(
    () =>
      calculateEffectiveMaxIterations(
        {
          autoIterationsScale: settings.autoIterationsScale,
          autoMaxIterations: settings.autoMaxIterations,
          maxIterations: settings.maxIterations,
        },
        navigation.z,
      ),
    [
      navigation.z,
      settings.autoIterationsScale,
      settings.autoMaxIterations,
      settings.maxIterations,
    ],
  );
  const palette = useMemo(
    () =>
      createRenderPalette(settings.paletteStops, settings.paletteSmoothness),
    [settings.paletteSmoothness, settings.paletteStops],
  );
  const canvasFilter = useMemo(
    () =>
      createCanvasFilter({
        filterMode: settings.filterMode,
        gaussianBlur: settings.gaussianBlur,
        hueRotate: settings.hueRotate,
      }),
    [settings.filterMode, settings.gaussianBlur, settings.hueRotate],
  );
  const renderer = useFractalRenderer({
    cpuCanvasRef,
    gpuCanvasRef,
    width,
    height,
    settings,
    algorithm,
    navigation,
    palette,
    effectiveMaxIterations,
  });
  const interactions = useCanvasInteractions({
    cpuCanvasRef,
    gpuCanvasRef,
    containerRef,
    width,
    height,
    navigation,
    setNavigation,
    interactionMode,
    useGpuCanvas: renderer.useGpuCanvas,
    uiOverlayOpen,
    resetSignal,
    shiftCpu: renderer.shiftCpu,
  });

  return (
    <div
      ref={containerRef}
      style={{ width: visibleWidth, height, left: offsetLeft, top: offsetTop }}
      className='unrendered absolute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60'
      role='region'
      aria-label='Fractal canvas'
      aria-describedby='canvas-help'
      aria-busy={renderer.isRendering}
      tabIndex={uiOverlayOpen ? -1 : 0}
      onKeyDown={interactions.handleKeyDown}
      onBlur={interactions.handleBlur}
    >
      <span id='canvas-help' className='sr-only'>
        Drag to pan. Scroll or click to zoom. Use arrow keys to pan and plus or
        minus to zoom.
      </span>
      {/*
        The render surface keeps its full width and slides left by half the
        hidden strip, putting the fractal centre back in the visible centre.
        Resizing it instead would be correct but costs a full re-render on every
        panel open. The overhang sits under the panel, already drawn.
      */}
      <div
        className='absolute left-0 top-0'
        style={{
          width,
          height,
          transform: `translateX(${-(width - visibleWidth) / 2}px)`,
        }}
      >
        <canvas
          ref={cpuCanvasRef}
          width={width}
          height={height}
          style={{ filter: canvasFilter }}
          className={`absolute inset-0 touch-none ${renderer.useGpuCanvas ? 'hidden' : ''}`}
          aria-hidden={renderer.useGpuCanvas}
          tabIndex={-1}
        />
        <canvas
          ref={gpuCanvasRef}
          width={width}
          height={height}
          style={{ filter: canvasFilter }}
          className={`absolute inset-0 touch-none ${renderer.useGpuCanvas ? '' : 'hidden'}`}
          aria-hidden={!renderer.useGpuCanvas}
          tabIndex={-1}
        />
        {interactions.selectionRect && (
          <div
            className='pointer-events-none absolute z-10 border border-accent bg-accent/10'
            style={{
              left: interactions.selectionRect.x,
              top: interactions.selectionRect.y,
              width: interactions.selectionRect.width,
              height: interactions.selectionRect.height,
            }}
            aria-hidden
          />
        )}
      </div>
      {settings.showMinimap ? (
        <MiniMap
          algorithm={algorithm}
          navigation={interactions.displayNavigation}
          viewportWidth={width}
          viewportHeight={height}
          settings={settings}
        />
      ) : null}
      <InfoPanel
        nav={{
          x: formatDecimalCoordinate(interactions.displayNavigation.x),
          y: formatDecimalCoordinate(interactions.displayNavigation.y),
          z: interactions.displayNavigation.z,
        }}
        isRendering={renderer.isRendering}
        maxIterations={renderer.renderedMaxIterations}
        precisionWarning={renderer.precisionWarning}
        coordinateLabels={settings.coordinateLabels}
        renderMode={renderer.renderModeLabel}
        finalRenderMs={renderer.finalRenderMs}
        renderError={renderer.renderError}
        onOpenPanel={onOpenPanel}
      />
    </div>
  );
};

export default FractalCanvas;
