import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PaletteGenerator from '../util/PaletteGenerator';
import { DEFAULT_JULIA, getDefaultView, normaliseAlgorithm } from '../util/fractals';
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

const BASE_NUMBER_RANGE = 1;
const BASE_BLOCK_SIZE = 256;
const MAX_PALETTE_ITERATIONS = 2048;
const PRECISION_EPS_SCALE = 512;

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

  const matches = loc.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?/i);
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
  const fixed = value.toFixed(10);
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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
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
      const canvas = canvasRef.current;
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
  }, [interactionMode]);

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

  const blockSteps = useMemo(
    () => buildBlockSteps(settings.refinementStepsCount, settings.finalBlockSize),
    [settings.refinementStepsCount, settings.finalBlockSize]
  );

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

  const precisionWarning = useMemo(() => {
    const scale = Math.max(1, Math.abs(nav.x), Math.abs(nav.y));
    const limit = Number.EPSILON * PRECISION_EPS_SCALE * scale;
    return xScale < limit || yScale < limit;
  }, [nav.x, nav.y, xScale, yScale]);

  useEffect(() => {
    boundsRef.current = { x0, y0, xScale, yScale };
  }, [x0, y0, xScale, yScale]);

  useEffect(() => {
    if (canvasRef.current) {
      contextRef.current = canvasRef.current.getContext('2d');
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.style.cursor = interactionMode === 'grab' ? 'grab' : 'crosshair';
  }, [interactionMode]);

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
    if (canvas) {
      canvas.style.transform = 'translate(0px, 0px)';
      canvas.style.cursor = interactionMode === 'grab' ? 'grab' : 'crosshair';
    }
    resetTilesRef.current = true;
  }, [resetSignal, resolvedAlgorithm, interactionMode]);

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
          setRendering(false);
          if (config.colourMode === 'distribution') {
            applyDistributionColouring(config);
          }
        }
      }
    },
    [applyDistributionColouring, blockSteps, scheduleTileStep, setRendering, width]
  );

  useEffect(() => {
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
  }, [handleWorkerMessage, workerCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
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
  }, [computeSelectionRect, queueDisplayNavUpdate, queueSelectionRectUpdate]);

  useEffect(() => {
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
  ]);

  return (
    <div style={{ width, height }} className="bg-black">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ filter: canvasFilter }}
        className="block touch-none bg-black"
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
      />
    </div>
  );
};

export default FractalCanvas;
