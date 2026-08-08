import type { ReactNode } from 'react';

export type LabelWithHelpProps = {
  label: string;
  tooltip: string;
  variant?: 'subtitle' | 'body' | 'caption';
  htmlFor?: string;
};

export const LabelWithHelp = ({
  label,
  tooltip,
  variant = 'subtitle',
  htmlFor,
}: LabelWithHelpProps) => {
  const textClass =
    variant === 'caption'
      ? 'text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-white/50'
      : variant === 'body'
        ? 'text-sm text-slate-800 dark:text-white/90'
        : 'text-[11px] uppercase tracking-[0.14em] text-slate-600 dark:text-white/60';
  return (
    <div className='flex items-center gap-2'>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={textClass}>
          {label}
        </label>
      ) : (
        <span className={textClass}>{label}</span>
      )}
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

export const Section = ({
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
    <summary className='flex cursor-pointer touch-manipulation items-center justify-between rounded-lg py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 dark:text-white/70 [&::-webkit-details-marker]:hidden'>
      <span className='text-balance'>{title}</span>
      <span
        className='transition-transform motion-reduce:transition-none group-open:rotate-180'
        aria-hidden='true'
      >
        ▾
      </span>
    </summary>
    <div className='space-y-4 pt-2'>{children}</div>
  </details>
);

export const SelectChevron = () => (
  <svg
    className='pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/60'
    viewBox='0 0 24 24'
    fill='none'
    aria-hidden='true'
  >
    <path
      d='M7 10l5 5 5-5'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
  </svg>
);

export const ToggleControl = ({
  checked,
  label,
  tooltip,
  onClick,
}: {
  checked: boolean;
  label: string;
  tooltip: string;
  onClick: () => void;
}) => (
  <button
    type='button'
    role='switch'
    aria-checked={checked}
    aria-label={label}
    className='flex w-full touch-manipulation items-center justify-between rounded-xl border border-slate-200/70 bg-slate-100/70 px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none dark:border-white/10 dark:bg-white/5'
    onClick={onClick}
  >
    <LabelWithHelp label={label} tooltip={tooltip} variant='body' />
    <span
      aria-hidden
      className={`relative inline-flex h-6 w-11 items-center rounded-full border border-slate-200/70 transition motion-reduce:transition-none dark:border-white/10 ${
        checked
          ? 'bg-cyan-500/25 dark:bg-cyan-400/30'
          : 'bg-slate-300/70 dark:bg-white/15'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition motion-reduce:transition-none ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </span>
  </button>
);
