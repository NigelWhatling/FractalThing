/**
 * Shared UI vocabulary for the rail and the panel it opens. Kept out of the
 * components so both can import it without breaking fast refresh.
 */

export type InteractionMode = 'grab' | 'select';

/** Must match the Tailwind spacing tokens used by the rail and panel. */
export const RAIL_WIDTH = 40;
export const PANEL_WIDTH = 316;

export type PanelId =
  'fractal' | 'colour' | 'renderer' | 'detail' | 'interface';

/** Sections are named for the task, not for the code layout. */
export const PANEL_TITLES: Record<PanelId, string> = {
  fractal: 'Fractal',
  colour: 'Colour',
  renderer: 'Renderer',
  detail: 'Detail',
  interface: 'Interface',
};

export const PANEL_ORDER: PanelId[] = [
  'fractal',
  'colour',
  'renderer',
  'detail',
  'interface',
];
