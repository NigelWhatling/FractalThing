import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { InteractionMode } from '../components/InteractionModeToggle';
import {
  computeViewportGeometry,
  translateNavigation,
  type Navigation,
} from '../engine/viewport';

export type SelectionRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

type UseCanvasInteractionsOptions = Readonly<{
  cpuCanvasRef: RefObject<HTMLCanvasElement | null>;
  gpuCanvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  navigation: Navigation;
  setNavigation: Dispatch<SetStateAction<Navigation>>;
  interactionMode: InteractionMode;
  useGpuCanvas: boolean;
  uiOverlayOpen: boolean;
  resetSignal: number;
  shiftCpu: (dx: number, dy: number) => void;
}>;

type DragState = {
  active: boolean;
  pointerId: number | null;
  startClientX: number;
  startClientY: number;
  startNavigation: Navigation;
  xScale: number;
  yScale: number;
  moved: boolean;
};

type SelectionState = {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const multiplyZoom = (zoom: number, factor: number): number =>
  Math.min(Number.MAX_VALUE, zoom * factor);

const emptySelection = (): SelectionState => ({
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
});

export const useCanvasInteractions = ({
  cpuCanvasRef,
  gpuCanvasRef,
  containerRef,
  width,
  height,
  navigation,
  setNavigation,
  interactionMode,
  useGpuCanvas,
  uiOverlayOpen,
  resetSignal,
  shiftCpu,
}: UseCanvasInteractionsOptions) => {
  const [displayNavigation, setDisplayNavigation] = useState(navigation);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(
    null,
  );
  const navigationRef = useRef(navigation);
  const interactionModeRef = useRef(interactionMode);
  const overlayOpenRef = useRef(uiOverlayOpen);
  const displayRafRef = useRef<number | null>(null);
  const selectionRafRef = useRef<number | null>(null);
  const pendingDisplayRef = useRef<Navigation | null>(null);
  const pendingSelectionRef = useRef<SelectionRect | null>(null);
  const suppressClickRef = useRef(false);
  const selectionRef = useRef<SelectionState>(emptySelection());
  const dragRef = useRef<DragState>({
    active: false,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startNavigation: navigation,
    xScale: 0,
    yScale: 0,
    moved: false,
  });

  useEffect(() => {
    navigationRef.current = navigation;
  }, [navigation]);

  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);

  useEffect(() => {
    overlayOpenRef.current = uiOverlayOpen;
  }, [uiOverlayOpen]);

  const cancelQueuedDisplayNavigation = useCallback(() => {
    if (displayRafRef.current !== null) {
      globalThis.cancelAnimationFrame(displayRafRef.current);
      displayRafRef.current = null;
    }
    pendingDisplayRef.current = null;
  }, []);

  const commitNavigation = useCallback(
    (nextNavigation: Navigation) => {
      cancelQueuedDisplayNavigation();
      navigationRef.current = nextNavigation;
      setDisplayNavigation(nextNavigation);
      setNavigation(nextNavigation);
    },
    [cancelQueuedDisplayNavigation, setNavigation],
  );

  const queueDisplayNavigation = useCallback((nextNavigation: Navigation) => {
    pendingDisplayRef.current = nextNavigation;
    if (displayRafRef.current !== null) {
      return;
    }
    displayRafRef.current = globalThis.requestAnimationFrame(() => {
      displayRafRef.current = null;
      if (pendingDisplayRef.current) {
        setDisplayNavigation(pendingDisplayRef.current);
      }
    });
  }, []);

  const queueSelectionRect = useCallback((nextRect: SelectionRect | null) => {
    pendingSelectionRef.current = nextRect;
    if (selectionRafRef.current !== null) {
      return;
    }
    selectionRafRef.current = globalThis.requestAnimationFrame(() => {
      selectionRafRef.current = null;
      setSelectionRect(pendingSelectionRef.current);
    });
  }, []);

  const computeSelectionRect = useCallback(
    (
      startX: number,
      startY: number,
      currentX: number,
      currentY: number,
    ): SelectionRect => {
      const x1 = clamp(startX, 0, width);
      const y1 = clamp(startY, 0, height);
      const x2 = clamp(currentX, 0, width);
      const y2 = clamp(currentY, 0, height);
      return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      };
    },
    [height, width],
  );

  useEffect(() => {
    if (!dragRef.current.active) {
      cancelQueuedDisplayNavigation();
      setDisplayNavigation(navigation);
    }
  }, [cancelQueuedDisplayNavigation, navigation]);

  useEffect(() => {
    const cursor = interactionMode === 'grab' ? 'grab' : 'crosshair';
    const capturedPointerIds = [
      selectionRef.current.pointerId,
      dragRef.current.pointerId,
    ].filter((pointerId): pointerId is number => pointerId !== null);
    for (const canvas of [cpuCanvasRef.current, gpuCanvasRef.current]) {
      if (canvas) {
        for (const pointerId of capturedPointerIds) {
          if (canvas.hasPointerCapture(pointerId)) {
            canvas.releasePointerCapture(pointerId);
          }
        }
        canvas.style.cursor = cursor;
        canvas.style.transform = 'translate(0px, 0px)';
      }
    }
    selectionRef.current = emptySelection();
    dragRef.current.active = false;
    suppressClickRef.current = false;
    cancelQueuedDisplayNavigation();
    setDisplayNavigation(navigationRef.current);
    queueSelectionRect(null);
  }, [
    cancelQueuedDisplayNavigation,
    cpuCanvasRef,
    gpuCanvasRef,
    interactionMode,
    queueSelectionRect,
    resetSignal,
  ]);

  useEffect(() => {
    const canvas = useGpuCanvas ? gpuCanvasRef.current : cpuCanvasRef.current;
    if (!canvas) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      if (!overlayOpenRef.current) {
        containerRef.current?.focus({ preventScroll: true });
      }
      canvas.setPointerCapture(event.pointerId);
      if (interactionModeRef.current === 'select') {
        selectionRef.current = {
          active: true,
          pointerId: event.pointerId,
          startX: event.offsetX,
          startY: event.offsetY,
        };
        queueSelectionRect({
          x: event.offsetX,
          y: event.offsetY,
          width: 0,
          height: 0,
        });
      } else {
        const geometry = computeViewportGeometry(
          navigationRef.current,
          width,
          height,
        );
        dragRef.current = {
          active: true,
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startNavigation: navigationRef.current,
          xScale: geometry.xScale,
          yScale: geometry.yScale,
          moved: false,
        };
        canvas.style.cursor = 'grabbing';
      }
      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (interactionModeRef.current === 'select') {
        const selection = selectionRef.current;
        if (!selection.active || selection.pointerId !== event.pointerId) {
          return;
        }
        queueSelectionRect(
          computeSelectionRect(
            selection.startX,
            selection.startY,
            event.offsetX,
            event.offsetY,
          ),
        );
        event.preventDefault();
        return;
      }

      const drag = dragRef.current;
      if (!drag.active || drag.pointerId !== event.pointerId) {
        return;
      }
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;
      drag.moved ||= Math.abs(dx) > 2 || Math.abs(dy) > 2;
      canvas.style.transform = `translate(${dx}px, ${dy}px)`;
      queueDisplayNavigation(
        translateNavigation(
          drag.startNavigation,
          -dx * drag.xScale,
          -dy * drag.yScale,
        ),
      );
      event.preventDefault();
    };

    const releaseCapture = (pointerId: number) => {
      if (canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (interactionModeRef.current === 'select') {
        const selection = selectionRef.current;
        if (!selection.active || selection.pointerId !== event.pointerId) {
          return;
        }
        selectionRef.current = emptySelection();
        releaseCapture(event.pointerId);
        const rect = computeSelectionRect(
          selection.startX,
          selection.startY,
          event.offsetX,
          event.offsetY,
        );
        queueSelectionRect(null);
        if (rect.width < 4 || rect.height < 4) {
          return;
        }
        const current = navigationRef.current;
        const geometry = computeViewportGeometry(current, width, height);
        const scale = Math.min(width / rect.width, height / rect.height);
        const centreX = rect.x + rect.width / 2;
        const centreY = rect.y + rect.height / 2;
        suppressClickRef.current = true;
        commitNavigation(
          translateNavigation(
            current,
            (centreX - width / 2) * geometry.xScale,
            (centreY - height / 2) * geometry.yScale,
            multiplyZoom(current.z, scale),
          ),
        );
        return;
      }

      const drag = dragRef.current;
      if (!drag.active || drag.pointerId !== event.pointerId) {
        return;
      }
      const rawDx = event.clientX - drag.startClientX;
      const rawDy = event.clientY - drag.startClientY;
      const dx = Math.round(rawDx);
      const dy = Math.round(rawDy);
      releaseCapture(event.pointerId);
      canvas.style.transform = 'translate(0px, 0px)';
      canvas.style.cursor = 'grab';
      dragRef.current = { ...drag, active: false, pointerId: null };
      if (!drag.moved && Math.abs(rawDx) <= 2 && Math.abs(rawDy) <= 2) {
        cancelQueuedDisplayNavigation();
        setDisplayNavigation(navigationRef.current);
        return;
      }
      if (!useGpuCanvas) {
        shiftCpu(dx, dy);
      }
      suppressClickRef.current = true;
      commitNavigation(
        translateNavigation(
          drag.startNavigation,
          -dx * drag.xScale,
          -dy * drag.yScale,
        ),
      );
    };

    const handlePointerCancel = (event: PointerEvent) => {
      releaseCapture(event.pointerId);
      selectionRef.current = emptySelection();
      dragRef.current.active = false;
      canvas.style.transform = 'translate(0px, 0px)';
      canvas.style.cursor =
        interactionModeRef.current === 'grab' ? 'grab' : 'crosshair';
      queueSelectionRect(null);
      cancelQueuedDisplayNavigation();
      setDisplayNavigation(navigationRef.current);
    };

    const zoomAt = (offsetX: number, offsetY: number, zoomIn: boolean) => {
      const current = navigationRef.current;
      const geometry = computeViewportGeometry(current, width, height);
      const nextZoom = zoomIn
        ? multiplyZoom(current.z, 2)
        : Math.max(1, current.z / 2);
      commitNavigation(
        translateNavigation(
          current,
          (offsetX - width / 2) * geometry.xScale,
          (offsetY - height / 2) * geometry.yScale,
          nextZoom,
        ),
      );
    };

    const handleClick = (event: MouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      zoomAt(event.offsetX, event.offsetY, !event.ctrlKey);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(event.offsetX, event.offsetY, event.deltaY < 0);
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
  }, [
    commitNavigation,
    cancelQueuedDisplayNavigation,
    computeSelectionRect,
    containerRef,
    cpuCanvasRef,
    gpuCanvasRef,
    height,
    queueDisplayNavigation,
    queueSelectionRect,
    shiftCpu,
    useGpuCanvas,
    width,
  ]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const current = navigationRef.current;
      const geometry = computeViewportGeometry(current, width, height);
      const panPixels = event.shiftKey ? 80 : 40;
      const nextNavigation = (() => {
        switch (event.key) {
          case 'ArrowUp':
            return translateNavigation(
              current,
              0,
              -panPixels * geometry.yScale,
            );
          case 'ArrowDown':
            return translateNavigation(current, 0, panPixels * geometry.yScale);
          case 'ArrowLeft':
            return translateNavigation(
              current,
              -panPixels * geometry.xScale,
              0,
            );
          case 'ArrowRight':
            return translateNavigation(current, panPixels * geometry.xScale, 0);
          case '+':
          case '=':
            return { ...current, z: multiplyZoom(current.z, 2) };
          case '-':
          case '_':
            return { ...current, z: Math.max(1, current.z / 2) };
          default:
            return null;
        }
      })();
      if (!nextNavigation) {
        return;
      }
      event.preventDefault();
      commitNavigation(nextNavigation);
    },
    [commitNavigation, height, width],
  );

  const requestFocus = useCallback(() => {
    if (overlayOpenRef.current) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const activeElement = document.activeElement;
    if (
      activeElement &&
      activeElement !== document.body &&
      activeElement !== document.documentElement
    ) {
      return;
    }
    container.focus({ preventScroll: true });
  }, [containerRef]);

  const handleBlur = useCallback(() => {
    if (!overlayOpenRef.current) {
      globalThis.requestAnimationFrame(requestFocus);
    }
  }, [requestFocus]);

  useEffect(() => {
    if (uiOverlayOpen) {
      return;
    }
    const frame = globalThis.requestAnimationFrame(requestFocus);
    return () => globalThis.cancelAnimationFrame(frame);
  }, [requestFocus, uiOverlayOpen]);

  useEffect(
    () => () => {
      if (displayRafRef.current !== null) {
        globalThis.cancelAnimationFrame(displayRafRef.current);
      }
      if (selectionRafRef.current !== null) {
        globalThis.cancelAnimationFrame(selectionRafRef.current);
      }
    },
    [],
  );

  return { displayNavigation, selectionRect, handleKeyDown, handleBlur };
};
