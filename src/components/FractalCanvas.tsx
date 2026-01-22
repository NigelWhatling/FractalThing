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
};

type RenderConfig = {
  renderId: number;
  blockSize: number;
  max: number;
  pscale: number;
  palette: number[][];
  smooth: boolean;
};

const MAX_ITERATIONS = 256;
const BLOCK_STEPS = [256, 64, 16, 4, 1];
const WORKER_COUNT = 8;
const BASE_NUMBER_RANGE = 1;

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

const FractalCanvas = ({ width, height, loc }: FractalCanvasProps) => {
  const [nav, setNav] = useState<Navigation>(() => parseNavFromLoc(loc));
  const [stepIndex, setStepIndex] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const pendingTasksRef = useRef(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const workersRef = useRef<Worker[]>([]);
  const renderConfigRef = useRef<RenderConfig | null>(null);
  const renderIdRef = useRef(0);
  const navRef = useRef(nav);

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

  const boundsRef = useRef({ x0, y0, xScale, yScale });

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
    setStepIndex(0);
  }, [loc]);

  useEffect(() => {
    setStepIndex(0);
  }, [width, height]);

  const handleWorkerMessage = useCallback((data: WorkerResponseMessage) => {
    const config = renderConfigRef.current;
    const ctx = contextRef.current;
    if (!config || !ctx || data.renderId !== config.renderId) {
      return;
    }

    const { blockSize, max, palette: activePalette, pscale, smooth } = config;
    let index = 0;
    for (let py = 0; py < data.height; py += blockSize) {
      for (let px = 0; px < data.width; px += blockSize) {
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
        ctx.fillRect(data.px + px, data.py + py, blockSize, blockSize);
      }
    }

    const remaining = Math.max(pendingTasksRef.current - 1, 0);
    pendingTasksRef.current = remaining;
    setTaskCount(remaining);
    if (remaining === 0) {
      setStepIndex((previous) =>
        previous < BLOCK_STEPS.length - 1 ? previous + 1 : previous
      );
    }
  }, []);

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

    const handleClick = (event: MouseEvent) => {
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
      setStepIndex(0);
    };

    const handleWheel = (event: WheelEvent) => {
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
      setStepIndex(0);
    };

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('wheel', handleWheel);

    return () => {
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

    const blockSize = BLOCK_STEPS[stepIndex] ?? 1;
    const renderId = renderIdRef.current + 1;
    renderIdRef.current = renderId;

    const smooth = true;
    const pscale = (palette.length - 1) / MAX_ITERATIONS;
    renderConfigRef.current = {
      renderId,
      blockSize,
      max: MAX_ITERATIONS,
      pscale,
      palette,
      smooth,
    };

    const tasks = Math.ceil(height / blockSize);
    pendingTasksRef.current = tasks;
    setTaskCount(tasks);

    let workerIndex = 0;
    for (let py = 0; py < height; py += blockSize) {
      const message: WorkerStartMessage = {
        cmd: START,
        renderId,
        px: 0,
        py,
        x0,
        y0,
        xScale,
        yScale,
        width,
        height: 1,
        blockSize,
        max: MAX_ITERATIONS,
        smooth,
      };
      workers[workerIndex % workers.length].postMessage(message);
      workerIndex += 1;
    }

  }, [height, palette, stepIndex, width, x0, xScale, y0, yScale]);

  return (
    <div>
      <canvas ref={canvasRef} width={width} height={height} />
      <InfoPanel nav={nav} tasks={taskCount} />
    </div>
  );
};

export default FractalCanvas;
