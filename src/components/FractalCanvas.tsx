import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PaletteGenerator from '../util/PaletteGenerator';
import InfoPanel from './InfoPanel';
import { START, type WorkerResponseMessage, type WorkerStartMessage } from '../workers/WorkerCommands';

type Navigation = {
  x: number;
  y: number;
  z: number;
};

type FractalCanvasProps = {
  width: number;
  height: number;
  loc?: string;
  tileSize?: number;
};

type RenderConfig = {
  renderId: number;
  max: number;
  pscale: number;
  palette: number[][];
  smooth: boolean;
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

const MAX_ITERATIONS = 256;
const BLOCK_STEPS = [256, 64, 16, 4, 1];
const WORKER_COUNT = 8;
const BASE_NUMBER_RANGE = 1;
const DEFAULT_TILE_SIZE = 256;

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

const parseNavFromLoc = (loc?: string): Navigation => {
  const defaults = { x: -0.5, y: 0, z: 1 };
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

const FractalCanvas = ({ width, height, loc, tileSize }: FractalCanvasProps) => {
  const [nav, setNav] = useState<Navigation>(() => parseNavFromLoc(loc));
  const [taskCount, setTaskCount] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const workersRef = useRef<Worker[]>([]);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderConfigRef = useRef<RenderConfig | null>(null);
  const renderIdRef = useRef(0);
  const workerIndexRef = useRef(0);
  const navRef = useRef(nav);
  const boundsRef = useRef({ x0: 0, y0: 0, xScale: 0, yScale: 0 });
  const tileMapRef = useRef<Map<number, Tile>>(new Map());
  const nextTileIdRef = useRef(1);
  const pendingTasksRef = useRef(0);
  const pendingByTaskRef = useRef<Map<string, number>>(new Map());
  const panShiftRef = useRef<{ dx: number; dy: number } | null>(null);
  const resetTilesRef = useRef(true);
  const tileSizeRef = useRef(tileSize ?? DEFAULT_TILE_SIZE);
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

  const palette = useMemo(() => PaletteGenerator(Math.max(MAX_ITERATIONS, 1000)), []);

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
    boundsRef.current = { x0, y0, xScale, yScale };
  }, [x0, y0, xScale, yScale]);

  useEffect(() => {
    if (canvasRef.current) {
      contextRef.current = canvasRef.current.getContext('2d');
    }
  }, []);

  useEffect(() => {
    setNav(parseNavFromLoc(loc));
    resetTilesRef.current = true;
  }, [loc]);

  useEffect(() => {
    resetTilesRef.current = true;
  }, [width, height]);

  const scheduleTileStep = useCallback((tile: Tile, renderId: number) => {
    const config = renderConfigRef.current;
    if (!config || config.renderId !== renderId) {
      return;
    }
    if (tile.inFlight || tile.stepIndex >= BLOCK_STEPS.length) {
      return;
    }

    const blockSize = BLOCK_STEPS[tile.stepIndex] ?? 1;
    const rows = Math.ceil(tile.height / blockSize);
    const taskKey = `${tile.id}:${tile.stepIndex}`;

    pendingByTaskRef.current.set(taskKey, rows);
    pendingTasksRef.current += rows;
    setTaskCount(pendingTasksRef.current);

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
        max: MAX_ITERATIONS,
        smooth: true,
      };
      workersRef.current[workerIndex % workersRef.current.length].postMessage(message);
      workerIndex += 1;
    }
    workerIndexRef.current = workerIndex;
  }, []);

  const scheduleAllTiles = useCallback((renderId: number) => {
    tileMapRef.current.forEach((tile) => {
      if (!tile.inFlight && tile.stepIndex < BLOCK_STEPS.length) {
        scheduleTileStep(tile, renderId);
      }
    });
  }, [scheduleTileStep]);

  const handleWorkerMessage = useCallback(
    (data: WorkerResponseMessage) => {
      const config = renderConfigRef.current;
      const ctx = contextRef.current;
      if (!config || !ctx || data.renderId !== config.renderId) {
        return;
      }

      const { max, palette: activePalette, pscale, smooth } = config;
      let index = 0;
      for (let py = 0; py < data.height; py += data.blockSize) {
        for (let px = 0; px < data.width; px += data.blockSize) {
          const iterationValue = data.values[index++];
          let rgb: number[];

          if (smooth) {
            const rgb1 =
              iterationValue < max - 1
                ? activePalette[Math.floor(pscale * iterationValue)]
                : [0, 0, 0];
            const rgb2 =
              iterationValue < max - 1
                ? activePalette[Math.floor(pscale * (iterationValue + 1))]
                : [0, 0, 0];
            rgb = lerpRgb(rgb1, rgb2, iterationValue % 1);
          } else {
            rgb =
              iterationValue < max
                ? activePalette[Math.floor(pscale * iterationValue)]
                : [0, 0, 0];
          }

          ctx.fillStyle = `rgb(${Math.floor(rgb[0])},${Math.floor(rgb[1])},${Math.floor(rgb[2])})`;
          const drawWidth = Math.min(data.blockSize, data.width - px);
          const drawHeight = Math.min(data.blockSize, data.height - py);
          ctx.fillRect(data.px + px, data.py + py, drawWidth, drawHeight);
        }
      }

      const taskKey = `${data.tileId}:${data.stepIndex}`;
      const remainingForTask = (pendingByTaskRef.current.get(taskKey) ?? 0) - 1;
      if (remainingForTask <= 0) {
        pendingByTaskRef.current.delete(taskKey);
        const tile = tileMapRef.current.get(data.tileId);
        if (tile && tile.stepIndex === data.stepIndex) {
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

      const remainingTotal = Math.max(pendingTasksRef.current - 1, 0);
      pendingTasksRef.current = remainingTotal;
      setTaskCount(remainingTotal);
    },
    [scheduleTileStep]
  );

  useEffect(() => {
    const workers: Worker[] = [];
    for (let index = 0; index < WORKER_COUNT; index += 1) {
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

    return () => {
      workers.forEach((worker) => worker.terminate());
    };
  }, [handleWorkerMessage]);

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
    };

    const handlePointerUp = (event: PointerEvent) => {
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
      setNav({
        x: drag.startNav.x - dx * drag.startScale.xScale,
        y: drag.startNav.y - dy * drag.startScale.yScale,
        z: drag.startNav.z,
      });
    };

    const handlePointerCancel = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag.active || drag.pointerId !== event.pointerId) {
        return;
      }

      canvas.style.transform = 'translate(0px, 0px)';
      canvas.style.cursor = 'grab';
      canvas.releasePointerCapture(event.pointerId);
      dragStateRef.current = { ...drag, active: false, pointerId: null };
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

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('wheel', handleWheel);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerCancel);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useEffect(() => {
    const ctx = contextRef.current;
    const workers = workersRef.current;

    if (!ctx || workers.length === 0 || width <= 0 || height <= 0) {
      return;
    }

    const resolvedTileSize = Math.max(32, tileSize ?? DEFAULT_TILE_SIZE);
    if (tileSizeRef.current !== resolvedTileSize) {
      tileSizeRef.current = resolvedTileSize;
      resetTilesRef.current = true;
    }

    const panShift = panShiftRef.current;
    panShiftRef.current = null;

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

    const smooth = true;
    const pscale = (palette.length - 1) / MAX_ITERATIONS;
    renderConfigRef.current = {
      renderId,
      max: MAX_ITERATIONS,
      pscale,
      palette,
      smooth,
    };

    pendingByTaskRef.current.clear();
    pendingTasksRef.current = 0;
    setTaskCount(0);
    tileMapRef.current.forEach((tile) => {
      tile.inFlight = false;
    });

    scheduleAllTiles(renderId);
  }, [height, palette, scheduleAllTiles, tileSize, width, x0, xScale, y0, yScale]);

  return (
    <div>
      <canvas ref={canvasRef} width={width} height={height} />
      <InfoPanel nav={nav} tasks={taskCount} />
    </div>
  );
};

export default FractalCanvas;
