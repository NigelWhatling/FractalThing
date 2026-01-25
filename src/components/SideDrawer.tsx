import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent,
} from 'react';
import { HexColorPicker } from 'react-colorful';
import PaletteGenerator, {
  DEFAULT_PALETTE_STOPS,
  type PaletteStop,
} from '../util/PaletteGenerator';
import { START } from '../workers/WorkerCommands';
import type { RenderSettings } from '../state/settings';

type SideDrawerProps = {
  settings: RenderSettings;
  onUpdateSettings: (payload: Partial<RenderSettings>) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  loc?: string;
};

const refinementOptions = [
  { label: 'Slow', steps: 7 },
  { label: 'Balanced', steps: 5 },
  { label: 'Fast', steps: 3 },
];

const finalQualityOptions = [
  { label: 'Large', value: 4 },
  { label: 'Medium', value: 2 },
  { label: 'Best', value: 1 },
];

const colourModeOptions = [
  { value: 'normalize', label: 'Normalise to max' },
  { value: 'distribution', label: 'Distribution (equalised)' },
  { value: 'cycle', label: 'Cycle palette' },
  { value: 'fixed', label: 'Fixed (2048)' },
];

const filterOptions = [
  { value: 'none', label: 'None' },
  { value: 'gaussianSoft', label: 'Gaussian blur' },
  { value: 'vivid', label: 'Vivid' },
  { value: 'mono', label: 'Mono' },
  { value: 'dither', label: 'Dither (banding)' },
];

type LabelWithHelpProps = {
  label: string;
  tooltip: string;
  variant?: 'subtitle' | 'body' | 'caption';
};

const LabelWithHelp = ({
  label,
  tooltip,
  variant = 'subtitle',
}: LabelWithHelpProps) => {
  const textClass =
    variant === 'caption'
      ? 'text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-white/50'
      : variant === 'body'
        ? 'text-sm text-slate-800 dark:text-white/90'
        : 'text-[11px] uppercase tracking-[0.14em] text-slate-600 dark:text-white/60';
  return (
    <div className='flex items-center gap-2'>
      <span className={textClass}>{label}</span>
      <span
        className='cursor-help text-xs text-slate-400 dark:text-white/40'
        role='img'
        aria-label={`${label} info`}
        title={tooltip}
      >
        ⓘ
      </span>
    </div>
  );
};

const Section = ({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) => (
  <details
    className='group border-b border-slate-200/70 pb-6 dark:border-white/10'
    open={defaultOpen}
  >
    <summary className='flex cursor-pointer items-center justify-between py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600 dark:text-white/70 [&::-webkit-details-marker]:hidden'>
      <span>{title}</span>
      <span className='transition-transform group-open:rotate-180'>▾</span>
    </summary>
    <div className='space-y-4 pt-2'>{children}</div>
  </details>
);

const SideDrawer = ({
  settings,
  onUpdateSettings,
  theme,
  onToggleTheme,
  loc,
}: SideDrawerProps) => {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const [tileSizeDraft, setTileSizeDraft] = useState(settings.tileSize);
  const [iterationsDraft, setIterationsDraft] = useState(
    settings.maxIterations,
  );
  const [refinementPreset, setRefinementPreset] = useState(0);
  const [finalQualityPreset, setFinalQualityPreset] = useState(0);
  const [colourPeriodDraft, setColourPeriodDraft] = useState(
    settings.colourPeriod,
  );
  const [autoIterationsScaleDraft, setAutoIterationsScaleDraft] = useState(
    settings.autoIterationsScale,
  );
  const [gaussianBlurDraft, setGaussianBlurDraft] = useState(
    settings.gaussianBlur,
  );
  const [ditherStrengthDraft, setDitherStrengthDraft] = useState(
    settings.ditherStrength,
  );
  const [paletteSmoothnessDraft, setPaletteSmoothnessDraft] = useState(
    settings.paletteSmoothness,
  );
  const [hueRotateDraft, setHueRotateDraft] = useState(settings.hueRotate);
  const [workerCountDraft, setWorkerCountDraft] = useState(
    settings.workerCount,
  );
  const [paletteStopsDraft, setPaletteStopsDraft] = useState<PaletteStop[]>(
    settings.paletteStops,
  );
  const [paletteJson, setPaletteJson] = useState('');
  const [paletteError, setPaletteError] = useState('');
  const [paletteModalOpen, setPaletteModalOpen] = useState(false);
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(
    null,
  );
  const paletteDragIndexRef = useRef<number | null>(null);
  const palettePendingRef = useRef<{ index: number; startX: number } | null>(
    null,
  );
  const paletteBarRef = useRef<HTMLDivElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewData, setPreviewData] = useState<{
    values: Float32Array;
    width: number;
    height: number;
    max: number;
    smooth: boolean;
  } | null>(null);
  const previewRenderIdRef = useRef(0);

  const parseNavFromLoc = (value?: string) => {
    const defaults = { x: -0.5, y: 0, z: 1 };
    if (!value) {
      return defaults;
    }
    const matches = new RegExp(
      /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?/i,
    ).exec(value);
    if (!matches) {
      return defaults;
    }
    const x = Number.parseFloat(matches[1] ?? '');
    const y = Number.parseFloat(matches[2] ?? '');
    const z = Number.parseFloat(matches[3] ?? '');
    return {
      x: Number.isFinite(x) ? x : defaults.x,
      y: Number.isFinite(y) ? y : defaults.y,
      z: Number.isFinite(z) ? z : defaults.z,
    };
  };

  const previewNav = useMemo(() => parseNavFromLoc(loc), [loc]);

  const workerMax = useMemo(
    () =>
      Math.max(
        1,
        typeof navigator === 'undefined'
          ? 8
          : navigator.hardwareConcurrency || 8,
      ),
    [],
  );

  useEffect(() => {
    setTileSizeDraft(settings.tileSize);
  }, [settings.tileSize]);

  useEffect(() => {
    setIterationsDraft(settings.maxIterations);
  }, [settings.maxIterations]);

  useEffect(() => {
    setColourPeriodDraft(settings.colourPeriod);
  }, [settings.colourPeriod]);

  useEffect(() => {
    setAutoIterationsScaleDraft(settings.autoIterationsScale);
  }, [settings.autoIterationsScale]);

  useEffect(() => {
    setGaussianBlurDraft(settings.gaussianBlur);
  }, [settings.gaussianBlur]);

  useEffect(() => {
    setDitherStrengthDraft(settings.ditherStrength);
  }, [settings.ditherStrength]);

  useEffect(() => {
    setPaletteSmoothnessDraft(settings.paletteSmoothness);
  }, [settings.paletteSmoothness]);

  useEffect(() => {
    setHueRotateDraft(settings.hueRotate);
  }, [settings.hueRotate]);

  useEffect(() => {
    setWorkerCountDraft(settings.workerCount);
  }, [settings.workerCount]);

  useEffect(() => {
    setPaletteStopsDraft(settings.paletteStops);
  }, [settings.paletteStops]);

  const updatePaletteStops = (
    updater: PaletteStop[] | ((currentStops: PaletteStop[]) => PaletteStop[]),
  ) => {
    setPaletteStopsDraft((currentStops) =>
      typeof updater === 'function' ? updater(currentStops) : updater,
    );
  };

  const paletteDirty = useMemo(() => {
    if (paletteStopsDraft.length !== settings.paletteStops.length) {
      return true;
    }
    return paletteStopsDraft.some((stop, index) => {
      const current = settings.paletteStops[index];
      return (
        !current ||
        current.position !== stop.position ||
        current.colour !== stop.colour
      );
    });
  }, [paletteStopsDraft, settings.paletteStops]);

  const applyPaletteStops = () => {
    onUpdateSettings({ paletteStops: paletteStopsDraft });
    setPaletteError('');
    setPaletteModalOpen(false);
  };

  const closePaletteModal = () => {
    setPaletteStopsDraft(settings.paletteStops);
    setPaletteError('');
    setPaletteModalOpen(false);
    setSelectedStopIndex(null);
  };

  useEffect(() => {
    if (!paletteModalOpen) {
      paletteDragIndexRef.current = null;
      palettePendingRef.current = null;
      return;
    }
    setPaletteJson(JSON.stringify(paletteStopsDraft, null, 2));
    const sorted = paletteStopsDraft
      .map((stop, index) => ({ position: stop.position, index }))
      .sort((a, b) => a.position - b.position);
    if (sorted.length === 0) {
      setSelectedStopIndex(null);
      return;
    }
    if (selectedStopIndex === null || !paletteStopsDraft[selectedStopIndex]) {
      setSelectedStopIndex(sorted[0]?.index ?? null);
    }
  }, [paletteStopsDraft, paletteModalOpen, selectedStopIndex]);

  const handlePaletteStopChange = (
    index: number,
    partial: Partial<PaletteStop>,
  ) => {
    updatePaletteStops((currentStops) => {
      let nextPartial = partial;
      if (partial.position !== undefined) {
        const sorted = currentStops
          .map((stop, stopIndex) => ({
            position: stop.position,
            index: stopIndex,
          }))
          .sort((a, b) => a.position - b.position);
        const currentIndex = sorted.findIndex((stop) => stop.index === index);
        const epsilon = 0.005;
        const min =
          currentIndex > 0 ? sorted[currentIndex - 1].position + epsilon : 0;
        const max =
          currentIndex < sorted.length - 1
            ? sorted[currentIndex + 1].position - epsilon
            : 1;
        const upperBound = Math.max(min, max);
        const clampedPosition = Math.min(
          upperBound,
          Math.max(min, partial.position),
        );
        nextPartial = { ...partial, position: clampedPosition };
      }
      return currentStops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, ...nextPartial } : stop,
      );
    });
  };

  const handleAddStop = () => {
    updatePaletteStops((currentStops) => {
      const nextStops = [...currentStops, { position: 0.5, colour: '#ffffff' }];
      setSelectedStopIndex(nextStops.length - 1);
      return nextStops;
    });
  };

  const handleRemoveStop = (index: number) => {
    updatePaletteStops((currentStops) => {
      if (currentStops.length <= 2) {
        return currentStops;
      }
      const removed = currentStops[index];
      const nextStops = currentStops.filter(
        (_, stopIndex) => stopIndex !== index,
      );
      if (selectedStopIndex === null || !removed) {
        return nextStops;
      }
      if (selectedStopIndex === index) {
        const sorted = nextStops
          .map((stop, stopIndex) => ({
            index: stopIndex,
            position: stop.position,
          }))
          .sort((a, b) => a.position - b.position);
        if (sorted.length === 0) {
          setSelectedStopIndex(null);
          return nextStops;
        }
        let closest = sorted[0];
        let minDistance = Math.abs(sorted[0].position - removed.position);
        sorted.forEach((stop) => {
          const distance = Math.abs(stop.position - removed.position);
          if (distance < minDistance) {
            closest = stop;
            minDistance = distance;
          }
        });
        setSelectedStopIndex(closest.index);
        return nextStops;
      }
      if (selectedStopIndex > index) {
        setSelectedStopIndex(selectedStopIndex - 1);
      }
      return nextStops;
    });
  };

  const handleResetPalette = () => {
    updatePaletteStops(DEFAULT_PALETTE_STOPS.map((stop) => ({ ...stop })));
    setPaletteJson('');
    setPaletteError('');
  };

  const parsePaletteJson = (value: string) => {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed) || parsed.length < 2) {
        throw new Error('Palette JSON must be an array with at least 2 stops.');
      }
      const nextStops: PaletteStop[] = parsed.map((stop) => {
        if (!stop || typeof stop !== 'object') {
          throw new Error(
            'Each stop must be an object with position and colour.',
          );
        }
        const position = Number(stop.position);
        const colour = String(stop.colour);
        if (!Number.isFinite(position) || !colour) {
          throw new Error('Each stop must include a position and colour.');
        }
        return { position, colour };
      });
      updatePaletteStops(nextStops);
      setPaletteError('');
    } catch (error) {
      setPaletteError(
        error instanceof Error
          ? error.message
          : 'Could not parse palette JSON.',
      );
    }
  };

  const sortedStops = useMemo(
    () =>
      paletteStopsDraft
        .map((stop, index) => ({ ...stop, index }))
        .sort((a, b) => a.position - b.position),
    [paletteStopsDraft],
  );
  const selectedStop = useMemo(() => {
    if (selectedStopIndex === null) {
      return null;
    }
    return paletteStopsDraft[selectedStopIndex] ?? null;
  }, [paletteStopsDraft, selectedStopIndex]);

  const paletteGradient = useMemo(() => {
    const stops = sortedStops
      .map((stop) => `${stop.colour} ${Math.round(stop.position * 100)}%`)
      .join(', ');
    return `linear-gradient(90deg, ${stops})`;
  }, [sortedStops]);

  const previewPalette = useMemo(() => {
    const basePalette = PaletteGenerator(2048, paletteStopsDraft);
    if (settings.paletteSmoothness <= 0) {
      return basePalette;
    }
    const smoothPalette = (palette: number[][]) => {
      if (palette.length < 2) {
        return palette;
      }
      const next = new Array(palette.length);
      next[0] = palette[0];
      next[palette.length - 1] = palette[palette.length - 1];
      for (let index = 1; index < palette.length - 1; index += 1) {
        const prev = palette[index - 1];
        const current = palette[index];
        const nextColour = palette[index + 1];
        next[index] = [
          (prev[0] + current[0] + nextColour[0]) / 3,
          (prev[1] + current[1] + nextColour[1]) / 3,
          (prev[2] + current[2] + nextColour[2]) / 3,
        ];
      }
      return next;
    };
    const smoothed = smoothPalette(basePalette);
    if (settings.paletteSmoothness >= 1) {
      return smoothed;
    }
    const blended = new Array(basePalette.length);
    for (let index = 0; index < basePalette.length; index += 1) {
      const base = basePalette[index];
      const smooth = smoothed[index];
      blended[index] = [
        base[0] + (smooth[0] - base[0]) * settings.paletteSmoothness,
        base[1] + (smooth[1] - base[1]) * settings.paletteSmoothness,
        base[2] + (smooth[2] - base[2]) * settings.paletteSmoothness,
      ];
    }
    return blended;
  }, [paletteStopsDraft, settings.paletteSmoothness]);

  const getColourAtPosition = (position: number) => {
    const stops = sortedStops;
    if (stops.length === 0) {
      return '#ffffff';
    }
    const clamped = Math.min(1, Math.max(0, position));
    let left = stops[0];
    let right = stops[stops.length - 1];
    for (let index = 0; index < stops.length - 1; index += 1) {
      if (
        clamped >= stops[index].position &&
        clamped <= stops[index + 1].position
      ) {
        left = stops[index];
        right = stops[index + 1];
        break;
      }
    }
    const parse = (hex: string) => {
      const value = hex.replace('#', '');
      const int = Number.parseInt(
        value.length === 3 ? value.replace(/./g, (c) => c + c) : value,
        16,
      );
      return {
        r: (int >> 16) & 255,
        g: (int >> 8) & 255,
        b: int & 255,
      };
    };
    const leftRgb = parse(left.colour);
    const rightRgb = parse(right.colour);
    const span = Math.max(0.0001, right.position - left.position);
    const t = (clamped - left.position) / span;
    const toHex = (value: number) =>
      Math.round(value).toString(16).padStart(2, '0');
    const r = leftRgb.r + (rightRgb.r - leftRgb.r) * t;
    const g = leftRgb.g + (rightRgb.g - leftRgb.g) * t;
    const b = leftRgb.b + (rightRgb.b - leftRgb.b) * t;
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  useEffect(() => {
    if (!paletteModalOpen) {
      return;
    }

    const previewWidth = 320;
    const previewHeight = 320;
    const ratio = previewWidth / previewHeight;
    const xMin = previewNav.x - ratio / previewNav.z;
    const xMax = previewNav.x + ratio / previewNav.z;
    const yMin = previewNav.y - 1 / previewNav.z;
    const yMax = previewNav.y + 1 / previewNav.z;
    const xScale = Math.abs(xMax - xMin) / previewWidth;
    const yScale = Math.abs(yMax - yMin) / previewHeight;
    const maxIterations = settings.autoMaxIterations
      ? Math.max(
          settings.maxIterations,
          settings.maxIterations +
            settings.autoIterationsScale * Math.log2(Math.max(1, previewNav.z)),
        )
      : settings.maxIterations;

    const worker = new Worker(
      new URL('../workers/Mandelbrot.worker.ts', import.meta.url),
      { type: 'module' },
    );
    const renderId = previewRenderIdRef.current + 1;
    previewRenderIdRef.current = renderId;

    worker.onmessage = (event) => {
      const response = event.data as {
        renderId: number;
        values: number[];
        width: number;
        height: number;
        max: number;
      };
      if (response.renderId !== renderId) {
        return;
      }
      setPreviewData({
        values: Float32Array.from(response.values),
        width: previewWidth,
        height: previewHeight,
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
      x0: xMin,
      y0: yMin,
      xScale,
      yScale,
      width: previewWidth,
      height: previewHeight,
      blockSize: 1,
      max: Math.round(maxIterations),
      smooth: settings.smooth,
    });

    return () => {
      worker.terminate();
    };
  }, [
    paletteModalOpen,
    previewNav.x,
    previewNav.y,
    previewNav.z,
    settings.autoIterationsScale,
    settings.autoMaxIterations,
    settings.maxIterations,
    settings.smooth,
  ]);

  useEffect(() => {
    if (!paletteModalOpen || !previewData || !previewCanvasRef.current) {
      return;
    }
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const { values, width, height, max, smooth } = previewData;
    canvas.width = width;
    canvas.height = height;
    const palette = previewPalette;
    const paletteSize = palette.length;
    const isDistribution = settings.colourMode === 'distribution';
    const isCycle = settings.colourMode === 'cycle';
    const isFixed = settings.colourMode === 'fixed';
    const pscale =
      settings.colourMode === 'normalize' || isDistribution
        ? (palette.length - 1) / Math.max(1, max)
        : settings.colourMode === 'cycle'
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
        const denom = 1 - cdfMin;
        if (denom > 0) {
          for (let index = 0; index < distributionCdf.length; index += 1) {
            distributionCdf[index] = Math.max(
              0,
              (distributionCdf[index] - cdfMin) / denom,
            );
          }
        }
      }
    }
    const imageData = ctx.createImageData(width, height);
    let idx = 0;
    for (const element of values) {
      const iterationValue = element;
      let rgb: number[];
      if (isDistribution && distributionCdf) {
        if (iterationValue < max) {
          const base = Math.floor(iterationValue);
          const frac = iterationValue - base;
          const baseIndex = Math.min(
            distributionCdf.length - 1,
            Math.max(0, base),
          );
          const nextIndex = Math.min(distributionCdf.length - 1, baseIndex + 1);
          const cdfValue =
            distributionCdf[baseIndex] +
            (distributionCdf[nextIndex] - distributionCdf[baseIndex]) * frac;
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
          const scaled = pscale * iterationValue;
          const baseRaw = Math.floor(scaled);
          const frac = scaled - baseRaw;
          const baseIndex = isCycle
            ? ((baseRaw % paletteSize) + paletteSize) % paletteSize
            : isFixed
              ? Math.min(paletteSize - 2, Math.max(0, baseRaw))
              : Math.min(paletteSize - 2, Math.max(0, baseRaw));
          const nextIndex = isCycle
            ? (baseIndex + 1) % paletteSize
            : baseIndex + 1;
          const rgb1 = palette[baseIndex];
          const rgb2 = palette[nextIndex];
          rgb = [
            rgb1[0] + (rgb2[0] - rgb1[0]) * frac,
            rgb1[1] + (rgb2[1] - rgb1[1]) * frac,
            rgb1[2] + (rgb2[2] - rgb1[2]) * frac,
          ];
        } else {
          rgb = [0, 0, 0];
        }
      } else {
        if (iterationValue < max) {
          const scaled = pscale * iterationValue;
          const baseRaw = Math.floor(scaled);
          const paletteIndex = isCycle
            ? ((baseRaw % paletteSize) + paletteSize) % paletteSize
            : isFixed
              ? Math.min(paletteSize - 1, Math.max(0, baseRaw))
              : Math.min(paletteSize - 1, Math.max(0, baseRaw));
          rgb = palette[paletteIndex];
        } else {
          rgb = [0, 0, 0];
        }
      }
      imageData.data[idx++] = Math.floor(rgb[0]);
      imageData.data[idx++] = Math.floor(rgb[1]);
      imageData.data[idx++] = Math.floor(rgb[2]);
      imageData.data[idx++] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }, [
    paletteModalOpen,
    previewData,
    previewPalette,
    settings.colourMode,
    settings.colourPeriod,
  ]);

  const updateStopPositionFromEvent = (event: PointerEvent) => {
    if (paletteDragIndexRef.current === null && palettePendingRef.current) {
      const delta = Math.abs(event.clientX - palettePendingRef.current.startX);
      if (delta > 3) {
        paletteDragIndexRef.current = palettePendingRef.current.index;
        palettePendingRef.current = null;
      } else {
        return;
      }
    }
    if (paletteDragIndexRef.current === null || !paletteBarRef.current) {
      return;
    }
    const rect = paletteBarRef.current.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const position = Math.min(1, Math.max(0, ratio));
    handlePaletteStopChange(paletteDragIndexRef.current, { position });
  };

  useEffect(() => {
    if (!paletteModalOpen) {
      return;
    }
    const handlePointerMove = (event: PointerEvent) => {
      updateStopPositionFromEvent(event);
    };
    const handlePointerUp = () => {
      if (paletteDragIndexRef.current !== null) {
        paletteDragIndexRef.current = null;
        return;
      }
      if (palettePendingRef.current) {
        palettePendingRef.current = null;
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePaletteModal();
      }
    };
    globalThis.addEventListener('pointermove', handlePointerMove);
    globalThis.addEventListener('pointerup', handlePointerUp);
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.removeEventListener('pointermove', handlePointerMove);
      globalThis.removeEventListener('pointerup', handlePointerUp);
      globalThis.removeEventListener('keydown', handleKeyDown);
    };
  }, [paletteModalOpen]);

  const handlePaletteBarClick = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const position = Math.min(1, Math.max(0, ratio));
    const colour = getColourAtPosition(position);
    updatePaletteStops((currentStops) => {
      const nextIndex = currentStops.length;
      const nextStops = [...currentStops, { position, colour }];
      setSelectedStopIndex(nextIndex);
      return nextStops;
    });
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || drawerRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    const index = refinementOptions.findIndex(
      (preset) => preset.steps === settings.refinementStepsCount,
    );
    setRefinementPreset(index === -1 ? 0 : index);
  }, [settings.refinementStepsCount]);

  useEffect(() => {
    const index = finalQualityOptions.findIndex(
      (option) => option.value === settings.finalBlockSize,
    );
    setFinalQualityPreset(index === -1 ? 0 : index);
  }, [settings.finalBlockSize]);

  return (
    <>
      {!open && (
        <button
          type='button'
          aria-label='Open controls'
          className='fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/70 bg-white/70 text-lg text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.12)] backdrop-blur-xl transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900/70 dark:text-white/80 dark:shadow-[0_10px_24px_rgba(0,0,0,0.5)] dark:hover:border-white/30 dark:hover:text-white'
          onClick={() => setOpen(true)}
        >
          ☰
        </button>
      )}

      {open && (
        <aside
          className='fixed bottom-10 left-4 top-4 z-50 w-[340px] max-w-[92vw]'
          style={{ width: 340, maxWidth: '92vw' }}
          ref={drawerRef}
        >
          <button
            type='button'
            aria-label='Close controls'
            className='absolute right-[-44px] top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/70 bg-white/80 text-slate-600 transition hover:bg-white hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white'
            onClick={() => setOpen(false)}
            title='Close'
          >
            <svg className='h-5 w-5' viewBox='0 0 24 24' fill='none'>
              <path
                d='M18 6L6 18M6 6l12 12'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
              />
            </svg>
          </button>
          <div
            className='relative h-full overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.15)] dark:border-white/10 dark:bg-slate-900/70 dark:shadow-[0_20px_60px_rgba(0,0,0,0.55)]'
            style={{ contain: 'paint' }}
          >
            <div className='flex h-full flex-col gap-6 overflow-y-auto overflow-x-hidden px-5 py-5 text-slate-900 dark:text-white'>
              <Section title='Render settings' defaultOpen>
                <div className='space-y-2'>
                  <div className='flex items-center justify-between'>
                    <LabelWithHelp
                      label={
                        settings.autoMaxIterations
                          ? 'Base iterations'
                          : 'Max iterations'
                      }
                      tooltip={
                        settings.autoMaxIterations
                          ? 'Base escape-iteration cap. Auto mode adds extra iterations as you zoom.'
                          : 'Escape-iteration cap. Higher values reveal more detail but render slower.'
                      }
                      variant='body'
                    />
                    <span className='rounded-lg border border-slate-200/70 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-white/90'>
                      {iterationsDraft}
                    </span>
                  </div>
                  <input
                    type='range'
                    min={32}
                    max={2048}
                    step={32}
                    value={iterationsDraft}
                    className='w-full accent-cyan-400 dark:accent-cyan-300'
                    onChange={(event) => {
                      const nextValue = Math.max(
                        32,
                        Math.round(Number(event.target.value)),
                      );
                      setIterationsDraft(nextValue);
                      onUpdateSettings({ maxIterations: nextValue });
                    }}
                  />
                  <div className='flex justify-between text-[11px] text-slate-500 dark:text-white/40'>
                    <span>32</span>
                    <span>2048</span>
                  </div>
                </div>

                <div className='space-y-2'>
                  <LabelWithHelp
                    label='Colour mode'
                    tooltip='How iterations map to the palette: Normalise scales with max, Distribution equalises, Cycle repeats, Fixed uses 2048.'
                  />
                  <div className='relative'>
                    <select
                      className='w-full appearance-none rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 dark:border-white/10 dark:bg-white/5 dark:text-white/90 dark:hover:bg-white/10'
                      value={settings.colourMode}
                      onChange={(event) =>
                        onUpdateSettings({
                          colourMode: event.target
                            .value as typeof settings.colourMode,
                        })
                      }
                    >
                      {colourModeOptions.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          className='bg-white text-slate-900 dark:bg-slate-900 dark:text-white'
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <svg
                      className='pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/60'
                      viewBox='0 0 24 24'
                      fill='none'
                    >
                      <path
                        d='M7 10l5 5 5-5'
                        stroke='currentColor'
                        strokeWidth='2'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                      />
                    </svg>
                  </div>
                </div>

                <div className='space-y-2'>
                  <LabelWithHelp
                    label='Filters'
                    tooltip='Post-processing effects applied to the canvas.'
                  />
                  <div className='relative'>
                    <select
                      className='w-full appearance-none rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 dark:border-white/10 dark:bg-white/5 dark:text-white/90 dark:hover:bg-white/10'
                      value={settings.filterMode}
                      onChange={(event) =>
                        onUpdateSettings({
                          filterMode: event.target
                            .value as typeof settings.filterMode,
                        })
                      }
                    >
                      {filterOptions.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          className='bg-white text-slate-900 dark:bg-slate-900 dark:text-white'
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <svg
                      className='pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/60'
                      viewBox='0 0 24 24'
                      fill='none'
                    >
                      <path
                        d='M7 10l5 5 5-5'
                        stroke='currentColor'
                        strokeWidth='2'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                      />
                    </svg>
                  </div>
                </div>

                <div className='space-y-2'>
                  <LabelWithHelp
                    label='Colour blend'
                    tooltip='Blends neighbouring palette colours to soften banding without blurring detail.'
                  />
                  <input
                    type='range'
                    min={0}
                    max={1}
                    step={0.05}
                    value={paletteSmoothnessDraft}
                    className='w-full accent-cyan-400 dark:accent-cyan-300'
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      setPaletteSmoothnessDraft(nextValue);
                      onUpdateSettings({
                        paletteSmoothness: Math.min(1, Math.max(0, nextValue)),
                      });
                    }}
                  />
                </div>

                <div className='space-y-2'>
                  <div className='flex items-center justify-between'>
                    <LabelWithHelp
                      label='Hue shift'
                      tooltip='Rotates the hue of the final image.'
                    />
                    <span className='rounded-lg border border-slate-200/70 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-white/90'>
                      {hueRotateDraft}
                    </span>
                  </div>
                  <input
                    type='range'
                    min={-180}
                    max={180}
                    step={5}
                    value={hueRotateDraft}
                    className='w-full accent-cyan-400 dark:accent-cyan-300'
                    onChange={(event) => {
                      const nextValue = Math.round(Number(event.target.value));
                      setHueRotateDraft(nextValue);
                      onUpdateSettings({ hueRotate: nextValue });
                    }}
                  />
                </div>

                <div className='space-y-3'>
                  <LabelWithHelp
                    label='Palette editor'
                    tooltip='Adjust colour stops for the gradient palette.'
                  />
                  <div
                    className='h-3 w-full rounded-full border border-slate-200/70 bg-slate-200 dark:border-white/10 dark:bg-white/5'
                    style={{ backgroundImage: paletteGradient }}
                  />
                  <button
                    type='button'
                    className='rounded-lg border border-slate-200/70 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10'
                    onClick={() => {
                      setPaletteStopsDraft(settings.paletteStops);
                      setPaletteJson(
                        JSON.stringify(settings.paletteStops, null, 2),
                      );
                      setPaletteError('');
                      setSelectedStopIndex(
                        settings.paletteStops.length > 0 ? 0 : null,
                      );
                      setPaletteModalOpen(true);
                    }}
                  >
                    Edit palette
                  </button>
                </div>

                {settings.filterMode === 'gaussianSoft' && (
                  <div className='space-y-2'>
                    <LabelWithHelp
                      label='Gaussian blur strength'
                      tooltip='Applies a subtle blur in pixels. Lower values keep more detail.'
                    />
                    <input
                      type='range'
                      min={0}
                      max={2}
                      step={0.1}
                      value={gaussianBlurDraft}
                      className='w-full accent-cyan-400 dark:accent-cyan-300'
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        setGaussianBlurDraft(nextValue);
                        onUpdateSettings({
                          gaussianBlur: Math.max(0, nextValue),
                        });
                      }}
                    />
                  </div>
                )}

                {settings.filterMode === 'dither' && (
                  <div className='space-y-2'>
                    <LabelWithHelp
                      label='Dither strength'
                      tooltip='Adds tiny colour variation to reduce flat banding without blurring detail.'
                    />
                    <input
                      type='range'
                      min={0}
                      max={1}
                      step={0.05}
                      value={ditherStrengthDraft}
                      className='w-full accent-cyan-400 dark:accent-cyan-300'
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        setDitherStrengthDraft(nextValue);
                        onUpdateSettings({
                          ditherStrength: Math.max(0, nextValue),
                        });
                      }}
                    />
                  </div>
                )}

                {settings.colourMode === 'cycle' && (
                  <div className='space-y-2'>
                    <LabelWithHelp
                      label='Colour period'
                      tooltip='Number of iterations per full palette cycle. Lower values repeat colours more often.'
                    />
                    <input
                      type='range'
                      min={64}
                      max={2048}
                      step={64}
                      value={colourPeriodDraft}
                      className='w-full accent-cyan-400 dark:accent-cyan-300'
                      onChange={(event) => {
                        const nextValue = Math.round(
                          Number(event.target.value),
                        );
                        setColourPeriodDraft(nextValue);
                        onUpdateSettings({
                          colourPeriod: Math.max(64, nextValue),
                        });
                      }}
                    />
                  </div>
                )}

                <div className='space-y-3'>
                  <div className='flex items-center justify-between rounded-xl border border-slate-200/70 bg-slate-100/70 px-4 py-3 dark:border-white/10 dark:bg-white/5'>
                    <LabelWithHelp
                      label='Smooth colouring'
                      tooltip='Interpolates between iteration bands for smoother gradients.'
                      variant='body'
                    />
                    <button
                      type='button'
                      role='switch'
                      aria-checked={settings.smooth}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full border border-slate-200/70 transition dark:border-white/10 ${
                        settings.smooth
                          ? 'bg-cyan-500/25 dark:bg-cyan-400/30'
                          : 'bg-slate-300/70 dark:bg-white/15'
                      }`}
                      onClick={() =>
                        onUpdateSettings({ smooth: !settings.smooth })
                      }
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                          settings.smooth ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <div className='flex items-center justify-between rounded-xl border border-slate-200/70 bg-slate-100/70 px-4 py-3 dark:border-white/10 dark:bg-white/5'>
                    <LabelWithHelp
                      label='Auto max iterations'
                      tooltip='Increase max iterations as you zoom in (log2 scale).'
                      variant='body'
                    />
                    <button
                      type='button'
                      role='switch'
                      aria-checked={settings.autoMaxIterations}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full border border-slate-200/70 transition dark:border-white/10 ${
                        settings.autoMaxIterations
                          ? 'bg-cyan-500/25 dark:bg-cyan-400/30'
                          : 'bg-slate-300/70 dark:bg-white/15'
                      }`}
                      onClick={() =>
                        onUpdateSettings({
                          autoMaxIterations: !settings.autoMaxIterations,
                        })
                      }
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                          settings.autoMaxIterations
                            ? 'translate-x-5'
                            : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {settings.autoMaxIterations && (
                  <div className='space-y-2'>
                    <LabelWithHelp
                      label='Auto iteration scale'
                      tooltip='Extra iterations added per zoom octave. Higher values sharpen deep zooms.'
                    />
                    <input
                      type='range'
                      min={0}
                      max={512}
                      step={16}
                      value={autoIterationsScaleDraft}
                      className='w-full accent-cyan-400 dark:accent-cyan-300'
                      onChange={(event) => {
                        const nextValue = Math.max(
                          0,
                          Math.round(Number(event.target.value)),
                        );
                        setAutoIterationsScaleDraft(nextValue);
                        onUpdateSettings({ autoIterationsScale: nextValue });
                      }}
                    />
                  </div>
                )}
              </Section>

              <Section title='Advanced'>
                <div className='space-y-2'>
                  <LabelWithHelp
                    label='Tile size'
                    tooltip='Size of render tiles in pixels. Smaller tiles update more granularly but add overhead.'
                  />
                  <input
                    type='range'
                    min={32}
                    max={512}
                    step={32}
                    value={tileSizeDraft}
                    className='w-full accent-cyan-400 dark:accent-cyan-300'
                    onChange={(event) => {
                      const nextValue = Math.max(
                        32,
                        Math.round(Number(event.target.value)),
                      );
                      setTileSizeDraft(nextValue);
                      onUpdateSettings({ tileSize: nextValue });
                    }}
                  />
                </div>

                <div className='space-y-2'>
                  <LabelWithHelp
                    label='Worker count'
                    tooltip='Number of render workers. Higher counts use more CPU.'
                  />
                  <input
                    type='range'
                    min={1}
                    max={workerMax}
                    step={1}
                    value={workerCountDraft}
                    className='w-full accent-cyan-400 dark:accent-cyan-300'
                    onChange={(event) => {
                      const nextValue = Math.max(
                        1,
                        Math.round(Number(event.target.value)),
                      );
                      setWorkerCountDraft(nextValue);
                      onUpdateSettings({ workerCount: nextValue });
                    }}
                  />
                  <div className='flex justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-white/40'>
                    <span>1</span>
                    <span>{workerMax}</span>
                  </div>
                </div>

                <div className='space-y-2'>
                  <LabelWithHelp
                    label='Refinement speed'
                    tooltip='Number of progressive passes from coarse to fine.'
                  />
                  <input
                    type='range'
                    min={0}
                    max={refinementOptions.length - 1}
                    step={1}
                    value={refinementPreset}
                    className='w-full accent-cyan-400 dark:accent-cyan-300'
                    onChange={(event) => {
                      const index = Math.round(Number(event.target.value));
                      const preset = refinementOptions[index];
                      if (!preset) {
                        return;
                      }
                      setRefinementPreset(index);
                      onUpdateSettings({ refinementStepsCount: preset.steps });
                    }}
                  />
                  <div className='flex justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-white/40'>
                    <span>Slow</span>
                    <span>Fast</span>
                  </div>
                </div>

                <div className='space-y-2'>
                  <LabelWithHelp
                    label='Final quality'
                    tooltip='Smallest block size used for the final pass.'
                  />
                  <input
                    type='range'
                    min={0}
                    max={finalQualityOptions.length - 1}
                    step={1}
                    value={finalQualityPreset}
                    className='w-full accent-cyan-400 dark:accent-cyan-300'
                    onChange={(event) => {
                      const index = Math.round(Number(event.target.value));
                      const option = finalQualityOptions[index];
                      if (!option) {
                        return;
                      }
                      setFinalQualityPreset(index);
                      onUpdateSettings({ finalBlockSize: option.value });
                    }}
                  />
                  <div className='flex justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-white/40'>
                    <span>Large</span>
                    <span>Best</span>
                  </div>
                </div>
              </Section>

              <Section title='Interface'>
                <div className='space-y-3'>
                  <div className='flex items-center justify-between rounded-xl border border-slate-200/70 bg-slate-100/70 px-4 py-3 dark:border-white/10 dark:bg-white/5'>
                    <LabelWithHelp
                      label='Dark mode'
                      tooltip='Use the dark colour scheme for the interface.'
                      variant='body'
                    />
                    <button
                      type='button'
                      role='switch'
                      aria-checked={theme === 'dark'}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full border border-slate-200/70 transition dark:border-white/10 ${
                        theme === 'dark'
                          ? 'bg-cyan-500/25 dark:bg-cyan-400/30'
                          : 'bg-slate-300/70 dark:bg-white/15'
                      }`}
                      onClick={onToggleTheme}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                          theme === 'dark' ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <div className='flex items-center justify-between rounded-xl border border-slate-200/70 bg-slate-100/70 px-4 py-3 dark:border-white/10 dark:bg-white/5'>
                    <LabelWithHelp
                      label='Auto update URL'
                      tooltip='Keep the URL in sync with your current position and zoom.'
                      variant='body'
                    />
                    <button
                      type='button'
                      role='switch'
                      aria-checked={settings.autoUpdateUrl}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full border border-slate-200/70 transition dark:border-white/10 ${
                        settings.autoUpdateUrl
                          ? 'bg-cyan-500/25 dark:bg-cyan-400/30'
                          : 'bg-slate-300/70 dark:bg-white/15'
                      }`}
                      onClick={() =>
                        onUpdateSettings({
                          autoUpdateUrl: !settings.autoUpdateUrl,
                        })
                      }
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                          settings.autoUpdateUrl
                            ? 'translate-x-5'
                            : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </Section>
            </div>
          </div>
        </aside>
      )}

      {paletteModalOpen && (
        <div className='fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm'>
          <div className='w-full max-w-5xl rounded-2xl border border-slate-200/70 bg-white/95 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.2)] dark:border-white/10 dark:bg-slate-900/90 dark:shadow-[0_20px_60px_rgba(0,0,0,0.6)]'>
            <div className='flex items-center justify-between'>
              <div>
                <div className='text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-white/50'>
                  Palette editor
                </div>
                <div className='text-lg font-semibold text-slate-900 dark:text-white'>
                  Colour stops
                </div>
              </div>
            </div>

            <div className='mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]'>
              <div className='space-y-4'>
                <div
                  className='relative h-10 w-full cursor-crosshair overflow-hidden rounded-full border border-slate-200/70 bg-slate-200 dark:border-white/10 dark:bg-white/5'
                  style={{ backgroundImage: paletteGradient }}
                  ref={paletteBarRef}
                  onClick={handlePaletteBarClick}
                >
                  {sortedStops.map((stop) => (
                    <div
                      key={`${stop.colour}-${stop.index}`}
                      className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border border-white shadow-[0_4px_12px_rgba(15,23,42,0.25)] ${
                        selectedStopIndex === stop.index
                          ? 'ring-2 ring-cyan-400/80'
                          : ''
                      }`}
                      style={{
                        left: `${stop.position * 100}%`,
                        backgroundColor: stop.colour,
                        transform: 'translate(-50%, -50%)',
                      }}
                      role='button'
                      tabIndex={0}
                      aria-label='Drag palette stop'
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedStopIndex(stop.index);
                        palettePendingRef.current = {
                          index: stop.index,
                          startX: event.clientX,
                        };
                      }}
                      onClick={(event) => event.stopPropagation()}
                    />
                  ))}
                </div>

                <div className='text-[11px] text-slate-500 dark:text-white/50'>
                  Click the bar to add a stop. Drag the dots to reposition.
                </div>

                <div className='rounded-xl border border-slate-200/70 bg-white/60 px-4 py-4 dark:border-white/10 dark:bg-white/5'>
                  <div className='text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-white/60'>
                    Selected stop
                  </div>
                  {selectedStop ? (
                    <div className='mt-4 space-y-4'>
                      <HexColorPicker
                        color={selectedStop.colour}
                        onChange={(value) =>
                          handlePaletteStopChange(selectedStopIndex ?? 0, {
                            colour: value,
                          })
                        }
                      />
                      <div className='flex items-center gap-3'>
                        <label className='text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-white/50'>
                          Position
                        </label>
                        <input
                          type='number'
                          min={0}
                          max={1}
                          step={0.01}
                          value={selectedStop.position}
                          className='w-24 rounded-lg border border-slate-200/70 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/50 dark:border-white/10 dark:bg-white/5 dark:text-white/80'
                          onChange={(event) =>
                            handlePaletteStopChange(selectedStopIndex ?? 0, {
                              position: Math.min(
                                1,
                                Math.max(0, Number(event.target.value)),
                              ),
                            })
                          }
                        />
                        <button
                          type='button'
                          className='text-xs text-slate-500 transition hover:text-slate-900 disabled:opacity-40 dark:text-white/40 dark:hover:text-white'
                          onClick={() =>
                            selectedStopIndex !== null
                              ? handleRemoveStop(selectedStopIndex)
                              : null
                          }
                          disabled={paletteStopsDraft.length <= 2}
                        >
                          Remove stop
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className='mt-3 text-[11px] text-slate-500 dark:text-white/50'>
                      Select a stop to edit.
                    </div>
                  )}
                </div>

                <div className='flex flex-wrap gap-2'>
                  <button
                    type='button'
                    className='rounded-lg border border-slate-200/70 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10'
                    onClick={handleAddStop}
                  >
                    + Stop
                  </button>
                  <button
                    type='button'
                    className='rounded-lg border border-slate-200/70 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10'
                    onClick={handleResetPalette}
                  >
                    Reset
                  </button>
                </div>

                <div className='space-y-2'>
                  <LabelWithHelp
                    label='Palette JSON'
                    tooltip='Edit the JSON to load a palette, or copy it to export.'
                  />
                  <textarea
                    className='w-full resize-y rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-[11px] text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/50 dark:border-white/10 dark:bg-white/5 dark:text-white/80'
                    rows={6}
                    value={paletteJson}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setPaletteJson(nextValue);
                      parsePaletteJson(nextValue);
                    }}
                    placeholder='[{"position":0,"colour":"#000764"}, ...]'
                  />
                  {paletteError && (
                    <div className='text-[11px] text-amber-600 dark:text-amber-200'>
                      {paletteError}
                    </div>
                  )}
                </div>
                <div className='flex flex-wrap justify-end gap-2 border-t border-slate-200/70 pt-4 dark:border-white/10'>
                  <button
                    type='button'
                    className='rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10'
                    onClick={closePaletteModal}
                  >
                    Cancel
                  </button>
                  <button
                    type='button'
                    className='rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-700 shadow-sm transition hover:bg-cyan-500/20 disabled:opacity-50 dark:border-cyan-300/40 dark:bg-cyan-300/10 dark:text-cyan-200'
                    onClick={applyPaletteStops}
                    disabled={!paletteDirty}
                  >
                    Apply
                  </button>
                </div>
              </div>

              <div className='space-y-2'>
                <div className='text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-white/50'>
                  Preview
                </div>
                <div className='overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-100 dark:border-white/10 dark:bg-white/5'>
                  <div className='relative w-full pb-[100%]'>
                    <canvas
                      ref={previewCanvasRef}
                      className='absolute inset-0 h-full w-full object-cover'
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SideDrawer;
