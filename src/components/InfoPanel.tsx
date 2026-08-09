import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { splitAtFloat64Boundary } from '../engine/precisionReadout';
import { AlertIcon } from './icons';
import type { PanelId } from '../state/ui';
import { APP_VERSION } from '../util/version';

type InfoPanelProps = {
  nav: {
    x: number | string;
    y: number | string;
    z: number;
  };
  isRendering: boolean;
  maxIterations: number;
  precisionWarning?: boolean;
  renderMode: string;
  finalRenderMs?: number | null;
  renderError?: string | null;
  onOpenPanel?: (panel: PanelId) => void;
  coordinateLabels?: 'complex' | 'cartesian';
};

const formatValue = (value: number | string) => {
  if (typeof value === 'string') {
    return value;
  }
  if (!Number.isFinite(value)) {
    return '0';
  }
  return value.toFixed(15).replace(/\.?0+$/, '');
};

const formatTime = (value: number) => Math.max(0, value).toFixed(2);

const formatIterations = (value: number) => `${Math.round(Math.max(0, value))}`;

/**
 * Zoom as doublings rather than a decade exponent. `1e19` reads as a number you
 * cannot feel; depth is linear, so it ticks up steadily as you scroll and two
 * views are directly comparable. It is also the same quantity the precision
 * model uses — depth is roughly the count of significand bits the view demands,
 * which is why it lines up with the precision warning.
 */
const formatDepth = (zoom: number) => {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return '0.0';
  }
  return Math.max(0, Math.log2(zoom)).toFixed(1);
};

/**
 * One coordinate axis. Digits Float64 can still resolve are printed in the
 * primary colour; everything past that boundary is dim, with a one-pixel accent
 * rule marking the exact point where the BigInt reference orbit takes over.
 */
const Coordinate = ({ axis, value }: { axis: string; value: string }) => {
  const { sign, head, tail, exponent } = splitAtFloat64Boundary(value);
  return (
    <span className='inline-flex items-baseline gap-1.5'>
      <span className='text-label uppercase tracking-label text-dim'>
        {axis}
      </span>
      <span className='font-mono tabular text-ink'>
        {sign}
        {head}
        {tail && (
          <>
            <span
              aria-hidden
              className='mx-px inline-block h-[0.9em] w-px translate-y-[0.1em] bg-accent align-baseline'
            />
            <span className='text-dim'>{tail}</span>
          </>
        )}
        {exponent}
      </span>
    </span>
  );
};

/**
 * A readout that is also the way in to the setting behind it — clicking the
 * backend badge opens the panel that chooses the backend.
 */
const Stat = ({
  panel,
  label,
  onOpen,
  children,
}: {
  panel: PanelId;
  label: string;
  onOpen?: (panel: PanelId) => void;
  children: ReactNode;
}) => {
  if (!onOpen) {
    return <span className='font-mono tabular text-dim'>{children}</span>;
  }
  return (
    <button
      type='button'
      aria-label={label}
      title={label}
      onClick={() => onOpen(panel)}
      className='rounded-control font-mono tabular text-dim underline-offset-4 transition hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none'
    >
      {children}
    </button>
  );
};

/**
 * Render errors and the precision ceiling. These carry their own colour rather
 * than the palette accent — the accent is whatever hue the fractal happens to
 * use, and a green "warning" means nothing. The icon is not decoration: it is
 * what keeps the state legible without relying on hue.
 */
const StatusFlag = ({
  tone,
  onOpen,
  children,
}: {
  tone: 'warn' | 'danger';
  onOpen?: (panel: PanelId) => void;
  children: ReactNode;
}) => {
  const toneClass = tone === 'danger' ? 'text-danger' : 'text-warn';
  const body = (
    <>
      <AlertIcon className='h-3.5 w-3.5 shrink-0' />
      <span className='text-label uppercase tracking-label'>{children}</span>
    </>
  );
  if (!onOpen) {
    return (
      <span className={`inline-flex items-center gap-1.5 ${toneClass}`}>
        {body}
      </span>
    );
  }
  return (
    <button
      type='button'
      title='Open Renderer settings'
      onClick={() => onOpen('renderer')}
      className={`inline-flex items-center gap-1.5 rounded-control underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none ${toneClass}`}
    >
      {body}
    </button>
  );
};

const InfoPanel = ({
  nav,
  isRendering,
  maxIterations,
  precisionWarning = false,
  renderMode,
  finalRenderMs = null,
  renderError = null,
  onOpenPanel,
  coordinateLabels = 'complex',
}: InfoPanelProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node || typeof document === 'undefined') {
      return;
    }

    const update = () => {
      const nextHeight = Math.max(
        0,
        Math.round(node.getBoundingClientRect().height),
      );
      document.documentElement.style.setProperty(
        '--info-panel-height',
        `${nextHeight}px`,
      );
    };

    update();

    if (typeof ResizeObserver === 'undefined') {
      globalThis.addEventListener('resize', update);
      return () => {
        globalThis.removeEventListener('resize', update);
      };
    }

    const observer = new ResizeObserver(update);
    observer.observe(node);
    globalThis.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener('resize', update);
    };
  }, []);

  const renderStatus = isRendering ? 'Rendering' : 'Idle';
  const finalRenderLabel =
    finalRenderMs === null
      ? '—'
      : finalRenderMs >= 1000
        ? `${formatTime(finalRenderMs / 1000)} s`
        : `${formatTime(finalRenderMs)} ms`;

  return (
    <div
      ref={rootRef}
      className='absolute bottom-0 left-0 right-0 z-40 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-rule bg-panel px-3 py-1 text-micro backdrop-blur-md transition-colors hover:bg-panel-solid motion-reduce:transition-none'
    >
      <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
        <Coordinate
          axis={coordinateLabels === 'cartesian' ? 'x' : 're'}
          value={formatValue(nav.x)}
        />
        <Coordinate
          axis={coordinateLabels === 'cartesian' ? 'y' : 'im'}
          value={formatValue(nav.y)}
        />
      </div>

      {/*
        Its own slot between the two groups, so `justify-between` centres it.
        Appending it to the metrics cluster buried the one thing in this bar
        that is actually trying to get your attention.
      */}
      <div aria-live='polite' aria-atomic='true'>
        {renderError ? (
          <StatusFlag tone='danger' onOpen={onOpenPanel}>
            {renderError}
          </StatusFlag>
        ) : (
          precisionWarning && (
            <StatusFlag tone='warn' onOpen={onOpenPanel}>
              Precision limit reached
            </StatusFlag>
          )
        )}
      </div>

      <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
        {/* Zoom is a position, not a setting, so it gets no affordance. */}
        <span
          className='font-mono tabular text-dim'
          title='Doublings from the full view. Each +1 halves the width; +10 is about 1000x closer.'
        >
          depth {formatDepth(nav.z)}
        </span>
        <Stat
          panel='fractal'
          label='Open Fractal settings'
          onOpen={onOpenPanel}
        >
          iter {formatIterations(maxIterations)}
        </Stat>
        <Stat
          panel='renderer'
          label='Open Renderer settings'
          onOpen={onOpenPanel}
        >
          {renderMode} · {renderStatus} · {finalRenderLabel}
        </Stat>
        <span className='sr-only' role='status' aria-live='polite'>
          {`${renderMode} ${renderStatus}`}
        </span>
        <a
          href='https://github.com/NigelWhatling/FractalThing'
          target='_blank'
          rel='noreferrer'
          className='rounded-control text-label uppercase tracking-label text-dim transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60'
        >
          {`FractalThing ${APP_VERSION}`}
        </a>
      </div>
    </div>
  );
};

export default InfoPanel;
