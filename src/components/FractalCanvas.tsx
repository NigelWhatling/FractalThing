import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PaletteGenerator from '../util/PaletteGenerator';
import { DEFAULT_JULIA, getDefaultView, normaliseAlgorithm } from '../util/fractals';
import { GPU_VERTEX_SHADER, buildFragmentShaderSource } from '../util/gpuShaders';
import InfoPanel from './InfoPanel';
import { START, type WorkerResponseMessage, type WorkerStartMessage } from '../workers/WorkerCommands';
import type { RenderSettings } from '../state/settings';

type Navigation = {
  x: number;
  y: number;
  z: number;
};

type InteractionMode = 'grab' | 'select';

type FractalCanvasProps = {
  width: number;
  height: number;
  loc?: string;
  settings: RenderSettings;
  interactionMode: InteractionMode;
  resetSignal?: number;
};

type RenderConfig = {
  renderId: number;
  max: number;
  pscale: number;
  palette: number[][];
  smooth: boolean;
  colourMode: RenderSettings['colourMode'];
  ditherStrength: number;
};

type RenderRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Tile = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  stepIndex: number;
  inFlight: boolean;
};

type DragState = {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  startNav: Navigation;
  startScale: {
    xScale: number;
    yScale: number;
  };
  moved: boolean;
};

type SelectionState = {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
};

type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type GpuTimerExt = {
  TIME_ELAPSED_EXT: number;
  QUERY_RESULT_AVAILABLE_EXT: number;
  QUERY_RESULT_EXT: number;
  GPU_DISJOINT_EXT: number;
  createQueryEXT: () => unknown;
  beginQueryEXT: (target: number, query: unknown) => void;
  endQueryEXT: (target: number) => void;
  getQueryObjectEXT: (query: unknown, pname: number) => number | boolean;
  deleteQueryEXT: (query: unknown) => void;
};

const BASE_NUMBER_RANGE = 1;
const BASE_BLOCK_SIZE = 256;
const MAX_PALETTE_ITERATIONS = 2048;
const PRECISION_EPS_SCALE = 512;
const GPU_MAX_ITERATIONS = 4096;
const LIMB_BASE = 1024;
const LIMB_HALF = LIMB_BASE / 2;
const LIMB_COUNT = 12;

const LIMB_PROFILES = [
  { id: 'balanced', label: 'Balanced', fractional: 4 },
  { id: 'high', label: 'High', fractional: 6 },
  { id: 'extreme', label: 'Extreme', fractional: 7 },
  { id: 'ultra', label: 'Ultra', fractional: 8 },
] as const;

type LimbProfileId = (typeof LIMB_PROFILES)[number]['id'];

const getLimbProfile = (id: string | undefined) =>
  LIMB_PROFILES.find((profile) => profile.id === id) ?? LIMB_PROFILES[0];


const parseFloatWithDefault = (value: string | undefined, fallback: number) => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const lerpRgb = (rgb1: number[], rgb2: number[], t: number) => {
  return [
    (1 - t) * rgb1[0] + t * rgb2[0],
    (1 - t) * rgb1[1] + t * rgb2[1],
    (1 - t) * rgb1[2] + t * rgb2[2],
  ];
};

const smoothPalette = (palette: number[][]) => {
  const length = palette.length;
  const smoothed: number[][] = new Array(length);

  for (let index = 0; index < length; index += 1) {
    const prev = palette[Math.max(0, index - 1)];
    const current = palette[index];
    const next = palette[Math.min(length - 1, index + 1)];
    smoothed[index] = [
      (prev[0] + 2 * current[0] + next[0]) / 4,
      (prev[1] + 2 * current[1] + next[1]) / 4,
      (prev[2] + 2 * current[2] + next[2]) / 4,
    ];
  }

  return smoothed;
};

const hash2d = (x: number, y: number) => {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};

type LimbVectors = {
  lo: [number, number, number, number];
  mid: [number, number, number, number];
  hi: [number, number, number, number];
};

const buildLimbVectors = (value: number, fractional: number): LimbVectors => {
  if (!Number.isFinite(value)) {
    return { lo: [0, 0, 0, 0], hi: [0, 0, 0, 0] };
  }
  const limbScale = LIMB_BASE ** fractional;
  let scaled = value * limbScale;
  if (!Number.isFinite(scaled)) {
    scaled = 0;
  }
  const sign = scaled < 0 ? -1 : 1;
  let remaining = Math.abs(scaled);
  const limbs = new Array<number>(LIMB_COUNT).fill(0);
  for (let index = 0; index < LIMB_COUNT; index += 1) {
    const digit = Math.floor(remaining % LIMB_BASE);
    limbs[index] = digit * sign;
    remaining = Math.floor(remaining / LIMB_BASE);
  }
  for (let index = 0; index < LIMB_COUNT - 1; index += 1) {
    const carry = Math.floor((limbs[index] + LIMB_HALF) / LIMB_BASE);
    limbs[index] -= carry * LIMB_BASE;
    limbs[index + 1] += carry;
  }
  const carry = Math.floor((limbs[LIMB_COUNT - 1] + LIMB_HALF) / LIMB_BASE);
  limbs[LIMB_COUNT - 1] -= carry * LIMB_BASE;
  return {
    lo: [limbs[0], limbs[1], limbs[2], limbs[3]],
    mid: [limbs[4], limbs[5], limbs[6], limbs[7]],
    hi: [limbs[8], limbs[9], limbs[10], limbs[11]],
  };
};

const createShader = (
  gl: WebGLRenderingContext,
  type: number,
  source: string
) => {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const status = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!status) {
    if (import.meta.env.DEV) {
      const info = gl.getShaderInfoLog(shader);
      console.warn('WebGL shader compile failed', info);
    }
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const createProgram = (
  gl: WebGLRenderingContext,
  includeLimb: boolean,
  limbFractional = 4,
  limbCount = LIMB_COUNT
) => {
  const precision =
    gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision > 0
      ? 'highp'
      : 'mediump';
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, GPU_VERTEX_SHADER);
  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    buildFragmentShaderSource(
      GPU_MAX_ITERATIONS,
      precision,
      includeLimb,
      limbFractional,
      limbCount
    )
  );
  if (!vertexShader || !fragmentShader) {
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  const status = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!status) {
    if (import.meta.env.DEV) {
      const info = gl.getProgramInfoLog(program);
      console.warn('WebGL program link failed', info);
    }
    gl.deleteProgram(program);
    return null;
  }
  return { program, precision };
};

const resolveAlgorithmIndex = (algorithm: string | undefined) => {
  switch (algorithm) {
    case 'julia':
      return 1;
    case 'burning-ship':
      return 2;
    case 'tricorn':
      return 3;
    case 'multibrot-3':
      return 4;
    case 'mandelbrot':
    default:
      return 0;
  }
};

const shiftFloatBuffer = (
  buffer: Float32Array,
  dx: number,
  dy: number,
  width: number,
  height: number
) => {
  const next = new Float32Array(buffer.length);
  next.fill(Number.NaN);
  for (let y = 0; y < height; y += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) {
      continue;
    }
    const rowOffset = y * width;
    const nextOffset = ny * width;
    for (let x = 0; x < width; x += 1) {
      const nx = x + dx;
      if (nx < 0 || nx >= width) {
        continue;
      }
      next[nextOffset + nx] = buffer[rowOffset + x];
    }
  }
  return next;
};

const buildBlockSteps = (stepsCount: number, finalBlockSize: number) => {
  const clampedSteps = Math.max(2, Math.round(stepsCount));
  const clampedFinal = Math.min(BASE_BLOCK_SIZE, Math.max(1, Math.round(finalBlockSize)));
  const start = Math.log(BASE_BLOCK_SIZE);
  const end = Math.log(clampedFinal);
  const step = (end - start) / (clampedSteps - 1);
  const steps: number[] = [];

  for (let index = 0; index < clampedSteps; index += 1) {
    const value = Math.round(Math.exp(start + step * index));
    steps.push(value);
  }

  steps[0] = BASE_BLOCK_SIZE;
  steps[clampedSteps - 1] = clampedFinal;

  for (let index = 1; index < steps.length; index += 1) {
    if (steps[index] >= steps[index - 1]) {
      steps[index] = Math.max(clampedFinal, steps[index - 1] - 1);
    }
  }

  return steps;
};

const parseNavFromLoc = (loc?: string, fallback?: Navigation): Navigation => {
  const defaults = fallback ?? { x: -0.5, y: 0, z: 1 };
  if (!loc) {
    return defaults;
  }

  const numberPattern = '-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?';
  const matches = loc.match(
    new RegExp(`@(${numberPattern}),(${numberPattern})(?:x(${numberPattern}))?`, 'i')
  );
  if (!matches) {
    return defaults;
  }

  return {
    x: parseFloatWithDefault(matches[1], defaults.x),
    y: parseFloatWithDefault(matches[2], defaults.y),
    z: parseFloatWithDefault(matches[3], defaults.z),
  };
};

const formatNavValue = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const fixed = value.toFixed(15);
  return fixed.replace(/\.?0+$/, '');
};

const buildLocFromNav = (nav: Navigation) =>
  `@${formatNavValue(nav.x)},${formatNavValue(nav.y)}x${formatNavValue(nav.z)}`;

const FractalCanvas = ({
  width,
  height,
  loc,
  settings,
  interactionMode,
  resetSignal = 0,
}: FractalCanvasProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { algorithm } = useParams();
  const resolvedAlgorithm = normaliseAlgorithm(algorithm);
  const defaultNav = getDefaultView(resolvedAlgorithm);
  const [nav, setNav] = useState<Navigation>(() => parseNavFromLoc(loc, defaultNav));
  const [isRendering, setIsRendering] = useState(false);
  const [displayNav, setDisplayNav] = useState<Navigation>(() =>
    parseNavFromLoc(loc, defaultNav)
  );
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const workerCount = Math.max(1, Math.round(settings.workerCount || 1));
  const [gpuAvailable, setGpuAvailable] = useState(false);
  const [gpuSupportsLimb, setGpuSupportsLimb] = useState(false);
  const [gpuLimbProfiles, setGpuLimbProfiles] = useState<LimbProfileId[]>([]);
  const [paletteRevision, setPaletteRevision] = useState(0);
  const [gpuPrecision, setGpuPrecision] = useState<'highp' | 'mediump' | null>(null);
  const [finalRenderMs, setFinalRenderMs] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const glProgramRef = useRef<WebGLProgram | null>(null);
  const glLimbProgramsRef = useRef<Map<LimbProfileId, WebGLProgram>>(new Map());
  const glPaletteTextureRef = useRef<WebGLTexture | null>(null);
  const glBufferRef = useRef<WebGLBuffer | null>(null);
  const glTimerExtRef = useRef<GpuTimerExt | null>(null);
  const glTimerQueryRef = useRef<unknown | null>(null);
  const glTimerRafRef = useRef<number | null>(null);
  const glUniformsRef = useRef<{
    resolution?: WebGLUniformLocation | null;
    x0?: WebGLUniformLocation | null;
    y0?: WebGLUniformLocation | null;
    xScale?: WebGLUniformLocation | null;
    yScale?: WebGLUniformLocation | null;
    x0LimbLo?: WebGLUniformLocation | null;
    x0LimbMid?: WebGLUniformLocation | null;
    x0LimbHi?: WebGLUniformLocation | null;
    y0LimbLo?: WebGLUniformLocation | null;
    y0LimbMid?: WebGLUniformLocation | null;
    y0LimbHi?: WebGLUniformLocation | null;
    xScaleLimbLo?: WebGLUniformLocation | null;
    xScaleLimbMid?: WebGLUniformLocation | null;
    xScaleLimbHi?: WebGLUniformLocation | null;
    yScaleLimbLo?: WebGLUniformLocation | null;
    yScaleLimbMid?: WebGLUniformLocation | null;
    yScaleLimbHi?: WebGLUniformLocation | null;
    x0Hi?: WebGLUniformLocation | null;
    x0Lo?: WebGLUniformLocation | null;
    y0Hi?: WebGLUniformLocation | null;
    y0Lo?: WebGLUniformLocation | null;
    xScaleHi?: WebGLUniformLocation | null;
    xScaleLo?: WebGLUniformLocation | null;
    yScaleHi?: WebGLUniformLocation | null;
    yScaleLo?: WebGLUniformLocation | null;
    max?: WebGLUniformLocation | null;
    pscale?: WebGLUniformLocation | null;
    paletteSize?: WebGLUniformLocation | null;
    colourMode?: WebGLUniformLocation | null;
    smooth?: WebGLUniformLocation | null;
    ditherStrength?: WebGLUniformLocation | null;
    algorithm?: WebGLUniformLocation | null;
    useDouble?: WebGLUniformLocation | null;
    useLimb?: WebGLUniformLocation | null;
    julia?: WebGLUniformLocation | null;
    palette?: WebGLUniformLocation | null;
  } | null>(null);
  const glLimbUniformsRef = useRef<
    Map<LimbProfileId, { [key: string]: WebGLUniformLocation | null }>
  >(new Map());
  const workersRef = useRef<Worker[]>([]);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderConfigRef = useRef<RenderConfig | null>(null);
  const renderIdRef = useRef(0);
  const workerIndexRef = useRef(0);
  const navRef = useRef(nav);
  const isRenderingRef = useRef(false);
  const displayNavRef = useRef(displayNav);
  const pendingDisplayNavRef = useRef<Navigation | null>(null);
  const displayNavRafRef = useRef<number | null>(null);
  const interactionModeRef = useRef<InteractionMode>(interactionMode);
  const hasMountedRef = useRef(false);
  const selectionStateRef = useRef<SelectionState>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
  });
  const selectionRectRef = useRef<SelectionRect | null>(null);
  const selectionRafRef = useRef<number | null>(null);
  const boundsRef = useRef({ x0: 0, y0: 0, xScale: 0, yScale: 0 });
  const tileMapRef = useRef<Map<number, Tile>>(new Map());
  const nextTileIdRef = useRef(1);
  const pendingByTaskRef = useRef<Map<string, number>>(new Map());
  const panShiftRef = useRef<{ dx: number; dy: number } | null>(null);
  const resetTilesRef = useRef(true);
  const tileSizeRef = useRef(settings.tileSize);
  const distributionBufferRef = useRef<Float32Array | null>(null);
  const distributionAppliedRef = useRef(false);
  const dragStateRef = useRef<DragState>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startNav: nav,
    startScale: { xScale: 0, yScale: 0 },
    moved: false,
  });
  const suppressClickRef = useRef(false);
  const finalPassRef = useRef<{ renderId: number | null; start: number | null }>({
    renderId: null,
    start: null,
  });

  const pollGpuTimer = useCallback(() => {
    const ext = glTimerExtRef.current;
    const gl = glRef.current;
    const query = glTimerQueryRef.current;
    if (!ext || !gl || !query) {
      glTimerRafRef.current = null;
      return;
    }
    const available = ext.getQueryObjectEXT(query, ext.QUERY_RESULT_AVAILABLE_EXT);
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    if (available && !disjoint) {
      const result = ext.getQueryObjectEXT(query, ext.QUERY_RESULT_EXT);
      if (typeof result === 'number' && Number.isFinite(result)) {
        setFinalRenderMs(Math.max(0, result / 1e6));
      }
    }
    if (available || disjoint) {
      ext.deleteQueryEXT(query);
      glTimerQueryRef.current = null;
      glTimerRafRef.current = null;
      return;
    }
    glTimerRafRef.current = window.requestAnimationFrame(pollGpuTimer);
  }, []);

  const effectiveMaxIterations = useMemo(() => {
    if (!settings.autoMaxIterations) {
      return settings.maxIterations;
    }
    return Math.max(
      settings.maxIterations,
      Math.round(
        settings.maxIterations + settings.autoIterationsScale * Math.log2(Math.max(1, nav.z))
      )
    );
  }, [
    nav.z,
    settings.autoIterationsScale,
    settings.autoMaxIterations,
    settings.maxIterations,
  ]);

  const activeLimbProfile = useMemo(
    () => getLimbProfile(settings.gpuLimbProfile),
    [settings.gpuLimbProfile]
  );

  const limbProfileAvailable = useMemo(
    () =>
      settings.gpuPrecision !== 'limb' ||
      gpuLimbProfiles.includes(activeLimbProfile.id),
    [activeLimbProfile.id, gpuLimbProfiles, settings.gpuPrecision]
  );
  const limbRangeOk = useMemo(() => {
    if (settings.gpuPrecision !== 'limb') {
      return true;
    }
    const maxValue =
      ((LIMB_BASE / 2) * (LIMB_BASE ** LIMB_COUNT - 1)) /
      (LIMB_BASE - 1) /
      (LIMB_BASE ** activeLimbProfile.fractional);
    const ratio = width / height;
    const xMin = nav.x - (BASE_NUMBER_RANGE * ratio) / nav.z;
    const xMax = nav.x + (BASE_NUMBER_RANGE * ratio) / nav.z;
    const yMin = nav.y - BASE_NUMBER_RANGE / nav.z;
    const yMax = nav.y + BASE_NUMBER_RANGE / nav.z;
    const maxAbs = Math.max(
      Math.abs(xMin),
      Math.abs(xMax),
      Math.abs(yMin),
      Math.abs(yMax)
    );
    return maxAbs <= maxValue;
  }, [activeLimbProfile.fractional, height, nav.x, nav.y, nav.z, settings.gpuPrecision, width]);

  const gpuEligible = useMemo(
    () =>
      gpuAvailable &&
      settings.colourMode !== 'distribution' &&
      (settings.gpuPrecision !== 'limb' || (gpuSupportsLimb && limbProfileAvailable)),
    [
      gpuAvailable,
      settings.colourMode,
      settings.gpuPrecision,
      gpuSupportsLimb,
      limbProfileAvailable,
    ]
  );
  const useWebGL = useMemo(
    () => settings.renderBackend === 'gpu' && gpuEligible,
    [gpuEligible, settings.renderBackend]
  );
  const useGpuCanvas = useMemo(
    () => useWebGL || settings.renderBackend === 'gpu',
    [useWebGL, settings.renderBackend]
  );
  const gpuError = useMemo(() => {
    if (settings.renderBackend !== 'gpu') {
      return null;
    }
    if (!gpuAvailable) {
      return 'GPU unavailable';
    }
    if (settings.colourMode === 'distribution') {
      return 'GPU does not support distribution colouring';
    }
    if (settings.gpuPrecision === 'limb' && !gpuSupportsLimb) {
      return 'GPU limb shaders unavailable';
    }
    if (settings.gpuPrecision === 'limb' && !limbProfileAvailable) {
      return 'Limb profile unsupported';
    }
    if (settings.gpuPrecision === 'limb' && !limbRangeOk) {
      return 'Limb profile too fine for view';
    }
    return null;
  }, [
    gpuAvailable,
    gpuSupportsLimb,
    limbProfileAvailable,
    limbRangeOk,
    settings.colourMode,
    settings.gpuPrecision,
    settings.renderBackend,
  ]);
  const renderModeLabel = useMemo(() => {
    const baseLabel =
      settings.gpuPrecision === 'limb'
        ? `GPU-limb ${activeLimbProfile.label}`
        : settings.gpuPrecision === 'double'
          ? 'GPU-dd'
          : 'GPU';
    const gpuLabel = gpuPrecision === 'mediump' ? `${baseLabel}-med` : baseLabel;
    if (settings.renderBackend === 'gpu' || useWebGL) {
      return gpuLabel;
    }
    return 'CPU';
  }, [
    activeLimbProfile.label,
    gpuPrecision,
    settings.gpuPrecision,
    settings.renderBackend,
    useWebGL,
  ]);


  useEffect(() => {
    navRef.current = nav;
  }, [nav]);

  useEffect(() => {
    displayNavRef.current = displayNav;
  }, [displayNav]);

  useEffect(() => {
    interactionModeRef.current = interactionMode;
    suppressClickRef.current = false;
    if (interactionMode === 'grab') {
      selectionStateRef.current = {
        active: false,
        pointerId: null,
        startX: 0,
        startY: 0,
      };
      selectionRectRef.current = null;
      setSelectionRect(null);
    } else {
      const canvas = useGpuCanvas ? glCanvasRef.current : canvasRef.current;
      if (dragStateRef.current.active && canvas && dragStateRef.current.pointerId !== null) {
        canvas.releasePointerCapture(dragStateRef.current.pointerId);
      }
      dragStateRef.current = {
        active: false,
        pointerId: null,
        startX: 0,
        startY: 0,
        startNav: navRef.current,
        startScale: { xScale: 0, yScale: 0 },
        moved: false,
      };
      if (canvas) {
        canvas.style.transform = 'translate(0px, 0px)';
        canvas.style.cursor = 'crosshair';
      }
    }
  }, [interactionMode, useGpuCanvas]);

  useEffect(() => {
    if (!dragStateRef.current.active) {
      displayNavRef.current = nav;
      setDisplayNav(nav);
    }
  }, [nav]);

  const queueDisplayNavUpdate = useCallback((nextNav: Navigation) => {
    pendingDisplayNavRef.current = nextNav;
    if (displayNavRafRef.current !== null) {
      return;
    }
    displayNavRafRef.current = window.requestAnimationFrame(() => {
      displayNavRafRef.current = null;
      if (pendingDisplayNavRef.current) {
        displayNavRef.current = pendingDisplayNavRef.current;
        setDisplayNav(pendingDisplayNavRef.current);
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (displayNavRafRef.current !== null) {
        window.cancelAnimationFrame(displayNavRafRef.current);
      }
      if (selectionRafRef.current !== null) {
        window.cancelAnimationFrame(selectionRafRef.current);
      }
    };
  }, []);

  const clampValue = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const computeSelectionRect = useCallback(
    (startX: number, startY: number, currentX: number, currentY: number): SelectionRect => {
      const canvasWidth = width;
      const canvasHeight = height;
      const clampedStartX = clampValue(startX, 0, canvasWidth);
      const clampedStartY = clampValue(startY, 0, canvasHeight);
      const clampedX = clampValue(currentX, 0, canvasWidth);
      const clampedY = clampValue(currentY, 0, canvasHeight);

      const rectX = Math.min(clampedStartX, clampedX);
      const rectY = Math.min(clampedStartY, clampedY);
      const rectWidth = Math.abs(clampedX - clampedStartX);
      const rectHeight = Math.abs(clampedY - clampedStartY);

      return {
        x: rectX,
        y: rectY,
        width: rectWidth,
        height: rectHeight,
      };
    },
    [height, width]
  );

  const queueSelectionRectUpdate = useCallback((rect: SelectionRect | null) => {
    selectionRectRef.current = rect;
    if (selectionRafRef.current !== null) {
      return;
    }
    selectionRafRef.current = window.requestAnimationFrame(() => {
      selectionRafRef.current = null;
      setSelectionRect(selectionRectRef.current);
    });
  }, []);

  const setRendering = useCallback((value: boolean) => {
    if (isRenderingRef.current === value) {
      return;
    }
    isRenderingRef.current = value;
    setIsRendering(value);
  }, []);

  const applyDistributionColouring = useCallback(
    (config: RenderConfig) => {
      if (distributionAppliedRef.current) {
        return;
      }
      const buffer = distributionBufferRef.current;
      const ctx = contextRef.current;
      if (!buffer || !ctx) {
        return;
      }
      const maxIterations = config.max;
      const bins = Math.max(1, Math.ceil(maxIterations));
      const histogram = new Uint32Array(bins);
      let total = 0;
      for (let index = 0; index < buffer.length; index += 1) {
        const value = buffer[index];
        if (!Number.isFinite(value) || value >= maxIterations) {
          continue;
        }
        const bin = Math.min(bins - 1, Math.floor(value));
        histogram[bin] += 1;
        total += 1;
      }
      if (total === 0) {
        return;
      }

      distributionAppliedRef.current = true;

      const cdf = new Float32Array(bins);
      let cumulative = 0;
      let cdfMin = 0;
      for (let index = 0; index < bins; index += 1) {
        cumulative += histogram[index];
        if (cdfMin === 0 && cumulative > 0) {
          cdfMin = cumulative / total;
        }
        cdf[index] = cumulative / total;
      }
      const denom = 1 - cdfMin;
      if (denom > 0) {
        for (let index = 0; index < cdf.length; index += 1) {
          cdf[index] = Math.max(0, (cdf[index] - cdfMin) / denom);
        }
      }

      const palette = config.palette;
      const paletteSize = palette.length;
      const smooth = config.smooth;
      const hasDither = config.ditherStrength > 0;
      const imageData = ctx.createImageData(width, height);
      let idx = 0;

      for (let y = 0; y < height; y += 1) {
        const rowOffset = y * width;
        for (let x = 0; x < width; x += 1) {
          const value = buffer[rowOffset + x];
          let rgb: number[] = [0, 0, 0];

          if (Number.isFinite(value) && value < maxIterations) {
            const base = Math.floor(value);
            const frac = value - base;
            const baseIndex = Math.min(cdf.length - 1, Math.max(0, base));
            const nextIndex = Math.min(cdf.length - 1, baseIndex + 1);
            const cdfValue =
              cdf[baseIndex] + (cdf[nextIndex] - cdf[baseIndex]) * frac;
            let scaled = cdfValue * (paletteSize - 1);
            if (hasDither) {
              scaled += (hash2d(x, y) - 0.5) * config.ditherStrength;
            }
            scaled = Math.min(paletteSize - 1, Math.max(0, scaled));

            if (smooth) {
              const paletteIndex = Math.min(
                paletteSize - 2,
                Math.max(0, Math.floor(scaled))
              );
              const t = scaled - paletteIndex;
              rgb = lerpRgb(palette[paletteIndex], palette[paletteIndex + 1], t);
            } else {
              rgb = palette[Math.floor(scaled)];
            }
          }

          imageData.data[idx++] = Math.floor(rgb[0]);
          imageData.data[idx++] = Math.floor(rgb[1]);
          imageData.data[idx++] = Math.floor(rgb[2]);
          imageData.data[idx++] = 255;
        }
      }

      ctx.putImageData(imageData, 0, 0);
    },
    [height, width]
  );

  const basePalette = useMemo(
    () => PaletteGenerator(MAX_PALETTE_ITERATIONS, settings.paletteStops),
    [settings.paletteStops]
  );
  const smoothedPalette = useMemo(() => smoothPalette(basePalette), [basePalette]);
  const palette = useMemo(() => {
    const strength = Math.min(1, Math.max(0, settings.paletteSmoothness));
    if (strength <= 0) {
      return basePalette;
    }
    if (strength >= 1) {
      return smoothedPalette;
    }
    const blended = new Array(basePalette.length);
    for (let index = 0; index < basePalette.length; index += 1) {
      const base = basePalette[index];
      const smooth = smoothedPalette[index];
      blended[index] = [
        base[0] + (smooth[0] - base[0]) * strength,
        base[1] + (smooth[1] - base[1]) * strength,
        base[2] + (smooth[2] - base[2]) * strength,
      ];
    }
    return blended;
  }, [basePalette, smoothedPalette, settings.paletteSmoothness]);

  const canvasFilter = useMemo(() => {
    const filterParts: string[] = [];
    switch (settings.filterMode) {
      case 'gaussianSoft':
        filterParts.push(`blur(${Math.max(0, settings.gaussianBlur)}px)`);
        break;
      case 'vivid':
        filterParts.push('saturate(1.3)', 'contrast(1.15)');
        break;
      case 'mono':
        filterParts.push('grayscale(1)');
        break;
      case 'dither':
      case 'none':
      default:
        break;
    }

    if (settings.hueRotate !== 0) {
      filterParts.push(`hue-rotate(${settings.hueRotate}deg)`);
    }

    return filterParts.length > 0 ? filterParts.join(' ') : 'none';
  }, [settings.filterMode, settings.gaussianBlur, settings.hueRotate]);

  useEffect(() => {
    if (!useWebGL) {
      return;
    }
    const canvas = glCanvasRef.current;
    const gl = glRef.current;
    if (!canvas || !gl) {
      return;
    }
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  }, [useWebGL, width, height]);

  useEffect(() => {
    if (!useWebGL) {
      return;
    }
    const gl = glRef.current;
    const paletteTexture = glPaletteTextureRef.current;
    if (!gl || !paletteTexture) {
      return;
    }
    const paletteData = new Uint8Array(palette.length * 4);
    palette.forEach((colour, index) => {
      const offset = index * 4;
      paletteData[offset] = Math.min(255, Math.max(0, Math.round(colour[0])));
      paletteData[offset + 1] = Math.min(255, Math.max(0, Math.round(colour[1])));
      paletteData[offset + 2] = Math.min(255, Math.max(0, Math.round(colour[2])));
      paletteData[offset + 3] = 255;
    });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      palette.length,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      paletteData
    );
    setPaletteRevision((value) => value + 1);
  }, [useWebGL, palette]);

  const { x0, y0, xScale, yScale } = useMemo(() => {
    const ratio = width / height;
    const xMin = nav.x - (BASE_NUMBER_RANGE * ratio) / nav.z;
    const xMax = nav.x + (BASE_NUMBER_RANGE * ratio) / nav.z;
    const yMin = nav.y - BASE_NUMBER_RANGE / nav.z;
    const yMax = nav.y + BASE_NUMBER_RANGE / nav.z;

    return {
      x0: xMin,
      y0: yMin,
      xScale: Math.abs(xMax - xMin) / width,
      yScale: Math.abs(yMax - yMin) / height,
    };
  }, [nav.x, nav.y, nav.z, width, height]);

  useEffect(() => {
    if (!useWebGL) {
      return;
    }
    const gl = glRef.current;
    const useLimbProgram =
      settings.gpuPrecision === 'limb' &&
      limbProfileAvailable &&
      glLimbProgramsRef.current.get(activeLimbProfile.id) &&
      glLimbUniformsRef.current.get(activeLimbProfile.id);
    const program = useLimbProgram
      ? glLimbProgramsRef.current.get(activeLimbProfile.id)
      : glProgramRef.current;
    const uniforms = useLimbProgram
      ? glLimbUniformsRef.current.get(activeLimbProfile.id)
      : glUniformsRef.current;
    if (!gl || !program || !uniforms || !glBufferRef.current) {
      return;
    }
    const timerExt = glTimerExtRef.current;
    if (timerExt && glTimerQueryRef.current && glTimerRafRef.current === null) {
      glTimerRafRef.current = window.requestAnimationFrame(pollGpuTimer);
    }
    if (settings.gpuPrecision === 'limb' && !limbRangeOk) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      setFinalRenderMs(null);
      return;
    }
    const paletteTexture = glPaletteTextureRef.current;
    if (!paletteTexture) {
      return;
    }
    const maxIterations = Math.min(effectiveMaxIterations, GPU_MAX_ITERATIONS);
    if (maxIterations <= 0 || palette.length === 0) {
      return;
    }

    const pscale =
      settings.colourMode === 'normalize' || settings.colourMode === 'distribution'
        ? (palette.length - 1) / maxIterations
        : settings.colourMode === 'cycle'
          ? (palette.length - 1) / Math.max(1, settings.colourPeriod)
          : (palette.length - 1) / MAX_PALETTE_ITERATIONS;
    const colourModeIndex = settings.colourMode === 'cycle' ? 1 : settings.colourMode === 'fixed' ? 2 : 0;
    const ditherStrength =
      settings.filterMode === 'dither' ? Math.max(0, settings.ditherStrength) : 0;

    const splitFloat = (value: number) => {
      const hi = Math.fround(value);
      return { hi, lo: value - hi };
    };
    const x0Split = splitFloat(x0);
    const y0Split = splitFloat(y0);
    const xScaleSplit = splitFloat(xScale);
    const yScaleSplit = splitFloat(yScale);
    const useLimb = settings.gpuPrecision === 'limb' && Boolean(useLimbProgram);
    const x0Limb = useLimb ? buildLimbVectors(x0, activeLimbProfile.fractional) : null;
    const y0Limb = useLimb ? buildLimbVectors(y0, activeLimbProfile.fractional) : null;
    const xScaleLimb = useLimb
      ? buildLimbVectors(xScale, activeLimbProfile.fractional)
      : null;
    const yScaleLimb = useLimb
      ? buildLimbVectors(yScale, activeLimbProfile.fractional)
      : null;

    gl.useProgram(program);
    let timerQueryStarted = false;
    if (timerExt && !glTimerQueryRef.current) {
      const query = timerExt.createQueryEXT();
      if (query) {
        timerExt.beginQueryEXT(timerExt.TIME_ELAPSED_EXT, query);
        glTimerQueryRef.current = query;
        timerQueryStarted = true;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, glBufferRef.current);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
    if (uniforms.resolution) {
      gl.uniform2f(uniforms.resolution, width, height);
    }
    if (uniforms.x0) {
      gl.uniform1f(uniforms.x0, x0);
    }
    if (uniforms.y0) {
      gl.uniform1f(uniforms.y0, y0);
    }
    if (uniforms.xScale) {
      gl.uniform1f(uniforms.xScale, xScale);
    }
    if (uniforms.yScale) {
      gl.uniform1f(uniforms.yScale, yScale);
    }
    if (uniforms.x0LimbLo && x0Limb) {
      gl.uniform4f(uniforms.x0LimbLo, ...x0Limb.lo);
    }
    if (uniforms.x0LimbMid && x0Limb) {
      gl.uniform4f(uniforms.x0LimbMid, ...x0Limb.mid);
    }
    if (uniforms.x0LimbHi && x0Limb) {
      gl.uniform4f(uniforms.x0LimbHi, ...x0Limb.hi);
    }
    if (uniforms.y0LimbLo && y0Limb) {
      gl.uniform4f(uniforms.y0LimbLo, ...y0Limb.lo);
    }
    if (uniforms.y0LimbMid && y0Limb) {
      gl.uniform4f(uniforms.y0LimbMid, ...y0Limb.mid);
    }
    if (uniforms.y0LimbHi && y0Limb) {
      gl.uniform4f(uniforms.y0LimbHi, ...y0Limb.hi);
    }
    if (uniforms.xScaleLimbLo && xScaleLimb) {
      gl.uniform4f(uniforms.xScaleLimbLo, ...xScaleLimb.lo);
    }
    if (uniforms.xScaleLimbMid && xScaleLimb) {
      gl.uniform4f(uniforms.xScaleLimbMid, ...xScaleLimb.mid);
    }
    if (uniforms.xScaleLimbHi && xScaleLimb) {
      gl.uniform4f(uniforms.xScaleLimbHi, ...xScaleLimb.hi);
    }
    if (uniforms.yScaleLimbLo && yScaleLimb) {
      gl.uniform4f(uniforms.yScaleLimbLo, ...yScaleLimb.lo);
    }
    if (uniforms.yScaleLimbMid && yScaleLimb) {
      gl.uniform4f(uniforms.yScaleLimbMid, ...yScaleLimb.mid);
    }
    if (uniforms.yScaleLimbHi && yScaleLimb) {
      gl.uniform4f(uniforms.yScaleLimbHi, ...yScaleLimb.hi);
    }
    if (uniforms.x0Hi) {
      gl.uniform1f(uniforms.x0Hi, x0Split.hi);
    }
    if (uniforms.x0Lo) {
      gl.uniform1f(uniforms.x0Lo, x0Split.lo);
    }
    if (uniforms.y0Hi) {
      gl.uniform1f(uniforms.y0Hi, y0Split.hi);
    }
    if (uniforms.y0Lo) {
      gl.uniform1f(uniforms.y0Lo, y0Split.lo);
    }
    if (uniforms.xScaleHi) {
      gl.uniform1f(uniforms.xScaleHi, xScaleSplit.hi);
    }
    if (uniforms.xScaleLo) {
      gl.uniform1f(uniforms.xScaleLo, xScaleSplit.lo);
    }
    if (uniforms.yScaleHi) {
      gl.uniform1f(uniforms.yScaleHi, yScaleSplit.hi);
    }
    if (uniforms.yScaleLo) {
      gl.uniform1f(uniforms.yScaleLo, yScaleSplit.lo);
    }
    if (uniforms.max) {
      gl.uniform1f(uniforms.max, maxIterations);
    }
    if (uniforms.pscale) {
      gl.uniform1f(uniforms.pscale, pscale);
    }
    if (uniforms.paletteSize) {
      gl.uniform1f(uniforms.paletteSize, palette.length);
    }
    if (uniforms.colourMode) {
      gl.uniform1f(uniforms.colourMode, colourModeIndex);
    }
    if (uniforms.smooth) {
      gl.uniform1i(uniforms.smooth, settings.smooth ? 1 : 0);
    }
    if (uniforms.ditherStrength) {
      gl.uniform1f(uniforms.ditherStrength, ditherStrength);
    }
    if (uniforms.algorithm) {
      gl.uniform1f(uniforms.algorithm, resolveAlgorithmIndex(resolvedAlgorithm));
    }
    if (uniforms.useDouble) {
      gl.uniform1f(
        uniforms.useDouble,
        settings.gpuPrecision === 'double' ? 1 : 0
      );
    }
    if (uniforms.useLimb) {
      gl.uniform1f(uniforms.useLimb, useLimb ? 1 : 0);
    }
    if (uniforms.julia) {
      gl.uniform2f(uniforms.julia, DEFAULT_JULIA.real, DEFAULT_JULIA.imag);
    }

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (timerQueryStarted && timerExt) {
      timerExt.endQueryEXT(timerExt.TIME_ELAPSED_EXT);
      if (glTimerRafRef.current === null) {
        glTimerRafRef.current = window.requestAnimationFrame(pollGpuTimer);
      }
    } else if (!timerExt) {
      setFinalRenderMs((value) => value ?? 0);
    }

    // Avoid disabling GPU based on sampled pixels; rely on shader compile/link success.
  }, [
    settings.renderBackend,
    x0,
    y0,
    xScale,
    yScale,
    width,
    height,
    palette,
    paletteRevision,
    effectiveMaxIterations,
    settings.colourMode,
    settings.colourPeriod,
    settings.filterMode,
    settings.ditherStrength,
    settings.smooth,
    settings.gpuPrecision,
    settings.gpuLimbProfile,
    settings.renderBackend,
    resolvedAlgorithm,
    nav.z,
    activeLimbProfile.id,
    limbProfileAvailable,
    limbRangeOk,
    pollGpuTimer,
  ]);

  const blockSteps = useMemo(
    () => buildBlockSteps(settings.refinementStepsCount, settings.finalBlockSize),
    [settings.refinementStepsCount, settings.finalBlockSize]
  );

  const precisionEpsilon = useMemo(() => {
    if (settings.renderBackend !== 'gpu') {
      return Number.EPSILON;
    }
    if (settings.gpuPrecision === 'single') {
      return Math.pow(2, -23);
    }
    if (settings.gpuPrecision === 'double') {
      return Math.pow(2, -46);
    }
    const fractionalBits = activeLimbProfile.fractional * 10;
    return Math.pow(2, -fractionalBits);
  }, [activeLimbProfile.fractional, settings.gpuPrecision, settings.renderBackend]);

  const precisionWarning = useMemo(() => {
    const scale = Math.max(1, Math.abs(nav.x), Math.abs(nav.y));
    const limit = precisionEpsilon * PRECISION_EPS_SCALE * scale;
    return xScale < limit || yScale < limit;
  }, [nav.x, nav.y, precisionEpsilon, xScale, yScale]);

  useEffect(() => {
    boundsRef.current = { x0, y0, xScale, yScale };
  }, [x0, y0, xScale, yScale]);

  useEffect(() => {
    if (useGpuCanvas) {
      contextRef.current = null;
      return;
    }
    if (canvasRef.current) {
      contextRef.current = canvasRef.current.getContext('2d');
    }
  }, [useGpuCanvas]);

  useEffect(() => {
    const canvas = glCanvasRef.current;
    if (!canvas) {
      return;
    }
    const gl = canvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      antialias: false,
    });
    if (!gl) {
      setGpuAvailable(false);
      setGpuSupportsLimb(false);
      setGpuLimbProfiles([]);
      setGpuPrecision(null);
      return;
    }
    const baseProgramInfo = createProgram(gl, false);
    const timerExt =
      (gl.getExtension('EXT_disjoint_timer_query') as GpuTimerExt | null) ??
      (gl.getExtension('EXT_disjoint_timer_query_webgl2') as GpuTimerExt | null);
    if (!baseProgramInfo) {
      setGpuAvailable(false);
      setGpuSupportsLimb(false);
      setGpuLimbProfiles([]);
      setGpuPrecision(null);
      return;
    }
    const limbProgramInfos = LIMB_PROFILES.map((profile) => ({
      id: profile.id,
      info: createProgram(gl, true, profile.fractional),
    }));
    const { program: baseProgram, precision } = baseProgramInfo;

    const buffer = gl.createBuffer();
    if (!buffer) {
      setGpuAvailable(false);
      return;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const bindProgramBuffer = (program: WebGLProgram) => {
      gl.useProgram(program);
      const positionLocation = gl.getAttribLocation(program, 'a_position');
      if (positionLocation !== -1) {
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      }
    };
    bindProgramBuffer(baseProgram);
    limbProgramInfos.forEach((entry) => {
      if (entry.info) {
        bindProgramBuffer(entry.info.program);
      }
    });

    const paletteTexture = gl.createTexture();
    if (!paletteTexture) {
      setGpuAvailable(false);
      return;
    }
    gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255])
    );

    const buildUniforms = (program: WebGLProgram) => ({
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      x0: gl.getUniformLocation(program, 'u_x0'),
      y0: gl.getUniformLocation(program, 'u_y0'),
      xScale: gl.getUniformLocation(program, 'u_xScale'),
      yScale: gl.getUniformLocation(program, 'u_yScale'),
      x0LimbLo: gl.getUniformLocation(program, 'u_x0_limb_lo'),
      x0LimbMid: gl.getUniformLocation(program, 'u_x0_limb_mid'),
      x0LimbHi: gl.getUniformLocation(program, 'u_x0_limb_hi'),
      y0LimbLo: gl.getUniformLocation(program, 'u_y0_limb_lo'),
      y0LimbMid: gl.getUniformLocation(program, 'u_y0_limb_mid'),
      y0LimbHi: gl.getUniformLocation(program, 'u_y0_limb_hi'),
      xScaleLimbLo: gl.getUniformLocation(program, 'u_xScale_limb_lo'),
      xScaleLimbMid: gl.getUniformLocation(program, 'u_xScale_limb_mid'),
      xScaleLimbHi: gl.getUniformLocation(program, 'u_xScale_limb_hi'),
      yScaleLimbLo: gl.getUniformLocation(program, 'u_yScale_limb_lo'),
      yScaleLimbMid: gl.getUniformLocation(program, 'u_yScale_limb_mid'),
      yScaleLimbHi: gl.getUniformLocation(program, 'u_yScale_limb_hi'),
      x0Hi: gl.getUniformLocation(program, 'u_x0_hi'),
      x0Lo: gl.getUniformLocation(program, 'u_x0_lo'),
      y0Hi: gl.getUniformLocation(program, 'u_y0_hi'),
      y0Lo: gl.getUniformLocation(program, 'u_y0_lo'),
      xScaleHi: gl.getUniformLocation(program, 'u_xScale_hi'),
      xScaleLo: gl.getUniformLocation(program, 'u_xScale_lo'),
      yScaleHi: gl.getUniformLocation(program, 'u_yScale_hi'),
      yScaleLo: gl.getUniformLocation(program, 'u_yScale_lo'),
      max: gl.getUniformLocation(program, 'u_max'),
      pscale: gl.getUniformLocation(program, 'u_pscale'),
      paletteSize: gl.getUniformLocation(program, 'u_paletteSize'),
      colourMode: gl.getUniformLocation(program, 'u_colourMode'),
      smooth: gl.getUniformLocation(program, 'u_smooth'),
      ditherStrength: gl.getUniformLocation(program, 'u_ditherStrength'),
      algorithm: gl.getUniformLocation(program, 'u_algorithm'),
      useDouble: gl.getUniformLocation(program, 'u_useDouble'),
      useLimb: gl.getUniformLocation(program, 'u_useLimb'),
      julia: gl.getUniformLocation(program, 'u_julia'),
      palette: gl.getUniformLocation(program, 'u_palette'),
    });

    const baseUniforms = buildUniforms(baseProgram);
    const limbUniformsMap = new Map<LimbProfileId, { [key: string]: WebGLUniformLocation | null }>();
    limbProgramInfos.forEach((entry) => {
      if (entry.info) {
        limbUniformsMap.set(entry.id, buildUniforms(entry.info.program));
      }
    });

    const setPaletteSampler = (
      program: WebGLProgram,
      uniforms: { palette?: WebGLUniformLocation | null } | null
    ) => {
      const paletteLocation = uniforms?.palette;
      if (!paletteLocation) {
        return;
      }
      gl.useProgram(program);
      gl.uniform1i(paletteLocation, 0);
    };

    setPaletteSampler(baseProgram, baseUniforms);
    limbProgramInfos.forEach((entry) => {
      const uniforms = limbUniformsMap.get(entry.id);
      if (entry.info && uniforms) {
        setPaletteSampler(entry.info.program, uniforms);
      }
    });

    glRef.current = gl;
    glTimerExtRef.current = timerExt;
    glProgramRef.current = baseProgram;
    glPaletteTextureRef.current = paletteTexture;
    glBufferRef.current = buffer;
    glUniformsRef.current = baseUniforms;
    glLimbProgramsRef.current.clear();
    limbProgramInfos.forEach((entry) => {
      if (entry.info) {
        glLimbProgramsRef.current.set(entry.id, entry.info.program);
      }
    });
    glLimbUniformsRef.current = limbUniformsMap;
    setGpuAvailable(true);
    const availableLimbProfiles = limbProgramInfos
      .filter((entry) => entry.info)
      .map((entry) => entry.id);
    setGpuSupportsLimb(availableLimbProfiles.length > 0);
    setGpuLimbProfiles(availableLimbProfiles);
    setGpuPrecision(precision);
  }, []);

  useEffect(() => {
    const canvas = useGpuCanvas ? glCanvasRef.current : canvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.style.cursor = interactionMode === 'grab' ? 'grab' : 'crosshair';
  }, [interactionMode, useGpuCanvas]);

  useEffect(() => {
    const nextNav = parseNavFromLoc(loc, getDefaultView(resolvedAlgorithm));
    navRef.current = nextNav;
    displayNavRef.current = nextNav;
    setNav(nextNav);
    setDisplayNav(nextNav);
    resetTilesRef.current = true;
  }, [loc, resolvedAlgorithm]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (!loc) {
      const nextNav = getDefaultView(resolvedAlgorithm);
      navRef.current = nextNav;
      displayNavRef.current = nextNav;
      setNav(nextNav);
      setDisplayNav(nextNav);
      pendingDisplayNavRef.current = null;
      if (displayNavRafRef.current !== null) {
        window.cancelAnimationFrame(displayNavRafRef.current);
        displayNavRafRef.current = null;
      }
      selectionStateRef.current = {
        active: false,
        pointerId: null,
        startX: 0,
        startY: 0,
      };
      selectionRectRef.current = null;
      setSelectionRect(null);
    }
    resetTilesRef.current = true;
    distributionBufferRef.current = null;
  }, [resolvedAlgorithm, loc]);

  useEffect(() => {
    if (!settings.autoUpdateUrl) {
      return;
    }
    const locString = buildLocFromNav(nav);
    const searchParams = new URLSearchParams(location.search);
    if (resolvedAlgorithm) {
      if (searchParams.has('loc')) {
        searchParams.delete('loc');
      }
      searchParams.delete('x');
      searchParams.delete('y');
      searchParams.delete('z');
      const nextPath = `/${resolvedAlgorithm}/${locString}`;
      const nextSearch = searchParams.toString();
      const nextUrl = `${nextPath}${nextSearch ? `?${nextSearch}` : ''}`;
      if (`${location.pathname}${location.search}` !== nextUrl) {
        navigate(nextUrl, { replace: true });
      }
      return;
    }

    searchParams.delete('loc');
    searchParams.set('x', formatNavValue(nav.x));
    searchParams.set('y', formatNavValue(nav.y));
    searchParams.set('z', formatNavValue(nav.z));
    const nextSearch = searchParams.toString();
    const nextUrl = `${location.pathname}?${nextSearch}`;
    if (`${location.pathname}${location.search}` !== nextUrl) {
      navigate(nextUrl, { replace: true });
    }
  }, [
    nav,
    settings.autoUpdateUrl,
    resolvedAlgorithm,
    location.pathname,
    location.search,
    navigate,
  ]);

  useEffect(() => {
    if (resetSignal === 0) {
      return;
    }
    const defaultNav = getDefaultView(resolvedAlgorithm);
    navRef.current = defaultNav;
    displayNavRef.current = defaultNav;
    setNav(defaultNav);
    setDisplayNav(defaultNav);
    pendingDisplayNavRef.current = null;
    if (displayNavRafRef.current !== null) {
      window.cancelAnimationFrame(displayNavRafRef.current);
      displayNavRafRef.current = null;
    }
    selectionStateRef.current = {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
    };
    selectionRectRef.current = null;
    setSelectionRect(null);
    panShiftRef.current = null;
    dragStateRef.current = {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      startNav: defaultNav,
      startScale: { xScale: 0, yScale: 0 },
      moved: false,
    };
    const canvas = canvasRef.current;
    const glCanvas = glCanvasRef.current;
    const cursor = interactionModeRef.current === 'grab' ? 'grab' : 'crosshair';
    if (canvas) {
      canvas.style.transform = 'translate(0px, 0px)';
      canvas.style.cursor = cursor;
    }
    if (glCanvas) {
      glCanvas.style.transform = 'translate(0px, 0px)';
      glCanvas.style.cursor = cursor;
    }
    resetTilesRef.current = true;
  }, [resetSignal, resolvedAlgorithm]);

  useEffect(() => {
    resetTilesRef.current = true;
  }, [width, height]);

  useEffect(() => {
    resetTilesRef.current = true;
  }, [
    settings.autoIterationsScale,
    settings.autoMaxIterations,
    settings.colourMode,
    settings.colourPeriod,
    settings.ditherStrength,
    settings.finalBlockSize,
    settings.filterMode,
    settings.maxIterations,
    settings.paletteStops,
    settings.paletteSmoothness,
    settings.renderBackend,
    settings.refinementStepsCount,
    settings.smooth,
    settings.tileSize,
    settings.workerCount,
  ]);

  const scheduleTileStep = useCallback((tile: Tile, renderId: number) => {
    const config = renderConfigRef.current;
    if (!config || config.renderId !== renderId) {
      return;
    }
    if (workersRef.current.length === 0) {
      return;
    }
    if (tile.inFlight || tile.stepIndex >= blockSteps.length) {
      return;
    }

    if (
      tile.stepIndex === blockSteps.length - 1 &&
      finalPassRef.current.renderId === renderId &&
      finalPassRef.current.start === null
    ) {
      finalPassRef.current.start = performance.now();
    }

    const { max, smooth } = config;
    const blockSize = blockSteps[tile.stepIndex] ?? 1;
    const rows = Math.ceil(tile.height / blockSize);
    const taskKey = `${tile.id}:${tile.stepIndex}`;

    pendingByTaskRef.current.set(taskKey, rows);

    tile.inFlight = true;

    const { x0: bx0, y0: by0, xScale: bxScale, yScale: byScale } = boundsRef.current;
    let workerIndex = workerIndexRef.current;
    for (let py = tile.y; py < tile.y + tile.height; py += blockSize) {
      const rowHeight = Math.min(blockSize, tile.y + tile.height - py);
      const message: WorkerStartMessage = {
        cmd: START,
        renderId,
        tileId: tile.id,
        stepIndex: tile.stepIndex,
        px: tile.x,
        py,
        x0: bx0,
        y0: by0,
        xScale: bxScale,
        yScale: byScale,
        width: tile.width,
        height: rowHeight,
        blockSize,
        max,
        smooth,
        algorithm: resolvedAlgorithm,
        juliaCr: DEFAULT_JULIA.real,
        juliaCi: DEFAULT_JULIA.imag,
      };
      workersRef.current[workerIndex % workersRef.current.length].postMessage(message);
      workerIndex += 1;
    }
    workerIndexRef.current = workerIndex;
  }, [blockSteps, resolvedAlgorithm]);

  const scheduleAllTiles = useCallback((renderId: number) => {
    tileMapRef.current.forEach((tile) => {
      if (!tile.inFlight && tile.stepIndex < blockSteps.length) {
        scheduleTileStep(tile, renderId);
      }
    });
  }, [blockSteps.length, scheduleTileStep]);

  const handleWorkerMessage = useCallback(
    (response: WorkerResponseMessage) => {
      const config = renderConfigRef.current;
      const ctx = contextRef.current;
      if (!config || !ctx || response.renderId !== config.renderId) {
        return;
      }

      const { max, palette: activePalette, pscale, smooth, colourMode, ditherStrength } = config;
      let index = 0;
      const paletteSize = activePalette.length;
      const finalBlockSize = blockSteps[blockSteps.length - 1] ?? 1;
      const isCycle = colourMode === 'cycle';
      const isFixed = colourMode === 'fixed';
      const isDistribution = colourMode === 'distribution';
      const hasDither = ditherStrength > 0;
      const distributionBuffer = isDistribution ? distributionBufferRef.current : null;
      for (let py = 0; py < response.height; py += response.blockSize) {
        for (let px = 0; px < response.width; px += response.blockSize) {
          const iterationValue = response.values[index++];
          const drawWidth = Math.min(response.blockSize, response.width - px);
          const drawHeight = Math.min(response.blockSize, response.height - py);

          if (
            distributionBuffer &&
            response.blockSize === finalBlockSize &&
            Number.isFinite(iterationValue)
          ) {
            const baseX = response.px + px;
            const baseY = response.py + py;
            if (response.blockSize === 1) {
              const bufferIndex = baseY * width + baseX;
              distributionBuffer[bufferIndex] = iterationValue;
            } else {
              for (let by = 0; by < drawHeight; by += 1) {
                const rowOffset = (baseY + by) * width + baseX;
                for (let bx = 0; bx < drawWidth; bx += 1) {
                  distributionBuffer[rowOffset + bx] = iterationValue;
                }
              }
            }
          }
          let rgb: number[];

          if (smooth) {
            if (iterationValue < max) {
              const scaled = pscale * iterationValue;
              const dithered = hasDither
                ? scaled + (hash2d(response.px + px, response.py + py) - 0.5) * ditherStrength
                : scaled;
              const baseRaw = Math.floor(dithered);
              const frac = dithered - baseRaw;
              const baseIndex = isCycle
                ? ((baseRaw % paletteSize) + paletteSize) % paletteSize
                : isFixed
                  ? Math.min(paletteSize - 2, Math.max(0, baseRaw))
                  : Math.min(paletteSize - 2, Math.max(0, baseRaw));
              const nextIndex = isCycle ? (baseIndex + 1) % paletteSize : baseIndex + 1;
              const rgb1 = activePalette[baseIndex];
              const rgb2 = activePalette[nextIndex];
              rgb = lerpRgb(rgb1, rgb2, frac);
            } else {
              rgb = [0, 0, 0];
            }
          } else {
            if (iterationValue < max) {
              const scaled = pscale * iterationValue;
              const dithered = hasDither
                ? scaled + (hash2d(response.px + px, response.py + py) - 0.5) * ditherStrength
                : scaled;
              const baseRaw = Math.floor(dithered);
              const paletteIndex = isCycle
                ? ((baseRaw % paletteSize) + paletteSize) % paletteSize
                : isFixed
                  ? Math.min(paletteSize - 1, Math.max(0, baseRaw))
                  : Math.min(paletteSize - 1, Math.max(0, baseRaw));
              rgb = activePalette[paletteIndex];
            } else {
              rgb = [0, 0, 0];
            }
          }

          ctx.fillStyle = `rgb(${Math.floor(rgb[0])},${Math.floor(rgb[1])},${Math.floor(rgb[2])})`;
          ctx.fillRect(response.px + px, response.py + py, drawWidth, drawHeight);
        }
      }

      const taskKey = `${response.tileId}:${response.stepIndex}`;
      const remainingForTask = (pendingByTaskRef.current.get(taskKey) ?? 0) - 1;
      if (remainingForTask <= 0) {
        pendingByTaskRef.current.delete(taskKey);
        const tile = tileMapRef.current.get(response.tileId);
        if (tile && tile.stepIndex === response.stepIndex) {
          tile.stepIndex += 1;
          tile.inFlight = false;
          const currentRenderId = renderConfigRef.current?.renderId;
          if (currentRenderId) {
            scheduleTileStep(tile, currentRenderId);
          }
        }
      } else {
        pendingByTaskRef.current.set(taskKey, remainingForTask);
      }

      if (pendingByTaskRef.current.size === 0) {
        const allComplete = Array.from(tileMapRef.current.values()).every(
          (tile) => tile.stepIndex >= blockSteps.length
        );
        if (allComplete) {
          if (config.colourMode === 'distribution') {
            applyDistributionColouring(config);
          }
          const timing = finalPassRef.current;
          if (timing.renderId === config.renderId && timing.start !== null) {
            setFinalRenderMs(Math.max(0, performance.now() - timing.start));
            timing.start = null;
          }
          setRendering(false);
        }
      }
    },
    [applyDistributionColouring, blockSteps, scheduleTileStep, setRendering, width]
  );

  useEffect(() => {
    if (useGpuCanvas) {
      workersRef.current.forEach((worker) => worker.terminate());
      workersRef.current = [];
      workerIndexRef.current = 0;
      return;
    }
    const workers: Worker[] = [];
    for (let index = 0; index < workerCount; index += 1) {
      const worker = new Worker(
        new URL('../workers/Mandelbrot.worker.ts', import.meta.url),
        { type: 'module' }
      );
      worker.addEventListener('message', (event: MessageEvent<WorkerResponseMessage>) => {
        handleWorkerMessage(event.data);
      });
      workers.push(worker);
    }
    workersRef.current = workers;
    workerIndexRef.current = 0;
    return () => {
      workers.forEach((worker) => worker.terminate());
    };
  }, [handleWorkerMessage, workerCount, useGpuCanvas]);

  useEffect(() => {
    const canvas = useGpuCanvas ? glCanvasRef.current : canvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.style.cursor = 'grab';

    const computeGapRegions = (
      dx: number,
      dy: number,
      canvasWidth: number,
      canvasHeight: number
    ): RenderRegion[] => {
      if (Math.abs(dx) >= canvasWidth || Math.abs(dy) >= canvasHeight) {
        return [{ x: 0, y: 0, width: canvasWidth, height: canvasHeight }];
      }

      const regions: RenderRegion[] = [];
      if (dx !== 0) {
        regions.push({
          x: dx > 0 ? 0 : canvasWidth + dx,
          y: 0,
          width: Math.abs(dx),
          height: canvasHeight,
        });
      }
      if (dy !== 0) {
        regions.push({
          x: 0,
          y: dy > 0 ? 0 : canvasHeight + dy,
          width: canvasWidth,
          height: Math.abs(dy),
        });
      }

      return regions;
    };

    const shiftCanvas = (dx: number, dy: number) => {
      const ctx = contextRef.current;
      if (!ctx || !canvas) {
        return;
      }

      let scratch = scratchCanvasRef.current;
      if (!scratch) {
        scratch = document.createElement('canvas');
        scratchCanvasRef.current = scratch;
      }

      scratch.width = canvas.width;
      scratch.height = canvas.height;

      const scratchCtx = scratch.getContext('2d');
      if (!scratchCtx) {
        return;
      }

      scratchCtx.clearRect(0, 0, canvas.width, canvas.height);
      scratchCtx.drawImage(canvas, 0, 0);

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(scratch, dx, dy);
      ctx.restore();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      if (interactionModeRef.current === 'select') {
        canvas.setPointerCapture(event.pointerId);
        selectionStateRef.current = {
          active: true,
          pointerId: event.pointerId,
          startX: event.offsetX,
          startY: event.offsetY,
        };
        queueSelectionRectUpdate({
          x: event.offsetX,
          y: event.offsetY,
          width: 0,
          height: 0,
        });
        event.preventDefault();
        return;
      }

      canvas.setPointerCapture(event.pointerId);
      const { xScale: startXScale, yScale: startYScale } = boundsRef.current;

      dragStateRef.current = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startNav: navRef.current,
        startScale: { xScale: startXScale, yScale: startYScale },
        moved: false,
      };
      canvas.style.cursor = 'grabbing';
      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (interactionModeRef.current === 'select') {
        const selection = selectionStateRef.current;
        if (!selection.active || selection.pointerId !== event.pointerId) {
          return;
        }
        const rect = computeSelectionRect(
          selection.startX,
          selection.startY,
          event.offsetX,
          event.offsetY
        );
        queueSelectionRectUpdate(rect);
        event.preventDefault();
        return;
      }

      const drag = dragStateRef.current;
      if (!drag.active || drag.pointerId !== event.pointerId) {
        return;
      }

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;

      if (!drag.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
        drag.moved = true;
      }

      canvas.style.transform = `translate(${dx}px, ${dy}px)`;
      queueDisplayNavUpdate({
        x: drag.startNav.x - dx * drag.startScale.xScale,
        y: drag.startNav.y - dy * drag.startScale.yScale,
        z: drag.startNav.z,
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (interactionModeRef.current === 'select') {
        const selection = selectionStateRef.current;
        if (!selection.active || selection.pointerId !== event.pointerId) {
          return;
        }

        selectionStateRef.current = {
          active: false,
          pointerId: null,
          startX: 0,
          startY: 0,
        };
        canvas.releasePointerCapture(event.pointerId);
        suppressClickRef.current = false;

        const rect = computeSelectionRect(
          selection.startX,
          selection.startY,
          event.offsetX,
          event.offsetY
        );
        queueSelectionRectUpdate(null);

      if (rect.width < 4 || rect.height < 4) {
        return;
      }

      const { x0: bx0, y0: by0, xScale: bxScale, yScale: byScale } = boundsRef.current;
        const xMin = bx0 + bxScale * rect.x;
        const yMin = by0 + byScale * rect.y;
        const xMax = bx0 + bxScale * (rect.x + rect.width);
        const yMax = by0 + byScale * (rect.y + rect.height);

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const scale = Math.min(scaleX, scaleY);
        const nextNav = {
          x: (xMin + xMax) / 2,
          y: (yMin + yMax) / 2,
          z: navRef.current.z * scale,
        };
        resetTilesRef.current = true;
      displayNavRef.current = nextNav;
      setDisplayNav(nextNav);
      setNav(nextNav);
      suppressClickRef.current = true;
      return;
    }

      const drag = dragStateRef.current;
      if (!drag.active || drag.pointerId !== event.pointerId) {
        return;
      }

      const rawDx = event.clientX - drag.startX;
      const rawDy = event.clientY - drag.startY;
      const dx = Math.round(rawDx);
      const dy = Math.round(rawDy);

      canvas.style.transform = 'translate(0px, 0px)';
      canvas.style.cursor = 'grab';
      canvas.releasePointerCapture(event.pointerId);
      dragStateRef.current = { ...drag, active: false, pointerId: null };

      const moved = drag.moved || Math.abs(rawDx) > 2 || Math.abs(rawDy) > 2;
      if (!moved) {
        displayNavRef.current = navRef.current;
        setDisplayNav(navRef.current);
        return;
      }

      if (useGpuCanvas) {
        suppressClickRef.current = true;
        const nextNav = {
          x: drag.startNav.x - dx * drag.startScale.xScale,
          y: drag.startNav.y - dy * drag.startScale.yScale,
          z: drag.startNav.z,
        };
        displayNavRef.current = nextNav;
        setDisplayNav(nextNav);
        setNav(nextNav);
        return;
      }

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const regions = computeGapRegions(dx, dy, canvasWidth, canvasHeight);
      const fullReset =
        regions.length === 1 &&
        regions[0].x === 0 &&
        regions[0].y === 0 &&
        regions[0].width === canvasWidth &&
        regions[0].height === canvasHeight;

      if (!fullReset) {
        panShiftRef.current = { dx, dy };
      } else {
        resetTilesRef.current = true;
        panShiftRef.current = null;
      }

      shiftCanvas(dx, dy);
      suppressClickRef.current = true;
      const nextNav = {
        x: drag.startNav.x - dx * drag.startScale.xScale,
        y: drag.startNav.y - dy * drag.startScale.yScale,
        z: drag.startNav.z,
      };
      displayNavRef.current = nextNav;
      setDisplayNav(nextNav);
      setNav(nextNav);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (interactionModeRef.current === 'select') {
        const selection = selectionStateRef.current;
        if (!selection.active || selection.pointerId !== event.pointerId) {
          return;
        }

        selectionStateRef.current = {
          active: false,
          pointerId: null,
          startX: 0,
          startY: 0,
        };
        canvas.releasePointerCapture(event.pointerId);
        suppressClickRef.current = false;
        queueSelectionRectUpdate(null);
        return;
      }

      const drag = dragStateRef.current;
      if (!drag.active || drag.pointerId !== event.pointerId) {
        return;
      }

      canvas.style.transform = 'translate(0px, 0px)';
      canvas.style.cursor = 'grab';
      canvas.releasePointerCapture(event.pointerId);
      dragStateRef.current = { ...drag, active: false, pointerId: null };
      displayNavRef.current = navRef.current;
      setDisplayNav(navRef.current);
    };

    const handleClick = (event: MouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }

      resetTilesRef.current = true;
      const { x0: bx0, y0: by0, xScale: bxScale, yScale: byScale } = boundsRef.current;
      const currentNav = navRef.current;
      const nextX = bx0 + bxScale * event.offsetX;
      const nextY = by0 + byScale * event.offsetY;
      const nextZ = event.ctrlKey
        ? currentNav.z > 1
          ? currentNav.z / 2
          : currentNav.z
        : currentNav.z * 2;

      setNav({ x: nextX, y: nextY, z: nextZ });
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      resetTilesRef.current = true;
      const { x0: bx0, y0: by0, xScale: bxScale, yScale: byScale } = boundsRef.current;
      const currentNav = navRef.current;
      const nextX = bx0 + bxScale * event.offsetX;
      const nextY = by0 + byScale * event.offsetY;
      const zoomingIn = event.deltaY < 0;

      let nextZ = currentNav.z;
      if (zoomingIn) {
        nextZ = currentNav.z * 2;
      } else if (currentNav.z > 1) {
        nextZ = currentNav.z / 2;
      }

      setNav({ x: nextX, y: nextY, z: nextZ });
    };

    const wheelOptions: AddEventListenerOptions = { passive: false };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('wheel', handleWheel, wheelOptions);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerCancel);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('wheel', handleWheel, wheelOptions);
    };
  }, [computeSelectionRect, queueDisplayNavUpdate, queueSelectionRectUpdate, useGpuCanvas]);

  useEffect(() => {
    if (settings.renderBackend === 'gpu') {
      setRendering(false);
      finalPassRef.current = { renderId: null, start: null };
      return;
    }
    const ctx = contextRef.current;
    const workers = workersRef.current;

    if (!ctx || workers.length === 0 || width <= 0 || height <= 0) {
      return;
    }

    const resolvedTileSize = Math.max(32, settings.tileSize);
    if (tileSizeRef.current !== resolvedTileSize) {
      tileSizeRef.current = resolvedTileSize;
      resetTilesRef.current = true;
    }

    const panShift = panShiftRef.current;
    panShiftRef.current = null;
    const distributionActive = settings.colourMode === 'distribution';

    if (distributionActive) {
      if (
        resetTilesRef.current ||
        tileMapRef.current.size === 0 ||
        !distributionBufferRef.current ||
        distributionBufferRef.current.length !== width * height
      ) {
        const buffer = new Float32Array(width * height);
        buffer.fill(Number.NaN);
        distributionBufferRef.current = buffer;
      } else if (panShift) {
        distributionBufferRef.current = shiftFloatBuffer(
          distributionBufferRef.current,
          panShift.dx,
          panShift.dy,
          width,
          height
        );
      }
    } else {
      distributionBufferRef.current = null;
    }

    if (resetTilesRef.current || tileMapRef.current.size === 0) {
      const tiles = new Map<number, Tile>();
      nextTileIdRef.current = 1;
      for (let y = 0; y < height; y += resolvedTileSize) {
        const tileHeight = Math.min(resolvedTileSize, height - y);
        for (let x = 0; x < width; x += resolvedTileSize) {
          const tileWidth = Math.min(resolvedTileSize, width - x);
          const tile: Tile = {
            id: nextTileIdRef.current++,
            x,
            y,
            width: tileWidth,
            height: tileHeight,
            stepIndex: 0,
            inFlight: false,
          };
          tiles.set(tile.id, tile);
        }
      }
      tileMapRef.current = tiles;
      resetTilesRef.current = false;
    } else if (panShift) {
      const tiles = new Map<number, Tile>();
      tileMapRef.current.forEach((tile) => {
        const shiftedX = tile.x + panShift.dx;
        const shiftedY = tile.y + panShift.dy;
        const clampedX = Math.max(0, shiftedX);
        const clampedY = Math.max(0, shiftedY);
        const clampedWidth = Math.min(shiftedX + tile.width, width) - clampedX;
        const clampedHeight = Math.min(shiftedY + tile.height, height) - clampedY;
        if (clampedWidth > 0 && clampedHeight > 0) {
          tiles.set(tile.id, {
            ...tile,
            x: clampedX,
            y: clampedY,
            width: clampedWidth,
            height: clampedHeight,
            inFlight: false,
          });
        }
      });

      const regions: RenderRegion[] = [];
      if (panShift.dx !== 0) {
        regions.push({
          x: panShift.dx > 0 ? 0 : width + panShift.dx,
          y: 0,
          width: Math.abs(panShift.dx),
          height,
        });
      }
      if (panShift.dy !== 0) {
        regions.push({
          x: 0,
          y: panShift.dy > 0 ? 0 : height + panShift.dy,
          width,
          height: Math.abs(panShift.dy),
        });
      }

      for (const region of regions) {
        for (let y = region.y; y < region.y + region.height; y += resolvedTileSize) {
          const tileHeight = Math.min(resolvedTileSize, region.y + region.height - y);
          for (let x = region.x; x < region.x + region.width; x += resolvedTileSize) {
            const tileWidth = Math.min(resolvedTileSize, region.x + region.width - x);
            if (tileWidth <= 0 || tileHeight <= 0) {
              continue;
            }
            const tile: Tile = {
              id: nextTileIdRef.current++,
              x,
              y,
              width: tileWidth,
              height: tileHeight,
              stepIndex: 0,
              inFlight: false,
            };
            tiles.set(tile.id, tile);
          }
        }
      }

      tileMapRef.current = tiles;
    }

    const renderId = renderIdRef.current + 1;
    renderIdRef.current = renderId;
    finalPassRef.current = { renderId, start: null };
    setFinalRenderMs(null);
    distributionAppliedRef.current = false;

    const smooth = settings.smooth;
    const pscale =
      settings.colourMode === 'normalize' || settings.colourMode === 'distribution'
        ? (palette.length - 1) / effectiveMaxIterations
        : settings.colourMode === 'cycle'
          ? (palette.length - 1) / Math.max(1, settings.colourPeriod)
          : (palette.length - 1) / MAX_PALETTE_ITERATIONS;
    renderConfigRef.current = {
      renderId,
      max: effectiveMaxIterations,
      pscale,
      palette,
      smooth,
      colourMode: settings.colourMode,
      ditherStrength:
        settings.filterMode === 'dither' ? Math.max(0, settings.ditherStrength) : 0,
    };

    pendingByTaskRef.current.clear();
    tileMapRef.current.forEach((tile) => {
      tile.inFlight = false;
    });

    const hasWork = Array.from(tileMapRef.current.values()).some(
      (tile) => tile.stepIndex < blockSteps.length
    );
    setRendering(hasWork);

    scheduleAllTiles(renderId);
  }, [
    height,
    palette,
    scheduleAllTiles,
    setRendering,
    blockSteps,
    effectiveMaxIterations,
    settings.autoIterationsScale,
    settings.autoMaxIterations,
    settings.colourMode,
    settings.colourPeriod,
    settings.ditherStrength,
    settings.filterMode,
    settings.maxIterations,
    settings.finalBlockSize,
    settings.refinementStepsCount,
    settings.smooth,
    settings.tileSize,
    settings.workerCount,
    resolvedAlgorithm,
    width,
    x0,
    xScale,
    y0,
    yScale,
    settings.renderBackend,
  ]);

  return (
    <div style={{ width, height }} className="relative bg-black">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ filter: canvasFilter }}
        className={`absolute inset-0 touch-none bg-black ${useGpuCanvas ? 'hidden' : ''}`}
      />
      <canvas
        ref={glCanvasRef}
        width={width}
        height={height}
        style={{ filter: canvasFilter }}
        className={`absolute inset-0 touch-none bg-black ${useGpuCanvas ? '' : 'hidden'}`}
      />
      {selectionRect && (
        <div
          className="fixed border border-cyan-400/70 bg-cyan-400/10 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.2)] dark:border-cyan-300/70 dark:bg-cyan-300/10 pointer-events-none"
          style={{
            left: selectionRect.x,
            top: selectionRect.y,
            width: selectionRect.width,
            height: selectionRect.height,
          }}
        />
      )}
      <InfoPanel
        nav={displayNav}
        isRendering={isRendering}
        maxIterations={effectiveMaxIterations}
        precisionWarning={precisionWarning}
        renderMode={renderModeLabel}
        finalRenderMs={finalRenderMs}
        gpuError={gpuError}
      />
    </div>
  );
};

export default FractalCanvas;
