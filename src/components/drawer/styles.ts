/**
 * Shared control classes. These were duplicated literal-for-literal across the
 * drawer components; a single definition is what keeps the instrument look
 * consistent when a token changes.
 */

export const selectClass =
  'w-full touch-manipulation appearance-none rounded-control border border-rule-strong bg-raised px-3 py-2 pr-9 text-sm text-ink transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none';

/** Native option lists don't inherit the panel surface, so they get the void. */
export const optionClass = 'bg-void text-ink';

export const inputClass =
  'w-full touch-manipulation rounded-control border border-rule-strong bg-raised px-3 py-2 font-mono text-sm tabular-nums text-ink transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none';

export const buttonClass =
  'touch-manipulation rounded-control border border-rule-strong bg-raised px-3 py-2 text-micro font-semibold uppercase tracking-label text-dim transition hover:border-accent/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none';

/**
 * Native range, recoloured. `appearance-none` is deliberately absent: it strips
 * the track and thumb in WebKit unless every pseudo-element is redeclared.
 */
export const smallButtonClass =
  'touch-manipulation rounded-control border border-rule-strong bg-raised px-2 py-1 text-xs font-medium text-dim transition hover:border-accent/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none disabled:opacity-40 disabled:hover:border-rule-strong disabled:hover:text-dim';

/** The single affirmative action in a dialog; the only accent-filled control. */
export const primaryButtonClass =
  'touch-manipulation rounded-control border border-accent/60 bg-accent/15 px-3 py-2 text-xs font-semibold text-ink transition hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none disabled:opacity-40';

export const rangeClass =
  'w-full cursor-pointer touch-manipulation rounded-control accent-[color:var(--ft-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60';

/** Live numeric value beside a control. Mono so the width stops jumping. */
export const readoutBadgeClass =
  'rounded-control border border-rule-strong bg-raised px-2 py-1 font-mono text-xs tabular-nums text-ink';

/** Min/max captions under a range. */
export const scaleCaptionClass =
  'flex justify-between text-label uppercase tracking-label text-dim';
