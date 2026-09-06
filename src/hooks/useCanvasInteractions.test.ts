import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FractalCanvas from '../components/FractalCanvas';
import { navigationFromView } from '../engine/viewport';
import { defaultSettings } from '../state/settings';

vi.mock('./useFractalRenderer', () => ({
  useFractalRenderer: () => ({
    useGpuCanvas: false,
    isRendering: false,
    finalRenderMs: null,
    renderError: null,
    renderedMaxIterations: 256,
    renderModeLabel: 'cpu',
    precisionWarning: false,
    shiftCpu: vi.fn(),
  }),
}));
vi.mock('../components/InfoPanel', () => ({ default: () => null }));

const trees: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => trees.splice(0).forEach((tree) => tree.unmount()));
  vi.unstubAllGlobals();
});

describe('covered canvas interaction', () => {
  it('makes the whole canvas inert, blocks keyboard/pointer/wheel input and restores interaction on close', () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('document', { activeElement: null });
    const container = { inert: false, focus: vi.fn() };
    const canvases: EventTarget[] = [];
    const setNavigation = vi.fn();
    const props = {
      width: 32,
      height: 32,
      algorithm: 'mandelbrot' as const,
      navigation: navigationFromView({ x: -0.5, y: 0, z: 1 }),
      setNavigation,
      settings: { ...defaultSettings, showMinimap: false },
      interactionMode: 'grab' as const,
    };
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        createElement(FractalCanvas, { ...props, uiOverlayOpen: false }),
        {
          createNodeMock: (node) => {
            if (node.props.role === 'region') return container;
            if (node.type === 'canvas') {
              const canvas = Object.assign(new EventTarget(), {
                style: {},
                hasPointerCapture: () => false,
                setPointerCapture: vi.fn(),
                releasePointerCapture: vi.fn(),
              });
              canvases.push(canvas);
              return canvas;
            }
            return null;
          },
        },
      );
      trees.push(tree);
    });
    const key = () => ({
      key: 'ArrowRight',
      preventDefault: vi.fn(),
      shiftKey: false,
    });
    const canvasProps = () =>
      tree!.root.findByProps({ 'aria-label': 'Fractal canvas' }).props;
    expect(container.inert).toBe(false);
    act(() => canvasProps().onKeyDown(key()));
    expect(setNavigation).toHaveBeenCalledOnce();
    setNavigation.mockClear();
    act(() =>
      tree.update(
        createElement(FractalCanvas, { ...props, uiOverlayOpen: true }),
      ),
    );
    expect(container.inert).toBe(true);
    expect(canvasProps().tabIndex).toBe(-1);
    act(() => {
      canvasProps().onKeyDown(key());
      canvases[0].dispatchEvent(
        Object.assign(new Event('pointerdown', { cancelable: true }), {
          button: 0,
          pointerId: 1,
          clientX: 0,
          clientY: 0,
        }),
      );
      canvases[0].dispatchEvent(
        Object.assign(new Event('click'), {
          offsetX: 16,
          offsetY: 16,
          ctrlKey: false,
        }),
      );
      canvases[0].dispatchEvent(
        Object.assign(new Event('wheel', { cancelable: true }), {
          offsetX: 16,
          offsetY: 16,
          deltaY: -1,
        }),
      );
    });
    expect(setNavigation).not.toHaveBeenCalled();
    expect(container.focus).not.toHaveBeenCalled();
    act(() =>
      tree.update(
        createElement(FractalCanvas, { ...props, uiOverlayOpen: false }),
      ),
    );
    expect(container.inert).toBe(false);
    expect(canvasProps().tabIndex).toBe(0);
    act(() => canvasProps().onKeyDown(key()));
    expect(setNavigation).toHaveBeenCalledOnce();
  });
});
