import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { PaletteStop } from '../../util/PaletteGenerator';
import {
  DEFAULT_JULIA,
  normaliseAlgorithm,
  type FractalAlgorithm,
} from '../../util/fractals';
import type { RenderSettings } from '../../state/settings';
import { START } from '../../workers/WorkerCommands';
import {
  CPU_PERTURBATION_ZOOM_THRESHOLD,
  resolveCpuPalettePosition,
} from '../../engine/cpu';
import { WebGLRenderer, type WebGLRenderRequest } from '../../engine/gpu';
import {
  computeViewportGeometry,
  translateNavigation,
  type Navigation,
} from '../../engine/viewport';
import { createRenderPalette } from '../../engine/renderPresentation';

type PalettePreviewProps = {
  algorithm: FractalAlgorithm;
  navigation: Navigation;
  paletteStops: PaletteStop[];
  settings: Pick<
    RenderSettings,
    | 'autoIterationsScale'
    | 'autoMaxIterations'
    | 'colourMode'
    | 'colourPeriod'
    | 'maxIterations'
    | 'paletteSmoothness'
    | 'renderBackend'
    | 'gpuPrecision'
    | 'gpuLimbProfile'
    | 'smooth'
  >;
};

type PreviewData = {
  values: Float64Array;
  width: number;
  height: number;
  max: number;
  smooth: boolean;
};

const PREVIEW_SIZE = 320;

const PalettePreview = ({
  algorithm,
  navigation,
  paletteStops,
  settings,
}: PalettePreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gpuRendererRef = useRef<WebGLRenderer | null>(null);
  const latestGpuRequestRef = useRef<WebGLRenderRequest | null>(null);
  const renderIdRef = useRef(0);
  const resolvedAlgorithm = useMemo(
    () => normaliseAlgorithm(algorithm),
    [algorithm],
  );
  const [navState, setNavState] = useState<Navigation>(() => navigation);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const navXCoefficient = navState.x.coefficient;
  const navXExponent = navState.x.exponent;
  const navYCoefficient = navState.y.coefficient;
  const navYExponent = navState.y.exponent;
  const navZoom = navState.z;
  const useGpuPreview = settings.renderBackend === 'gpu';
  const previewPalette = useMemo(
    () => createRenderPalette(paletteStops, settings.paletteSmoothness),
    [paletteStops, settings.paletteSmoothness],
  );

  useEffect(() => {
    // Live canvas navigation is the source when the preview opens or history
    // changes; preview-local zooming takes over until that source changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNavState((current) =>
      current.x.coefficient === navigation.x.coefficient &&
      current.x.exponent === navigation.x.exponent &&
      current.y.coefficient === navigation.y.coefficient &&
      current.y.exponent === navigation.y.exponent &&
      current.z === navigation.z
        ? current
        : {
            x: {
              coefficient: navigation.x.coefficient,
              exponent: navigation.x.exponent,
            },
            y: {
              coefficient: navigation.y.coefficient,
              exponent: navigation.y.exponent,
            },
            z: navigation.z,
          },
    );
  }, [
    navigation.x.coefficient,
    navigation.x.exponent,
    navigation.y.coefficient,
    navigation.y.exponent,
    navigation.z,
  ]);

  useEffect(() => {
    if (useGpuPreview) {
      return;
    }
    const geometry = computeViewportGeometry(
      {
        x: { coefficient: navXCoefficient, exponent: navXExponent },
        y: { coefficient: navYCoefficient, exponent: navYExponent },
        z: navZoom,
      },
      PREVIEW_SIZE,
      PREVIEW_SIZE,
    );
    const maxIterations = settings.autoMaxIterations
      ? Math.max(
          settings.maxIterations,
          settings.maxIterations +
            settings.autoIterationsScale * Math.log2(Math.max(1, navZoom)),
        )
      : settings.maxIterations;

    const worker = new Worker(
      new URL('../../workers/Mandelbrot.worker.ts', import.meta.url),
      { type: 'module' },
    );
    const renderId = renderIdRef.current + 1;
    renderIdRef.current = renderId;

    worker.onmessage = (event) => {
      const response = event.data as {
        renderId: number;
        values: ArrayLike<number>;
        width: number;
        height: number;
        max: number;
      };
      if (response.renderId !== renderId) {
        return;
      }
      setPreviewData({
        values:
          response.values instanceof Float64Array
            ? response.values
            : Float64Array.from(response.values),
        width: PREVIEW_SIZE,
        height: PREVIEW_SIZE,
        max: response.max,
        smooth: settings.smooth,
      });
      worker.terminate();
    };

    worker.postMessage({
      cmd: START,
      renderId,
      tileId: 0,
      stepIndex: 0,
      px: 0,
      py: 0,
      x0: geometry.x0,
      y0: geometry.y0,
      xScale: geometry.xScale,
      yScale: geometry.yScale,
      width: PREVIEW_SIZE,
      height: PREVIEW_SIZE,
      blockSize: 1,
      max: Math.round(maxIterations),
      smooth: settings.smooth,
      algorithm: resolvedAlgorithm,
      juliaCr: DEFAULT_JULIA.real,
      juliaCi: DEFAULT_JULIA.imag,
      ...(resolvedAlgorithm === 'mandelbrot' &&
      navZoom >= CPU_PERTURBATION_ZOOM_THRESHOLD
        ? {
            perturbation: {
              centreReal: {
                coefficient: navXCoefficient,
                exponent: navXExponent,
              },
              centreImag: {
                coefficient: navYCoefficient,
                exponent: navYExponent,
              },
              originReal: geometry.preciseX0,
              originImag: geometry.preciseY0,
              zoom: navZoom,
            },
          }
        : {}),
    });

    return () => {
      worker.terminate();
    };
  }, [
    navXCoefficient,
    navXExponent,
    navYCoefficient,
    navYExponent,
    navZoom,
    resolvedAlgorithm,
    settings.autoIterationsScale,
    settings.autoMaxIterations,
    settings.maxIterations,
    settings.smooth,
    useGpuPreview,
  ]);

  useEffect(() => {
    if (!useGpuPreview || !gpuCanvasRef.current) {
      return;
    }
    let receivedCapabilities = false;
    let wasAvailable = false;
    const renderer = new WebGLRenderer(gpuCanvasRef.current, {
      restoreLastRender: false,
      onCapabilitiesChange: (capabilities) => {
        const contextRestored =
          receivedCapabilities && !wasAvailable && capabilities.available;
        receivedCapabilities = true;
        wasAvailable = capabilities.available;
        if (contextRestored) {
          queueMicrotask(() => {
            const currentRenderer = gpuRendererRef.current;
            const currentRequest = latestGpuRequestRef.current;
            if (currentRenderer === renderer && currentRequest) {
              currentRenderer.render(currentRequest);
            }
          });
        }
      },
    });
    gpuRendererRef.current = renderer;
    return () => {
      if (gpuRendererRef.current === renderer) {
        gpuRendererRef.current = null;
        latestGpuRequestRef.current = null;
      }
      renderer.dispose();
    };
  }, [useGpuPreview]);

  useEffect(() => {
    const renderer = gpuRendererRef.current;
    if (!useGpuPreview || !renderer) {
      return;
    }
    const geometry = computeViewportGeometry(
      {
        x: { coefficient: navXCoefficient, exponent: navXExponent },
        y: { coefficient: navYCoefficient, exponent: navYExponent },
        z: navZoom,
      },
      PREVIEW_SIZE,
      PREVIEW_SIZE,
    );
    const maxIterations = settings.autoMaxIterations
      ? Math.max(
          settings.maxIterations,
          settings.maxIterations +
            settings.autoIterationsScale * Math.log2(Math.max(1, navZoom)),
        )
      : settings.maxIterations;
    renderer.resize(PREVIEW_SIZE, PREVIEW_SIZE);
    const request: WebGLRenderRequest = {
      bounds: {
        x0: geometry.x0,
        y0: geometry.y0,
        xScale: geometry.xScale,
        yScale: geometry.yScale,
        preciseX0: geometry.preciseX0,
        preciseY0: geometry.preciseY0,
      },
      maxIterations,
      iterationSteps: [maxIterations],
      palette: previewPalette,
      colourMode: settings.colourMode,
      colourPeriod: settings.colourPeriod,
      smooth: settings.smooth,
      ditherStrength: 0,
      algorithm: resolvedAlgorithm,
      precision: settings.gpuPrecision,
      limbProfile: settings.gpuLimbProfile,
      julia: DEFAULT_JULIA,
    };
    latestGpuRequestRef.current = request;
    renderer.render(request);
  }, [
    navXCoefficient,
    navXExponent,
    navYCoefficient,
    navYExponent,
    navZoom,
    previewPalette,
    resolvedAlgorithm,
    settings.autoIterationsScale,
    settings.autoMaxIterations,
    settings.colourMode,
    settings.colourPeriod,
    settings.gpuLimbProfile,
    settings.gpuPrecision,
    settings.maxIterations,
    settings.smooth,
    useGpuPreview,
  ]);

  useEffect(() => {
    if (useGpuPreview || !previewData || !canvasRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    const { values, width, height, max, smooth } = previewData;
    canvas.width = width;
    canvas.height = height;
    const palette = previewPalette;
    const paletteSize = palette.length;
    const isDistribution = settings.colourMode === 'distribution';
    const isCycle = settings.colourMode === 'cycle';
    const paletteScale =
      settings.colourMode === 'normalize' || isDistribution
        ? (palette.length - 1) / Math.max(1, max)
        : isCycle
          ? (palette.length - 1) / Math.max(1, settings.colourPeriod)
          : (palette.length - 1) / 2048;
    let distributionCdf: Float32Array | null = null;
    if (isDistribution) {
      const bins = Math.max(1, Math.ceil(max));
      const histogram = new Uint32Array(bins);
      let total = 0;
      for (const value of values) {
        if (!Number.isFinite(value) || value >= max) {
          continue;
        }
        const bin = Math.min(bins - 1, Math.floor(value));
        histogram[bin] += 1;
        total += 1;
      }
      if (total > 0) {
        distributionCdf = new Float32Array(bins);
        let cumulative = 0;
        let cdfMin = 0;
        for (let index = 0; index < bins; index += 1) {
          cumulative += histogram[index];
          if (cdfMin === 0 && cumulative > 0) {
            cdfMin = cumulative / total;
          }
          distributionCdf[index] = cumulative / total;
        }
        const denominator = 1 - cdfMin;
        if (denominator > 0) {
          for (let index = 0; index < distributionCdf.length; index += 1) {
            distributionCdf[index] = Math.max(
              0,
              (distributionCdf[index] - cdfMin) / denominator,
            );
          }
        }
      }
    }

    const imageData = context.createImageData(width, height);
    let dataIndex = 0;
    for (const iterationValue of values) {
      let rgb: number[];
      if (isDistribution && distributionCdf) {
        if (iterationValue < max) {
          const base = Math.floor(iterationValue);
          const fraction = iterationValue - base;
          const baseIndex = Math.min(
            distributionCdf.length - 1,
            Math.max(0, base),
          );
          const nextIndex = Math.min(distributionCdf.length - 1, baseIndex + 1);
          const cdfValue =
            distributionCdf[baseIndex] +
            (distributionCdf[nextIndex] - distributionCdf[baseIndex]) *
              fraction;
          const scaled = Math.min(
            paletteSize - 1,
            Math.max(0, cdfValue * (paletteSize - 1)),
          );
          if (smooth) {
            const paletteIndex = Math.min(
              paletteSize - 2,
              Math.max(0, Math.floor(scaled)),
            );
            const t = scaled - paletteIndex;
            rgb = [
              palette[paletteIndex][0] +
                (palette[paletteIndex + 1][0] - palette[paletteIndex][0]) * t,
              palette[paletteIndex][1] +
                (palette[paletteIndex + 1][1] - palette[paletteIndex][1]) * t,
              palette[paletteIndex][2] +
                (palette[paletteIndex + 1][2] - palette[paletteIndex][2]) * t,
            ];
          } else {
            rgb = palette[Math.floor(scaled)];
          }
        } else {
          rgb = [0, 0, 0];
        }
      } else if (smooth) {
        if (iterationValue < max) {
          const scaled = paletteScale * iterationValue;
          const palettePosition = resolveCpuPalettePosition(
            scaled,
            paletteSize,
            isCycle,
          );
          const first = palette[palettePosition.firstIndex];
          const second = palette[palettePosition.nextIndex];
          rgb = [
            first[0] + (second[0] - first[0]) * palettePosition.amount,
            first[1] + (second[1] - first[1]) * palettePosition.amount,
            first[2] + (second[2] - first[2]) * palettePosition.amount,
          ];
        } else {
          rgb = [0, 0, 0];
        }
      } else if (iterationValue < max) {
        const scaled = paletteScale * iterationValue;
        const baseRaw = Math.floor(scaled);
        const paletteIndex = isCycle
          ? ((baseRaw % paletteSize) + paletteSize) % paletteSize
          : Math.min(paletteSize - 1, Math.max(0, baseRaw));
        rgb = palette[paletteIndex];
      } else {
        rgb = [0, 0, 0];
      }
      imageData.data[dataIndex++] = Math.floor(rgb[0]);
      imageData.data[dataIndex++] = Math.floor(rgb[1]);
      imageData.data[dataIndex++] = Math.floor(rgb[2]);
      imageData.data[dataIndex++] = 255;
    }
    context.putImageData(imageData, 0, 0);
  }, [
    previewData,
    previewPalette,
    settings.colourMode,
    settings.colourPeriod,
    useGpuPreview,
  ]);

  const applyZoomAt = (u: number, v: number, zoomIn: boolean) => {
    setNavState((current) => {
      const geometry = computeViewportGeometry(
        current,
        PREVIEW_SIZE,
        PREVIEW_SIZE,
      );
      const clampedU = Math.min(1, Math.max(0, u));
      const clampedV = Math.min(1, Math.max(0, v));
      const nextZoom = zoomIn
        ? Math.min(Number.MAX_VALUE, current.z * 2)
        : Math.max(1, current.z / 2);
      return translateNavigation(
        current,
        (clampedU - 0.5) * PREVIEW_SIZE * geometry.xScale,
        (clampedV - 0.5) * PREVIEW_SIZE * geometry.yScale,
        nextZoom,
      );
    });
  };

  const applyZoom = (event: MouseEvent<HTMLDivElement>, zoomIn: boolean) => {
    const rect = event.currentTarget.getBoundingClientRect();
    applyZoomAt(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
      zoomIn,
    );
  };

  return (
    <div className='space-y-2'>
      <div className='text-micro uppercase tracking-label text-dim'>
        Preview
      </div>
      <div className='overflow-hidden rounded-panel border border-rule bg-raised'>
        <div
          className='relative w-full cursor-zoom-in touch-manipulation pb-[100%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60'
          onClick={(event) => applyZoom(event, true)}
          onContextMenu={(event) => {
            event.preventDefault();
            applyZoom(event, false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              applyZoomAt(0.5, 0.5, true);
              return;
            }
            if (
              event.key === 'Backspace' ||
              event.key === 'Delete' ||
              event.key === '-'
            ) {
              event.preventDefault();
              applyZoomAt(0.5, 0.5, false);
            }
          }}
          role='button'
          tabIndex={0}
          aria-label='Palette preview. Press Enter to zoom in, Backspace to zoom out.'
        >
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 h-full w-full object-cover ${useGpuPreview ? 'hidden' : ''}`}
            aria-hidden
          />
          <canvas
            ref={gpuCanvasRef}
            className={`absolute inset-0 h-full w-full object-cover ${useGpuPreview ? '' : 'hidden'}`}
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
};

export default PalettePreview;
