import { APP_VERSION } from '../util/version';

type InfoPanelProps = {
  nav: {
    x: number;
    y: number;
    z: number;
  };
  isRendering: boolean;
  maxIterations: number;
  precisionWarning?: boolean;
  renderMode: string;
  finalRenderMs?: number | null;
  gpuError?: string | null;
};

const formatValue = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return value.toFixed(15).replace(/\.?0+$/, '');
};

const formatTime = (value: number) => Math.max(0, value).toFixed(2);

const formatIterations = (value: number) => `${Math.round(Math.max(0, value))}`;

const InfoPanel = ({
  nav,
  isRendering,
  maxIterations,
  precisionWarning = false,
  renderMode,
  finalRenderMs = null,
  gpuError = null,
}: InfoPanelProps) => {
  const renderStatus = isRendering ? 'Rendering…' : 'Idle';
  const finalRenderLabel =
    finalRenderMs === null
      ? '—'
      : finalRenderMs >= 1000
        ? `${formatTime(finalRenderMs / 1000)} s`
        : `${formatTime(finalRenderMs)} ms`;

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 grid grid-cols-[1fr_auto_1fr] items-center gap-3 bg-slate-950/60 backdrop-blur-sm px-3 py-1 text-[11px]">
      <div className="flex flex-wrap gap-3 font-mono text-[11px] tabular-nums text-white/70">
        <span>X {formatValue(nav.x)}</span>
        <span>Y {formatValue(nav.y)}</span>
        <span>Z {formatValue(nav.z)}</span>
        <span>Max {formatIterations(maxIterations)}</span>
      </div>
      <div className="text-center" aria-live="polite" aria-atomic="true">
        {gpuError ? (
          <span className="text-[10px] uppercase tracking-[0.18em] text-rose-200/90">
            {gpuError}
          </span>
        ) : (
          precisionWarning && (
            <span className="text-[10px] uppercase tracking-[0.2em] text-amber-200/80">
              Precision limit reached
            </span>
          )
        )}
        <a
          href="https://github.com/NigelWhatling/FractalThing"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto block text-[10px] uppercase tracking-[0.2em] text-white/60 transition hover:text-white/80"
        >
          {`FractalThing ${APP_VERSION}`}
        </a>
      </div>
      <span
        className="text-right text-[10px] uppercase tracking-wider tabular-nums text-white/60"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {renderMode} · {renderStatus} · {finalRenderLabel}
      </span>
    </div>
  );
};

export default InfoPanel;
