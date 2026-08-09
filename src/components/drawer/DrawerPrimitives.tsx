import {
  useCallback,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react';
import { ChevronDownIcon, InfoIcon } from '../icons';
import Tooltip from '../Tooltip';

export type LabelWithHelpProps = {
  label: string;
  tooltip: string;
  variant?: 'subtitle' | 'body' | 'caption';
  htmlFor?: string;
  helpFocusable?: boolean;
  tooltipId?: string;
  /** Lets a parent control (a toggle) open the tooltip from its own focus. */
  open?: boolean;
};

export const LabelWithHelp = ({
  label,
  tooltip,
  variant = 'subtitle',
  htmlFor,
  helpFocusable = true,
  tooltipId,
  open: openOverride = false,
}: LabelWithHelpProps) => {
  const generatedTooltipId = useId();
  const resolvedTooltipId = tooltipId ?? generatedTooltipId;
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const textClass =
    variant === 'caption'
      ? 'text-label uppercase tracking-label text-dim'
      : variant === 'body'
        ? 'text-sm text-ink'
        : 'text-micro uppercase tracking-label text-dim';

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
        ref={anchorRef}
        className='relative inline-flex'
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        {helpFocusable ? (
          <button
            type='button'
            className='cursor-help rounded-control text-dim transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none'
            aria-label={`${label} help`}
            aria-describedby={resolvedTooltipId}
          >
            <InfoIcon className='h-3.5 w-3.5' />
          </button>
        ) : (
          <span className='cursor-help text-dim'>
            <InfoIcon className='h-3.5 w-3.5' />
          </span>
        )}
        <Tooltip
          id={resolvedTooltipId}
          open={hovered || openOverride}
          anchorRef={anchorRef}
        >
          {tooltip}
        </Tooltip>
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
  <details className='group border-b border-rule pb-6' open={defaultOpen}>
    <summary className='flex cursor-pointer touch-manipulation items-center justify-between rounded-control py-2 text-micro font-semibold uppercase tracking-label text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 [&::-webkit-details-marker]:hidden'>
      <span className='text-balance'>{title}</span>
      <ChevronDownIcon className='h-4 w-4 transition-transform motion-reduce:transition-none group-open:rotate-180' />
    </summary>
    <div className='space-y-4 pt-2'>{children}</div>
  </details>
);

export const SelectChevron = () => (
  <ChevronDownIcon className='pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim' />
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
  const [describing, setDescribing] = useState(false);

  // The help icon here is decorative, so the toggle itself surfaces the
  // tooltip — on hover, and on keyboard focus but not on a mouse click.
  const handleFocus = useCallback((event: FocusEvent<HTMLButtonElement>) => {
    setDescribing(event.currentTarget.matches(':focus-visible'));
  }, []);

  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      aria-label={label}
      aria-describedby={tooltipId}
      className='flex w-full touch-manipulation items-center justify-between rounded-panel border border-rule bg-raised px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none'
      onClick={onClick}
      onPointerEnter={() => setDescribing(true)}
      onPointerLeave={() => setDescribing(false)}
      onFocus={handleFocus}
      onBlur={() => setDescribing(false)}
    >
      <LabelWithHelp
        label={label}
        tooltip={tooltip}
        tooltipId={tooltipId}
        variant='body'
        helpFocusable={false}
        open={describing}
      />
      <span
        aria-hidden
        className={`relative inline-flex h-5 w-9 items-center rounded-control border transition motion-reduce:transition-none ${
          checked
            ? 'border-accent/60 bg-accent/25'
            : 'border-rule-strong bg-raised'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-[1px] transition motion-reduce:transition-none ${
            checked
              ? 'translate-x-[18px] bg-accent'
              : 'translate-x-[3px] bg-dim'
          }`}
        />
      </span>
    </button>
  );
};
