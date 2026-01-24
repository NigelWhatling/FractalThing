type InfoPanelProps = {
  nav: {
    x: number;
    y: number;
    z: number;
  };
  isRendering: boolean;
  maxIterations: number;
  precisionWarning?: boolean;
};

const formatValue = (value: number) => value.toFixed(6);

const InfoPanel = ({
  nav,
  isRendering,
  maxIterations,
  precisionWarning = false,
}: InfoPanelProps) => {
  const renderStatus = isRendering ? 'Rendering…' : 'Idle';

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 grid grid-cols-[1fr_auto_1fr] items-center gap-3 bg-slate-950/60 backdrop-blur-sm px-3 py-1 text-[11px]">
      <div className="flex flex-wrap gap-3 font-mono text-[11px] text-white/70">
        <span>X {formatValue(nav.x)}</span>
        <span>Y {formatValue(nav.y)}</span>
        <span>Z {formatValue(nav.z)}</span>
        <span>Max {Math.round(maxIterations)}</span>
      </div>
      <div className="text-center">
        {precisionWarning && (
          <span className="text-[10px] uppercase tracking-[0.2em] text-amber-200/80">
            Precision limit reached
          </span>
        )}
      </div>
      <span className="text-right text-[10px] uppercase tracking-wider text-white/60">
        {renderStatus}
      </span>
    </div>
  );
};

export default InfoPanel;
