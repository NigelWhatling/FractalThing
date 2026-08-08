import { useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
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
import type { InteractionMode } from './InteractionModeToggle';
import MiniMap from './MiniMap';

type FractalCanvasProps = Readonly<{
  width: number;
  height: number;
  algorithm: FractalAlgorithm;
  navigation: Navigation;
  setNavigation: Dispatch<SetStateAction<Navigation>>;
  settings: RenderSettings;
  interactionMode: InteractionMode;
  resetSignal?: number;
  uiOverlayOpen?: boolean;
}>;

const FractalCanvas = ({
  width,
  height,
  algorithm,
  navigation,
  setNavigation,
  settings,
  interactionMode,
  resetSignal = 0,
  uiOverlayOpen = false,
}: FractalCanvasProps) => {
  const cpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
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
      style={{ width, height }}
      className='relative bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50'
      role='region'
      aria-label='Fractal canvas'
      aria-describedby='canvas-help'
      aria-busy={renderer.isRendering}
      tabIndex={0}
      onKeyDown={interactions.handleKeyDown}
      onBlur={interactions.handleBlur}
    >
      <span id='canvas-help' className='sr-only'>
        Drag to pan. Scroll or click to zoom. Use arrow keys to pan and plus or
        minus to zoom.
      </span>
      <canvas
        ref={cpuCanvasRef}
        width={width}
        height={height}
        style={{ filter: canvasFilter }}
        className={`absolute inset-0 touch-none bg-black ${renderer.useGpuCanvas ? 'hidden' : ''}`}
        aria-hidden={renderer.useGpuCanvas}
        tabIndex={-1}
      />
      <canvas
        ref={gpuCanvasRef}
        width={width}
        height={height}
        style={{ filter: canvasFilter }}
        className={`absolute inset-0 touch-none bg-black ${renderer.useGpuCanvas ? '' : 'hidden'}`}
        aria-hidden={!renderer.useGpuCanvas}
        tabIndex={-1}
      />
      {interactions.selectionRect && (
        <div
          className='pointer-events-none absolute z-10 border border-cyan-400/70 bg-cyan-400/10 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.2)] dark:border-cyan-300/70 dark:bg-cyan-300/10'
          style={{
            left: interactions.selectionRect.x,
            top: interactions.selectionRect.y,
            width: interactions.selectionRect.width,
            height: interactions.selectionRect.height,
          }}
          aria-hidden
        />
      )}
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
        renderMode={renderer.renderModeLabel}
        finalRenderMs={renderer.finalRenderMs}
        renderError={renderer.renderError}
      />
    </div>
  );
};

export default FractalCanvas;
