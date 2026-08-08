import { useId, type ReactNode } from 'react';

export type LabelWithHelpProps = {
  label: string;
  tooltip: string;
  variant?: 'subtitle' | 'body' | 'caption';
  htmlFor?: string;
  helpFocusable?: boolean;
  tooltipId?: string;
};

export const LabelWithHelp = ({
  label,
  tooltip,
  variant = 'subtitle',
  htmlFor,
  helpFocusable = true,
  tooltipId,
}: LabelWithHelpProps) => {
  const generatedTooltipId = useId();
  const resolvedTooltipId = tooltipId ?? generatedTooltipId;
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
      <span className='group/help relative inline-flex'>
        {helpFocusable ? (
          <button
            type='button'
            className='cursor-help rounded-sm text-xs text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none dark:text-white/40 dark:hover:text-white/70'
            aria-label={`${label} help`}
            aria-describedby={resolvedTooltipId}
          >
            ⓘ
          </button>
        ) : (
          <span
            className='cursor-help text-xs text-slate-400 dark:text-white/40'
            aria-hidden='true'
          >
            ⓘ
          </span>
        )}
        <span
          id={resolvedTooltipId}
          role='tooltip'
          className='pointer-events-none invisible absolute right-0 top-full z-[70] mt-2 w-56 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-white opacity-0 shadow-xl transition-opacity group-hover/help:visible group-hover/help:opacity-100 group-focus-within/help:visible group-focus-within/help:opacity-100 group-focus-visible/toggle:visible group-focus-visible/toggle:opacity-100 motion-reduce:transition-none dark:bg-slate-100 dark:text-slate-900'
        >
          {tooltip}
        </span>
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
}) => {
  const tooltipId = useId();

  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      aria-label={label}
      aria-describedby={tooltipId}
      className='group/toggle flex w-full touch-manipulation items-center justify-between rounded-xl border border-slate-200/70 bg-slate-100/70 px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none dark:border-white/10 dark:bg-white/5'
      onClick={onClick}
    >
      <LabelWithHelp
        label={label}
        tooltip={tooltip}
        tooltipId={tooltipId}
        variant='body'
        helpFocusable={false}
      />
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
};
