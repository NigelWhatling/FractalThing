import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Tooltips render into `document.body` rather than beside their trigger.
 *
 * The settings panel scrolls, and a scroll container clips on both axes even
 * when only one is scrollable (`overflow-x: hidden` + `overflow-y: auto`
 * computes to `hidden auto`). No z-index escapes that, and neither does
 * `position: fixed` here — the panel's `backdrop-filter` makes it a containing
 * block for fixed descendants. A portal is the only reliable way out, and it
 * means the position has to be measured rather than expressed in CSS.
 */

/** Matches `w-56`. Kept in sync so the flip/clamp maths is honest. */
const TOOLTIP_WIDTH = 224;

/** Keeps the tooltip off the very edge of the viewport. */
const VIEWPORT_MARGIN = 8;

/** Gap between the trigger and the tooltip. */
const OFFSET = 8;

export type TooltipProps = {
  id: string;
  open: boolean;
  anchorRef: RefObject<HTMLElement>;
  children: ReactNode;
};

const Tooltip = ({ id, open, anchorRef, children }: TooltipProps) => {
  const [position, setPosition] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!open || !anchor || typeof document === 'undefined') {
      return;
    }

    const update = () => {
      const rect = anchor.getBoundingClientRect();
      // Right-aligned to the trigger, matching the old `right-0` anchoring.
      const rawLeft = rect.right - TOOLTIP_WIDTH;
      const left = Math.min(
        Math.max(VIEWPORT_MARGIN, rawLeft),
        globalThis.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN,
      );
      // Flip above when there is not enough room below.
      const belowTop = rect.bottom + OFFSET;
      const spaceBelow = globalThis.innerHeight - belowTop;
      const flip = spaceBelow < 120;
      setPosition(
        flip
          ? {
              left,
              bottom: globalThis.innerHeight - rect.top + OFFSET,
              width: TOOLTIP_WIDTH,
            }
          : { left, top: belowTop, width: TOOLTIP_WIDTH },
      );
    };

    update();
    globalThis.addEventListener('scroll', update, true);
    globalThis.addEventListener('resize', update);
    return () => {
      globalThis.removeEventListener('scroll', update, true);
      globalThis.removeEventListener('resize', update);
    };
  }, [anchorRef, open]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <span
      id={id}
      role='tooltip'
      style={{ position: 'fixed', ...(position ?? { left: -9999, top: 0 }) }}
      className={`pointer-events-none z-[80] rounded-panel border border-rule bg-void px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ink shadow-panel transition-opacity motion-reduce:transition-none ${
        open && position ? 'visible opacity-100' : 'invisible opacity-0'
      }`}
    >
      {children}
    </span>,
    document.body,
  );
};

export default Tooltip;
