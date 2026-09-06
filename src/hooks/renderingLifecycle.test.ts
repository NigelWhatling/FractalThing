import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CpuRendererOptions } from '../engine/cpu/types';
import type {
  WebGLRendererOptions,
  WebGLRendererCapabilities,
} from '../engine/gpu/types';
import { defaultSettings } from '../state/settings';
import { navigationFromView } from '../engine/viewport';
import {
  useFractalRenderer,
  type FractalRendererResult,
} from './useFractalRenderer';
import PalettePreview from '../components/drawer/PalettePreview';

type Controller = {
  render: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  options: WebGLRendererOptions;
};
type WorkerStub = {
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  onmessage: ((event: { data: unknown }) => void) | null;
};
const mocks = vi.hoisted(() => ({
  gpu: [] as Controller[],
  cpu: [] as Controller[],
  workers: [] as WorkerStub[],
  available: true,
}));
const capabilities = (available: boolean): WebGLRendererCapabilities => ({
  available,
  contextLost: !available,
  webglVersion: 2,
  fragmentPrecision: 'highp',
  supportsSinglePrecision: true,
  supportsDoubleDoublePrecision: true,
  compiledLimbProfiles: [],
  supportsTimerQuery: false,
  maxIterations: 4096,
  unsupportedColourModes: ['distribution'],
  failureReason: available ? null : 'WebGL2 unavailable',
});

vi.mock('../engine/gpu', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../engine/gpu')>()),
  WebGLRenderer: class {
    render = vi.fn();
    dispose = vi.fn();
    resize = vi.fn();
    cancel = vi.fn();
    constructor(
      _canvas: unknown,
      public options: WebGLRendererOptions,
    ) {
      mocks.gpu.push(this);
      options.onCapabilitiesChange?.(capabilities(mocks.available));
    }
  },
}));
vi.mock('../engine/cpu', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../engine/cpu')>()),
  CpuRenderer: class {
    render = vi.fn();
    dispose = vi.fn();
    resize = vi.fn();
    suspend = vi.fn();
    setWorkerCount = vi.fn();
    shift = vi.fn();
    options = {};
    constructor(_canvas: unknown, _options: CpuRendererOptions) {
      mocks.cpu.push(this);
    }
  },
}));

const trees: ReactTestRenderer[] = [];
const navigation = navigationFromView({ x: -0.5, y: 0, z: 1 });
const cpuCanvasRef = { current: {} as HTMLCanvasElement };
const gpuCanvasRef = { current: {} as HTMLCanvasElement };
const palette = [
  [0, 0, 0],
  [255, 255, 255],
];
let result: FractalRendererResult;
const Harness = ({
  backend,
  gpuPrecision = 'single',
}: {
  backend: 'cpu' | 'gpu';
  gpuPrecision?: 'single' | 'double' | 'limb';
}) => {
  const snapshot = useFractalRenderer({
    cpuCanvasRef,
    gpuCanvasRef,
    width: 32,
    height: 32,
    settings: { ...defaultSettings, renderBackend: backend, gpuPrecision },
    algorithm: 'mandelbrot',
    navigation,
    palette,
    effectiveMaxIterations: 256,
  });
  useEffect(() => {
    result = snapshot;
  }, [snapshot]);
  return null;
};

beforeEach(() => {
  mocks.cpu.length = 0;
  mocks.gpu.length = 0;
  mocks.workers.length = 0;
  mocks.available = true;
  vi.stubGlobal(
    'Worker',
    class {
      onmessage = null;
      postMessage = vi.fn();
      terminate = vi.fn();
      constructor() {
        mocks.workers.push(this);
      }
    },
  );
});
afterEach(() => {
  act(() => trees.splice(0).forEach((tree) => tree.unmount()));
  vi.unstubAllGlobals();
});

describe('renderer lifecycles', () => {
  it('does not create GPU resources for CPU rendering or replace the CPU controller on backend switches', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(createElement(Harness, { backend: 'cpu' }));
      trees.push(tree);
    });
    expect(mocks.gpu).toHaveLength(0);
    expect(mocks.cpu).toHaveLength(1);
    act(() => tree.update(createElement(Harness, { backend: 'gpu' })));
    expect(mocks.gpu).toHaveLength(1);
    expect(mocks.gpu[0].render).toHaveBeenCalled();
    expect(result.useGpuCanvas).toBe(true);
    act(() => tree.update(createElement(Harness, { backend: 'cpu' })));
    expect(mocks.gpu[0].dispose).toHaveBeenCalledOnce();
    expect(mocks.cpu).toHaveLength(1);
    expect(result.useGpuCanvas).toBe(false);
  });

  it('renders on CPU when GPU initialisation fails', () => {
    mocks.available = false;
    act(() => {
      trees.push(create(createElement(Harness, { backend: 'gpu' })));
    });
    expect(result.useGpuCanvas).toBe(false);
    expect(result.renderError).toBe('WebGL2 unavailable');
    expect(mocks.cpu[0].render).toHaveBeenCalled();
  });

  it('resumes GPU rendering after a lost context is restored', async () => {
    act(() => {
      trees.push(create(createElement(Harness, { backend: 'gpu' })));
    });
    act(() => mocks.gpu[0].options.onCapabilitiesChange?.(capabilities(false)));
    expect(result.useGpuCanvas).toBe(false);
    const renders = mocks.gpu[0].render.mock.calls.length;
    await act(async () => {
      mocks.gpu[0].options.onCapabilitiesChange?.(capabilities(true));
    });
    expect(result.useGpuCanvas).toBe(true);
    expect(mocks.gpu[0].render.mock.calls.length).toBeGreaterThan(renders);
  });

  it('waits for a limb compilation attempt before reporting profile failure', () => {
    act(() => {
      trees.push(
        create(
          createElement(Harness, {
            backend: 'gpu',
            gpuPrecision: 'limb',
          }),
        ),
      );
    });
    expect(mocks.gpu[0].render).toHaveBeenCalledWith(
      expect.objectContaining({
        precision: 'limb',
        limbProfile: defaultSettings.gpuLimbProfile,
      }),
    );
    expect(result.renderError).toBeNull();

    act(() =>
      mocks.gpu[0].options.onStateChange?.({
        renderId: 1,
        status: 'error',
        passIndex: 0,
        passCount: 0,
        iterationCap: null,
        message: 'GPU limb profile balanced is unavailable',
      }),
    );
    expect(result.renderError).toBe('GPU limb profile balanced is unavailable');
  });

  it('keeps a CPU palette preview visible while GPU is unavailable and recovers on restoration', async () => {
    mocks.available = false;
    const context = {
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: vi.fn(),
    };
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        createElement(PalettePreview, {
          algorithm: 'mandelbrot',
          navigation,
          paletteStops: defaultSettings.paletteStops,
          settings: { ...defaultSettings, renderBackend: 'gpu' },
        }),
        {
          createNodeMock: (node) =>
            node.type === 'canvas' ? { getContext: () => context } : null,
        },
      );
      trees.push(tree);
    });
    expect(mocks.gpu).toHaveLength(1);
    expect(mocks.workers).toHaveLength(1);
    const job = mocks.workers[0].postMessage.mock.calls[0][0];
    act(() =>
      mocks.workers[0].onmessage?.({
        data: { ...job, values: new Float64Array(320 * 320).fill(job.max) },
      }),
    );
    expect(context.putImageData).toHaveBeenCalled();
    expect(tree!.root.findAllByType('canvas')[0].props.className).not.toContain(
      'hidden',
    );
    expect(tree!.root.findAllByType('canvas')[1].props.className).toContain(
      'hidden',
    );
    await act(async () => {
      mocks.gpu[0].options.onCapabilitiesChange?.(capabilities(true));
    });
    expect(mocks.gpu[0].render).toHaveBeenCalled();
    expect(tree!.root.findAllByType('canvas')[1].props.className).not.toContain(
      'hidden',
    );
  });
});
