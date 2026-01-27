import { DEFAULT_PALETTE_STOPS, type PaletteStop } from './PaletteGenerator';

export type PalettePreset = {
  id: string;
  name: string;
  stops: PaletteStop[];
};

const cloneStops = (stops: PaletteStop[]) =>
  stops.map((stop) => ({ ...stop }));

export const BUILTIN_PALETTES: PalettePreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    stops: cloneStops(DEFAULT_PALETTE_STOPS),
  },
  {
    id: 'deep-ocean',
    name: 'Deep Ocean',
    stops: [
      { position: 0, colour: '#001219' },
      { position: 0.2, colour: '#005f73' },
      { position: 0.45, colour: '#0a9396' },
      { position: 0.7, colour: '#94d2bd' },
      { position: 1, colour: '#e9d8a6' },
    ],
  },
  {
    id: 'ember',
    name: 'Ember',
    stops: [
      { position: 0, colour: '#03071e' },
      { position: 0.25, colour: '#370617' },
      { position: 0.5, colour: '#9d0208' },
      { position: 0.75, colour: '#f48c06' },
      { position: 1, colour: '#ffba08' },
    ],
  },
  {
    id: 'aurora',
    name: 'Aurora',
    stops: [
      { position: 0, colour: '#0b132b' },
      { position: 0.3, colour: '#1c2541' },
      { position: 0.55, colour: '#3a506b' },
      { position: 0.75, colour: '#5bc0be' },
      { position: 1, colour: '#c7f9cc' },
    ],
  },
];
