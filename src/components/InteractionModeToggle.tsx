export type InteractionMode = 'grab' | 'select';

type InteractionModeToggleProps = {
  value: InteractionMode;
  onChange: (mode: InteractionMode) => void;
  onReset: () => void;
};

const InteractionModeToggle = ({ value, onChange, onReset }: InteractionModeToggleProps) => {
  const baseClasses =
    'flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/70 text-sm text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.12)] backdrop-blur-md transition hover:border-white/80 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200 dark:shadow-[0_8px_22px_rgba(0,0,0,0.5)] dark:hover:border-white/30';
  const activeClasses =
    'border-cyan-400/70 bg-cyan-400/10 text-cyan-600 dark:bg-cyan-300/10 dark:text-cyan-300';
  const inactiveClasses = '';

  return (
    <div className="fixed right-3 top-3 z-50 flex gap-2 rounded-full border border-white/60 bg-white/60 p-1 shadow-[0_10px_24px_rgba(15,23,42,0.15)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60 dark:shadow-[0_12px_30px_rgba(0,0,0,0.55)]">
      <button
        type="button"
        aria-label="Grab mode"
        title="Grab"
        className={`${baseClasses} ${value === 'grab' ? activeClasses : inactiveClasses}`}
        onClick={() => onChange('grab')}
      >
        🖐
      </button>
      <button
        type="button"
        aria-label="Select mode"
        title="Select"
        className={`${baseClasses} ${value === 'select' ? activeClasses : inactiveClasses}`}
        onClick={() => onChange('select')}
      >
        ▢
      </button>
      <button
        type="button"
        aria-label="Reset view"
        title="Reset view"
        className={baseClasses}
        onClick={onReset}
      >
        ↺
      </button>
    </div>
  );
};

export default InteractionModeToggle;
