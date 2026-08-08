import {
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react';
import { HexColorPicker } from 'react-colorful';
import type { RenderSettings } from '../../state/settings';
import type { Navigation } from '../../engine/viewport';
import type { PaletteStop } from '../../util/PaletteGenerator';
import type { FractalAlgorithm } from '../../util/fractals';
import type { PalettePreset } from '../../util/palettes';
import { LabelWithHelp } from './DrawerPrimitives';
import PalettePreview from './PalettePreview';

type IndexedPaletteStop = PaletteStop & { index: number };

type PaletteEditorModalProps = {
  algorithm: FractalAlgorithm;
  navigation: Navigation;
  settings: RenderSettings;
  modalRef: RefObject<HTMLDivElement>;
  paletteBarRef: RefObject<HTMLDivElement>;
  pendingDragRef: MutableRefObject<{
    index: number;
    startX: number;
  } | null>;
  paletteStops: PaletteStop[];
  sortedStops: IndexedPaletteStop[];
  selectedStop: PaletteStop | null;
  selectedStopIndex: number | null;
  setSelectedStopIndex: Dispatch<SetStateAction<number | null>>;
  paletteName: string;
  setPaletteName: Dispatch<SetStateAction<string>>;
  paletteGradient: string;
  palettePresets: PalettePreset[];
  customPalettes: PalettePreset[];
  editingPaletteId: string | null;
  saveDisabled: boolean;
  paletteDraftDirty: boolean;
  paletteDirty: boolean;
  onModalKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onAddStop: (position: number) => void;
  onPaletteBarKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onStopChange: (index: number, partial: Partial<PaletteStop>) => void;
  onRemoveStop: (index: number) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onNew: () => void;
  onRandom: () => void;
  onReset: () => void;
  onEdit: (preset: PalettePreset) => void;
  onDelete: (paletteId: string) => void;
  onCancel: () => void;
  onApply: () => void;
};

const PaletteEditorModal = ({
  algorithm,
  navigation,
  settings,
  modalRef,
  paletteBarRef,
  pendingDragRef,
  paletteStops,
  sortedStops,
  selectedStop,
  selectedStopIndex,
  setSelectedStopIndex,
  paletteName,
  setPaletteName,
  paletteGradient,
  palettePresets,
  customPalettes,
  editingPaletteId,
  saveDisabled,
  paletteDraftDirty,
  paletteDirty,
  onModalKeyDown,
  onAddStop,
  onPaletteBarKeyDown,
  onStopChange,
  onRemoveStop,
  onSave,
  onSaveAs,
  onNew,
  onRandom,
  onReset,
  onEdit,
  onDelete,
  onCancel,
  onApply,
}: PaletteEditorModalProps) => (
  <div
    className='fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm'
    data-palette-editor-overlay
  >
    <div
      id='palette-editor-modal'
      role='dialog'
      aria-modal='true'
      aria-labelledby='palette-editor-title'
      aria-describedby='palette-editor-hint'
      ref={modalRef}
      tabIndex={-1}
      onKeyDown={onModalKeyDown}
      className='max-h-[90vh] w-full max-w-5xl overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/70 bg-white/95 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.2)] dark:border-white/10 dark:bg-slate-900/90 dark:shadow-[0_20px_60px_rgba(0,0,0,0.6)]'
    >
      <div className='flex items-center justify-between'>
        <div>
          <div className='text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-white/50'>
            Palette Editor
          </div>
          <div
            id='palette-editor-title'
            className='text-lg font-semibold text-slate-900 dark:text-white'
          >
            Colour Stops
          </div>
        </div>
      </div>

      <div className='mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]'>
        <div className='space-y-4'>
          <div
            className='relative h-10 w-full cursor-crosshair select-none overflow-hidden rounded-full border border-slate-200/70 bg-slate-200 dark:border-white/10 dark:bg-white/5'
            style={{ backgroundImage: paletteGradient }}
            ref={paletteBarRef}
            onClick={(event: MouseEvent<HTMLDivElement>) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onAddStop((event.clientX - rect.left) / rect.width);
            }}
            onKeyDown={onPaletteBarKeyDown}
            role='button'
            tabIndex={0}
            aria-label='Palette stop bar'
            aria-describedby='palette-editor-hint'
          >
            {sortedStops.map((stop) => (
              <div
                key={`${stop.colour}-${stop.index}`}
                className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 touch-manipulation rounded-full border border-white shadow-[0_4px_12px_rgba(15,23,42,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 ${
                  selectedStopIndex === stop.index
                    ? 'ring-2 ring-cyan-400/80'
                    : ''
                }`}
                style={{
                  left: `${stop.position * 100}%`,
                  backgroundColor: stop.colour,
                  transform: 'translate(-50%, -50%)',
                }}
                role='button'
                tabIndex={0}
                aria-label='Palette stop'
                aria-pressed={selectedStopIndex === stop.index}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setSelectedStopIndex(stop.index);
                  pendingDragRef.current = {
                    index: stop.index,
                    startX: event.clientX,
                  };
                }}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedStopIndex(stop.index);
                    return;
                  }
                  if (event.key === 'Backspace' || event.key === 'Delete') {
                    event.preventDefault();
                    onRemoveStop(stop.index);
                    return;
                  }
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    const step = event.shiftKey ? 0.05 : 0.01;
                    const direction = event.key === 'ArrowRight' ? 1 : -1;
                    onStopChange(stop.index, {
                      position: stop.position + step * direction,
                    });
                  }
                }}
              />
            ))}
          </div>

          <div
            id='palette-editor-hint'
            className='text-[11px] text-slate-500 dark:text-white/50'
          >
            Click the bar to add a stop. Drag the dots or use arrow keys to
            reposition.
          </div>

          <div className='rounded-xl border border-slate-200/70 bg-white/60 px-4 py-4 dark:border-white/10 dark:bg-white/5'>
            <div className='text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-white/60'>
              Edit Stop
            </div>
            {selectedStop ? (
              <div className='mt-4 flex flex-wrap items-start gap-4'>
                <HexColorPicker
                  color={selectedStop.colour}
                  aria-label='Stop colour'
                  onChange={(value) =>
                    onStopChange(selectedStopIndex ?? 0, { colour: value })
                  }
                />
                <div className='flex min-w-[160px] flex-1 flex-col gap-3'>
                  <div className='flex items-center gap-2'>
                    <label
                      htmlFor='palette-stop-position'
                      className='text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-white/50'
                    >
                      Position
                    </label>
                    <input
                      type='number'
                      min={0}
                      max={100}
                      step={0.1}
                      value={Math.round(selectedStop.position * 1000) / 10}
                      id='palette-stop-position'
                      name='palette-stop-position'
                      inputMode='decimal'
                      autoComplete='off'
                      className='w-20 rounded-lg border border-slate-200/70 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 dark:border-white/10 dark:bg-white/5 dark:text-white/80'
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        onStopChange(selectedStopIndex ?? 0, {
                          position: Math.min(100, Math.max(0, nextValue)) / 100,
                        });
                      }}
                    />
                    <span className='text-xs text-slate-500 dark:text-white/50'>
                      %
                    </span>
                  </div>
                  <button
                    type='button'
                    className='self-start touch-manipulation rounded-md border border-slate-200/70 bg-white px-2 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10'
                    onClick={() =>
                      selectedStopIndex === null
                        ? null
                        : onRemoveStop(selectedStopIndex)
                    }
                    disabled={paletteStops.length <= 2}
                  >
                    Remove Stop
                  </button>
                </div>
              </div>
            ) : (
              <div className='mt-3 text-[11px] text-slate-500 dark:text-white/50'>
                Select a stop to edit.
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <label
              htmlFor='palette-name'
              className='text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-white/60'
            >
              Palette Name
            </label>
            <input
              type='text'
              id='palette-name'
              name='palette-name'
              autoComplete='off'
              spellCheck={false}
              value={paletteName}
              onChange={(event) => setPaletteName(event.target.value)}
              placeholder='Custom palette…'
              className='w-full rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 dark:border-white/10 dark:bg-white/5 dark:text-white/90'
            />
          </div>

          <div className='flex flex-wrap gap-2'>
            <button
              type='button'
              className='touch-manipulation rounded-lg border border-slate-200/70 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10'
              onClick={onSave}
              disabled={saveDisabled}
            >
              Save Palette
            </button>
            <button
              type='button'
              className='touch-manipulation rounded-lg border border-slate-200/70 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10'
              onClick={onSaveAs}
            >
              Save Palette As…
            </button>
            <button
              type='button'
              className='touch-manipulation rounded-lg border border-slate-200/70 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10'
              onClick={onNew}
            >
              New Palette
            </button>
            <button
              type='button'
              className='touch-manipulation rounded-lg border border-slate-200/70 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10'
              onClick={onRandom}
            >
              Random Palette
            </button>
            <button
              type='button'
              className='touch-manipulation rounded-lg border border-slate-200/70 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10'
              onClick={onReset}
              disabled={!paletteDraftDirty}
            >
              Reset
            </button>
          </div>
          <div className='border-t border-slate-200/70 pt-4 dark:border-white/10' />

          <div className='space-y-2'>
            <LabelWithHelp
              label='Stored Palettes'
              tooltip='Manage saved palettes stored in this browser.'
            />
            <div className='max-h-48 space-y-2 overflow-y-auto overscroll-contain pr-1'>
              {palettePresets.map((preset) => {
                const isCustom = customPalettes.some(
                  (item) => item.id === preset.id,
                );
                const isEditing = editingPaletteId === preset.id;
                return (
                  <div
                    key={preset.id}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                      isEditing
                        ? 'border-cyan-400/60 bg-cyan-50/50 dark:border-cyan-300/40 dark:bg-cyan-300/10'
                        : 'border-slate-200/70 bg-white/70 dark:border-white/10 dark:bg-white/5'
                    }`}
                  >
                    <div
                      className='h-5 w-28 shrink-0 rounded-lg border border-slate-200/70 bg-slate-200 dark:border-white/10 dark:bg-white/5'
                      style={{
                        backgroundImage: getPaletteGradient(preset.stops),
                      }}
                      role='img'
                      aria-label={`${preset.name} palette preview`}
                    />
                    <div className='flex min-w-0 flex-1 items-center justify-between gap-2'>
                      <div className='flex min-w-0 items-center gap-2'>
                        {!isCustom && (
                          <span
                            className='text-xs text-slate-400 dark:text-white/40'
                            title='Built-in palette'
                            aria-label='Built-in palette'
                          >
                            🔒
                          </span>
                        )}
                        <div className='truncate text-xs font-semibold text-slate-700 dark:text-white/90'>
                          {preset.name}
                        </div>
                      </div>
                      <div className='flex gap-2 text-[11px]'>
                        <button
                          type='button'
                          className='touch-manipulation rounded-md border border-slate-200/70 bg-white px-2 py-1 font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10'
                          onClick={() => onEdit(preset)}
                          aria-label={`Edit palette ${preset.name}`}
                        >
                          Edit
                        </button>
                        <button
                          type='button'
                          className='touch-manipulation rounded-md border border-slate-200/70 bg-white px-2 py-1 font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10'
                          onClick={() => onDelete(preset.id)}
                          disabled={!isCustom}
                          aria-label={`Delete palette ${preset.name}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className='flex flex-wrap justify-end gap-2 border-t border-slate-200/70 pt-4 dark:border-white/10'>
            <button
              type='button'
              className='touch-manipulation rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10'
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type='button'
              className='touch-manipulation rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-700 shadow-sm transition hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none disabled:opacity-50 dark:border-cyan-300/40 dark:bg-cyan-300/10 dark:text-cyan-200'
              onClick={onApply}
              disabled={!paletteDirty}
            >
              Apply
            </button>
          </div>
        </div>

        <PalettePreview
          algorithm={algorithm}
          navigation={navigation}
          paletteStops={paletteStops}
          settings={settings}
        />
      </div>
    </div>
  </div>
);

const getPaletteGradient = (stops: PaletteStop[]) => {
  const gradientStops = [...stops]
    .sort((first, second) => first.position - second.position)
    .map((stop) => `${stop.colour} ${Math.round(stop.position * 100)}%`)
    .join(', ');
  return `linear-gradient(90deg, ${gradientStops})`;
};

export default PaletteEditorModal;
