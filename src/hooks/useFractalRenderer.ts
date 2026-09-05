import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  CPU_PERTURBATION_ZOOM_THRESHOLD,
  CpuRenderer,
  type CpuRenderRequest,
} from '../engine/cpu';
import {
  WEBGL_LIMB_PROFILE_DEFINITIONS,
  WEBGL_MAX_ITERATIONS,
  WebGLRenderer,
  type WebGLRendererCapabilities,
  type WebGLRenderRequest,
  type WebGLRenderState,
} from '../engine/gpu';
import {
  computeViewportGeometry,
  decimalCoordinateToNumber,
  type Navigation,
} from '../engine/viewport';
import {
  DOUBLE_SINGLE_MANTISSA_BITS,
  FLOAT32_MANTISSA_BITS,
  FLOAT64_MANTISSA_BITS,
  isPrecisionExhausted,
  limbMantissaBits,
} from '../engine/precisionLimits';
import type { RenderSettings } from '../state/settings';
import { DEFAULT_JULIA, type FractalAlgorithm } from '../util/fractals';
import { resolveActiveRenderBackend } from '../engine/renderBackend';

type CanvasRef = RefObject<HTMLCanvasElement>;

type GpuStatusSnapshot = Pick<WebGLRenderState, 'status' | 'message'>;

export type UseFractalRendererOptions = Readonly<{
  cpuCanvasRef: CanvasRef;
  gpuCanvasRef: CanvasRef;
  width: number;
  height: number;
  settings: RenderSettings;
  algorithm: FractalAlgorithm;
  navigation: Navigation;
  palette: readonly (readonly number[])[];
  effectiveMaxIterations: number;
}>;

export type FractalRendererResult = Readonly<{
  useGpuCanvas: boolean;
  isRendering: boolean;
  finalRenderMs: number | null;
  renderError: string | null;
  renderedMaxIterations: number;
  renderModeLabel: string;
  precisionWarning: boolean;
  shiftCpu: (dx: number, dy: number) => void;
}>;

const useLatest = <T>(value: T) => {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
};

const buildGpuIterationSteps = (
  maxIterations: number,
  stepsCount: number,
): number[] => {
  const maxValue = Math.max(1, Math.round(maxIterations));
  const count = Math.max(1, Math.round(stepsCount));
  if (count === 1) {
    return [maxValue];
  }

  const steps: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const divisor = 2 ** (count - 1 - index);
    const step = Math.max(1, Math.round(maxValue / divisor));
    if (steps[steps.length - 1] !== step) {
      steps.push(step);
    }
  }
  steps[steps.length - 1] = maxValue;
  return steps;
};

const getLimbProfile = (profileId: RenderSettings['gpuLimbProfile']) =>
  WEBGL_LIMB_PROFILE_DEFINITIONS.find((profile) => profile.id === profileId) ??
  WEBGL_LIMB_PROFILE_DEFINITIONS[0];

const resolveGpuError = (
  settings: RenderSettings,
  capabilities: WebGLRendererCapabilities | null,
  gpuStatus: GpuStatusSnapshot,
): string | null => {
  if (settings.renderBackend !== 'gpu') {
    return null;
  }
  if (!capabilities?.available) {
    return capabilities?.failureReason ?? 'GPU unavailable';
  }
  if (settings.colourMode === 'distribution') {
    return 'GPU does not support distribution colouring';
  }
  if (
    settings.gpuPrecision === 'double' &&
    !capabilities.supportsDoubleDoublePrecision
  ) {
    return 'GPU double-double precision is unavailable on this WebGL implementation';
  }
  if (settings.gpuPrecision === 'limb') {
    if (capabilities.supportedLimbProfiles.length === 0) {
      return 'GPU limb shaders unavailable';
    }
    if (!capabilities.supportedLimbProfiles.includes(settings.gpuLimbProfile)) {
      return 'Limb profile unsupported';
    }
  }
  if (
    gpuStatus.status === 'error' ||
    gpuStatus.status === 'context-lost' ||
    gpuStatus.status === 'unavailable'
  ) {
    return gpuStatus.message ?? 'GPU unavailable';
  }
  return null;
};

/**
 * Backend badge for the readout: which path is actually evaluating pixels, and
 * at what arithmetic width. The CPU side switches to perturbation on its own,
 * so the label has to read the zoom rather than the settings alone.
 */
const resolveRenderModeLabel = (
  settings: RenderSettings,
  capabilities: WebGLRendererCapabilities | null,
  algorithm: FractalAlgorithm,
  zoom: number,
  activeBackend: RenderSettings['renderBackend'],
): string => {
  if (activeBackend !== 'gpu') {
    const perturbing =
      algorithm === 'mandelbrot' && zoom >= CPU_PERTURBATION_ZOOM_THRESHOLD;
    return perturbing ? 'cpu · perturb' : 'cpu · f64';
  }
  const profile = getLimbProfile(settings.gpuLimbProfile);
  const baseLabel =
    settings.gpuPrecision === 'limb'
      ? `gpu · limb×${profile.fractionalLimbs}`
      : settings.gpuPrecision === 'double'
        ? 'gpu · f32×2'
        : 'gpu · f32';
  return capabilities?.fragmentPrecision === 'mediump'
    ? `${baseLabel} · med`
    : baseLabel;
};

export const useFractalRenderer = ({
  cpuCanvasRef,
  gpuCanvasRef,
  width,
  height,
  settings,
  algorithm,
  navigation,
  palette,
  effectiveMaxIterations,
}: UseFractalRendererOptions): FractalRendererResult => {
  const cpuRendererRef = useRef<CpuRenderer | null>(null);
  const gpuRendererRef = useRef<WebGLRenderer | null>(null);
  const latestGpuRequestRef = useRef<WebGLRenderRequest | null>(null);
  const latestWorkerCount = useLatest(settings.workerCount);
  const [cpuRendering, setCpuRendering] = useState(false);
  const [gpuRendering, setGpuRendering] = useState(false);
  const [cpuFinalRenderMs, setCpuFinalRenderMs] = useState<number | null>(null);
  const [cpuError, setCpuError] = useState<string | null>(null);
  const [gpuFinalRenderMs, setGpuFinalRenderMs] = useState<number | null>(null);
  const [gpuCapabilities, setGpuCapabilities] =
    useState<WebGLRendererCapabilities | null>(null);
  const [gpuStatus, setGpuStatus] = useState<GpuStatusSnapshot>({
    status: 'idle',
    message: null,
  });
  const activeRenderBackend = resolveActiveRenderBackend(
    settings.renderBackend,
    gpuCapabilities,
  );
  const navigationXCoefficient = navigation.x.coefficient;
  const navigationXExponent = navigation.x.exponent;
  const navigationYCoefficient = navigation.y.coefficient;
  const navigationYExponent = navigation.y.exponent;
  const navigationZoom = navigation.z;

  const geometry = useMemo(
    () =>
      computeViewportGeometry(
        {
          x: {
            coefficient: navigationXCoefficient,
            exponent: navigationXExponent,
          },
          y: {
            coefficient: navigationYCoefficient,
            exponent: navigationYExponent,
          },
          z: navigationZoom,
        },
        width,
        height,
      ),
    [
      height,
      navigationXCoefficient,
      navigationXExponent,
      navigationYCoefficient,
      navigationYExponent,
      navigationZoom,
      width,
    ],
  );
  const gpuMaxIterations = Math.min(
    WEBGL_MAX_ITERATIONS,
    effectiveMaxIterations,
  );
  const gpuIterationSteps = useMemo(
    () =>
      buildGpuIterationSteps(gpuMaxIterations, settings.refinementStepsCount),
    [gpuMaxIterations, settings.refinementStepsCount],
  );
  const ditherStrength =
    settings.filterMode === 'dither' ? Math.max(0, settings.ditherStrength) : 0;
  const originRealCoefficient = geometry.preciseX0.coefficient;
  const originRealExponent = geometry.preciseX0.exponent;
  const originImagCoefficient = geometry.preciseY0.coefficient;
  const originImagExponent = geometry.preciseY0.exponent;

  useEffect(() => {
    let active = true;
    const cpuCanvas = cpuCanvasRef.current;
    const cpuRenderer = cpuCanvas
      ? new CpuRenderer(cpuCanvas, {
          workerCount: latestWorkerCount.current,
          onStateChange: (state) => {
            if (!active) {
              return;
            }
            setCpuRendering(state.status === 'rendering');
            const nextCpuError =
              state.status === 'unavailable' || state.status === 'error'
                ? (state.message ?? 'CPU renderer unavailable')
                : null;
            setCpuError((current) =>
              current === nextCpuError ? current : nextCpuError,
            );
            if (
              state.status === 'idle' ||
              state.status === 'rendering' ||
              state.status === 'cancelled' ||
              state.status === 'unavailable' ||
              state.status === 'error'
            ) {
              setCpuFinalRenderMs(null);
            }
          },
          onTiming: (timing) => {
            if (active) {
              setCpuFinalRenderMs(timing.elapsedMs);
            }
          },
        })
      : null;
    cpuRendererRef.current = cpuRenderer;
    return () => {
      active = false;
      cpuRendererRef.current = null;
      cpuRenderer?.dispose();
    };
  }, [cpuCanvasRef, latestWorkerCount]);

  useEffect(() => {
    if (settings.renderBackend !== 'gpu') return;
    let active = true;
    let receivedGpuCapabilities = false;
    let gpuWasAvailable = false;
    const gpuCanvas = gpuCanvasRef.current;
    const gpuRenderer = gpuCanvas
      ? new WebGLRenderer(gpuCanvas, {
          restoreLastRender: false,
          onCapabilitiesChange: (capabilities) => {
            if (!active) {
              return;
            }
            const contextRestored =
              receivedGpuCapabilities &&
              !gpuWasAvailable &&
              capabilities.available;
            receivedGpuCapabilities = true;
            gpuWasAvailable = capabilities.available;
            setGpuCapabilities(capabilities);
            if (contextRestored) {
              queueMicrotask(() => {
                const currentRenderer = gpuRendererRef.current;
                const currentRequest = latestGpuRequestRef.current;
                if (active && currentRenderer && currentRequest) {
                  currentRenderer.render(currentRequest);
                }
              });
            }
          },
          onStateChange: (state) => {
            if (!active) {
              return;
            }
            setGpuRendering(state.status === 'rendering');
            setGpuStatus((current) =>
              current.status === state.status &&
              current.message === state.message
                ? current
                : { status: state.status, message: state.message },
            );
            if (
              state.status === 'idle' ||
              state.status === 'rendering' ||
              state.status === 'cancelled' ||
              state.status === 'unavailable' ||
              state.status === 'context-lost' ||
              state.status === 'error'
            ) {
              setGpuFinalRenderMs(null);
            }
          },
          onTiming: (timing) => {
            if (!active) {
              return;
            }
            setGpuFinalRenderMs(timing.gpuElapsedMs ?? timing.cpuSubmitMs);
          },
        })
      : null;

    gpuRendererRef.current = gpuRenderer;

    return () => {
      active = false;
      if (gpuRendererRef.current === gpuRenderer) {
        gpuRendererRef.current = null;
        latestGpuRequestRef.current = null;
      }
      gpuRenderer?.dispose();
    };
  }, [gpuCanvasRef, settings.renderBackend]);

  useEffect(() => {
    cpuRendererRef.current?.resize(width, height);
    gpuRendererRef.current?.resize(width, height);
  }, [cpuCanvasRef, gpuCanvasRef, height, width]);

  useEffect(() => {
    cpuRendererRef.current?.setWorkerCount(settings.workerCount);
  }, [cpuCanvasRef, settings.workerCount]);

  useEffect(() => {
    if (activeRenderBackend === 'gpu') {
      cpuRendererRef.current?.suspend('GPU renderer active');
    } else {
      latestGpuRequestRef.current = null;
      gpuRendererRef.current?.cancel('CPU renderer active');
    }
  }, [activeRenderBackend, cpuCanvasRef, gpuCanvasRef]);

  useEffect(() => {
    if (activeRenderBackend !== 'cpu') {
      return;
    }
    const renderer = cpuRendererRef.current;
    if (!renderer || width <= 0 || height <= 0) {
      return;
    }
    const request: CpuRenderRequest = {
      bounds: {
        x0: geometry.x0,
        y0: geometry.y0,
        xScale: geometry.xScale,
        yScale: geometry.yScale,
      },
      width,
      height,
      maxIterations: effectiveMaxIterations,
      smooth: settings.smooth,
      algorithm,
      julia: DEFAULT_JULIA,
      palette,
      colourMode: settings.colourMode,
      colourPeriod: settings.colourPeriod,
      ditherStrength,
      tileSize: settings.tileSize,
      refinementSteps: settings.refinementStepsCount,
      finalBlockSize: settings.finalBlockSize,
      perturbation:
        algorithm === 'mandelbrot' &&
        navigationZoom >= CPU_PERTURBATION_ZOOM_THRESHOLD
          ? {
              centreReal: {
                coefficient: navigationXCoefficient,
                exponent: navigationXExponent,
              },
              centreImag: {
                coefficient: navigationYCoefficient,
                exponent: navigationYExponent,
              },
              originReal: {
                coefficient: originRealCoefficient,
                exponent: originRealExponent,
              },
              originImag: {
                coefficient: originImagCoefficient,
                exponent: originImagExponent,
              },
              zoom: navigationZoom,
            }
          : undefined,
    };
    renderer.render(request);
  }, [
    algorithm,
    cpuCanvasRef,
    ditherStrength,
    effectiveMaxIterations,
    geometry.x0,
    geometry.xScale,
    geometry.y0,
    geometry.yScale,
    height,
    navigationXCoefficient,
    navigationXExponent,
    navigationYCoefficient,
    navigationYExponent,
    navigationZoom,
    originImagCoefficient,
    originImagExponent,
    originRealCoefficient,
    originRealExponent,
    palette,
    settings.colourMode,
    settings.colourPeriod,
    settings.finalBlockSize,
    settings.refinementStepsCount,
    activeRenderBackend,
    settings.smooth,
    settings.tileSize,
    settings.workerCount,
    width,
  ]);

  useEffect(() => {
    if (activeRenderBackend !== 'gpu') {
      return;
    }
    const renderer = gpuRendererRef.current;
    if (!renderer || width <= 0 || height <= 0) {
      return;
    }
    const request: WebGLRenderRequest = {
      bounds: {
        x0: geometry.x0,
        y0: geometry.y0,
        xScale: geometry.xScale,
        yScale: geometry.yScale,
        preciseX0: {
          coefficient: originRealCoefficient,
          exponent: originRealExponent,
        },
        preciseY0: {
          coefficient: originImagCoefficient,
          exponent: originImagExponent,
        },
      },
      maxIterations: gpuMaxIterations,
      iterationSteps: gpuIterationSteps,
      palette,
      colourMode: settings.colourMode,
      colourPeriod: settings.colourPeriod,
      smooth: settings.smooth,
      ditherStrength,
      algorithm,
      precision: settings.gpuPrecision,
      limbProfile: settings.gpuLimbProfile,
      julia: DEFAULT_JULIA,
    };
    latestGpuRequestRef.current = request;
    renderer.render(request);
  }, [
    algorithm,
    ditherStrength,
    gpuMaxIterations,
    geometry.x0,
    geometry.xScale,
    geometry.y0,
    geometry.yScale,
    gpuCanvasRef,
    gpuIterationSteps,
    height,
    originImagCoefficient,
    originImagExponent,
    originRealCoefficient,
    originRealExponent,
    palette,
    settings.colourMode,
    settings.colourPeriod,
    settings.gpuLimbProfile,
    settings.gpuPrecision,
    activeRenderBackend,
    settings.smooth,
    width,
  ]);

  const shiftCpu = useCallback((dx: number, dy: number) => {
    cpuRendererRef.current?.shift(dx, dy);
  }, []);

  const useGpuCanvas = activeRenderBackend === 'gpu';
  const isRendering = useGpuCanvas ? gpuRendering : cpuRendering;
  const finalRenderMs = useGpuCanvas ? gpuFinalRenderMs : cpuFinalRenderMs;
  const gpuError = resolveGpuError(settings, gpuCapabilities, gpuStatus);
  const renderError = useGpuCanvas
    ? gpuError
    : (cpuError ?? (settings.renderBackend === 'gpu' ? gpuError : null));
  const renderedMaxIterations = useGpuCanvas
    ? gpuMaxIterations
    : effectiveMaxIterations;
  const renderModeLabel = resolveRenderModeLabel(
    settings,
    gpuCapabilities,
    algorithm,
    navigationZoom,
    activeRenderBackend,
  );
  const precisionWarning = useMemo(() => {
    if (
      activeRenderBackend === 'cpu' &&
      algorithm === 'mandelbrot' &&
      navigationZoom >= CPU_PERTURBATION_ZOOM_THRESHOLD
    ) {
      return geometry.xScale === 0 || geometry.yScale === 0;
    }
    const profile = getLimbProfile(settings.gpuLimbProfile);
    const mantissaBits =
      activeRenderBackend !== 'gpu'
        ? FLOAT64_MANTISSA_BITS
        : settings.gpuPrecision === 'single'
          ? FLOAT32_MANTISSA_BITS
          : settings.gpuPrecision === 'double'
            ? gpuCapabilities?.supportsDoubleDoublePrecision
              ? DOUBLE_SINGLE_MANTISSA_BITS
              : FLOAT32_MANTISSA_BITS
            : limbMantissaBits(profile.fractionalLimbs);
    const coordinateScale = Math.max(
      1,
      Math.abs(
        decimalCoordinateToNumber({
          coefficient: navigationXCoefficient,
          exponent: navigationXExponent,
        }),
      ),
      Math.abs(
        decimalCoordinateToNumber({
          coefficient: navigationYCoefficient,
          exponent: navigationYExponent,
        }),
      ),
    );
    const orbit = {
      zoom: navigationZoom,
      maxIterations: effectiveMaxIterations,
    };
    return (
      isPrecisionExhausted({
        pixelScale: geometry.xScale,
        coordinateScale,
        mantissaBits,
        ...orbit,
      }) ||
      isPrecisionExhausted({
        pixelScale: geometry.yScale,
        coordinateScale,
        mantissaBits,
        ...orbit,
      })
    );
  }, [
    algorithm,
    activeRenderBackend,
    geometry.xScale,
    geometry.yScale,
    navigationXCoefficient,
    navigationXExponent,
    navigationYCoefficient,
    navigationYExponent,
    navigationZoom,
    settings.gpuLimbProfile,
    settings.gpuPrecision,
    gpuCapabilities?.supportsDoubleDoublePrecision,
    effectiveMaxIterations,
  ]);

  return {
    useGpuCanvas,
    isRendering,
    finalRenderMs,
    renderError,
    renderedMaxIterations,
    renderModeLabel,
    precisionWarning,
    shiftCpu,
  };
};
