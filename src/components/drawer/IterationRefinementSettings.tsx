import { useMemo } from 'react';
import type { RenderSettings } from '../../state/settings';
import { LabelWithHelp, ToggleControl } from './DrawerPrimitives';

const refinementOptions = [
  { label: 'Slow', steps: 7 },
  { label: 'Balanced', steps: 5 },
  { label: 'Fast', steps: 3 },
  { label: 'Instant', steps: 1 },
];

const finalQualityOptions = [
  { label: 'Large', value: 4 },
  { label: 'Medium', value: 2 },
  { label: 'Best', value: 1 },
];

type SettingsProps = {
  settings: RenderSettings;
  onUpdateSettings: (payload: Partial<RenderSettings>) => void;
};

export const IterationSettings = ({
  settings,
  onUpdateSettings,
}: SettingsProps) => {
  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between'>
        <LabelWithHelp
          label={
            settings.autoMaxIterations ? 'Base iterations' : 'Max iterations'
          }
          tooltip={
            settings.autoMaxIterations
              ? 'Base escape-iteration cap. Auto mode adds extra iterations as you zoom.'
              : 'Escape-iteration cap. Higher values reveal more detail but render slower.'
          }
          variant='body'
          htmlFor='iterations-range'
        />
        <span className='rounded-lg border border-slate-200/70 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-white/90'>
          {settings.maxIterations}
        </span>
      </div>
      <input
        type='range'
        min={32}
        max={2048}
        step={32}
        value={settings.maxIterations}
        className='w-full touch-manipulation accent-cyan-400 dark:accent-cyan-300'
        id='iterations-range'
        name='iterations'
        aria-label={
          settings.autoMaxIterations ? 'Base iterations' : 'Max iterations'
        }
        onChange={(event) => {
          const nextValue = Math.max(
            32,
            Math.round(Number(event.target.value)),
          );
          onUpdateSettings({ maxIterations: nextValue });
        }}
      />
      <div className='flex justify-between text-[11px] text-slate-500 dark:text-white/40'>
        <span>32</span>
        <span>2048</span>
      </div>
    </div>
  );
};

export const AutoIterationSettings = ({
  settings,
  onUpdateSettings,
}: SettingsProps) => {
  return (
    <>
      <ToggleControl
        checked={settings.autoMaxIterations}
        label='Auto max iterations'
        tooltip='Increase max iterations as you zoom in (log2 scale).'
        onClick={() =>
          onUpdateSettings({
            autoMaxIterations: !settings.autoMaxIterations,
          })
        }
      />

      {settings.autoMaxIterations && (
        <div className='space-y-2'>
          <LabelWithHelp
            label='Auto iteration scale'
            tooltip='Extra iterations added per zoom octave. Higher values sharpen deep zooms.'
            htmlFor='auto-iteration-scale-range'
          />
          <input
            type='range'
            min={0}
            max={512}
            step={16}
            value={settings.autoIterationsScale}
            className='w-full touch-manipulation accent-cyan-400 dark:accent-cyan-300'
            id='auto-iteration-scale-range'
            name='auto-iteration-scale'
            aria-label='Auto iteration scale'
            onChange={(event) => {
              const nextValue = Math.max(
                0,
                Math.round(Number(event.target.value)),
              );
              onUpdateSettings({ autoIterationsScale: nextValue });
            }}
          />
        </div>
      )}
    </>
  );
};

export const RefinementSettings = ({
  settings,
  onUpdateSettings,
}: SettingsProps) => {
  const workerMax = useMemo(
    () =>
      Math.max(
        1,
        typeof navigator === 'undefined'
          ? 8
          : navigator.hardwareConcurrency || 8,
      ),
    [],
  );

  const refinementPreset = Math.max(
    0,
    refinementOptions.findIndex(
      (preset) => preset.steps === settings.refinementStepsCount,
    ),
  );
  const finalQualityPreset = Math.max(
    0,
    finalQualityOptions.findIndex(
      (option) => option.value === settings.finalBlockSize,
    ),
  );

  return (
    <>
      <div className='space-y-2'>
        <LabelWithHelp
          label='Tile size'
          tooltip='Size of render tiles in pixels. Smaller tiles update more granularly but add overhead.'
          htmlFor='tile-size-range'
        />
        <input
          type='range'
          min={32}
          max={512}
          step={32}
          value={settings.tileSize}
          className='w-full touch-manipulation accent-cyan-400 dark:accent-cyan-300'
          id='tile-size-range'
          name='tile-size'
          aria-label='Tile size'
          onChange={(event) => {
            const nextValue = Math.max(
              32,
              Math.round(Number(event.target.value)),
            );
            onUpdateSettings({ tileSize: nextValue });
          }}
        />
      </div>

      <div className='space-y-2'>
        <LabelWithHelp
          label='Worker count'
          tooltip='Number of render workers. Higher counts use more CPU.'
          htmlFor='worker-count-range'
        />
        <input
          type='range'
          min={1}
          max={workerMax}
          step={1}
          value={settings.workerCount}
          className='w-full touch-manipulation accent-cyan-400 dark:accent-cyan-300'
          id='worker-count-range'
          name='worker-count'
          aria-label='Worker count'
          onChange={(event) => {
            const nextValue = Math.max(
              1,
              Math.round(Number(event.target.value)),
            );
            onUpdateSettings({ workerCount: nextValue });
          }}
        />
        <div className='flex justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-white/40'>
          <span>1</span>
          <span>{workerMax}</span>
        </div>
      </div>

      <div className='space-y-2'>
        <LabelWithHelp
          label='Refinement speed'
          tooltip='Number of progressive passes from coarse to fine.'
          htmlFor='refinement-speed-range'
        />
        <input
          type='range'
          min={0}
          max={refinementOptions.length - 1}
          step={1}
          value={refinementPreset}
          className='w-full touch-manipulation accent-cyan-400 dark:accent-cyan-300'
          id='refinement-speed-range'
          name='refinement-speed'
          aria-label='Refinement speed'
          onChange={(event) => {
            const index = Math.round(Number(event.target.value));
            const preset = refinementOptions[index];
            if (!preset) {
              return;
            }
            onUpdateSettings({ refinementStepsCount: preset.steps });
          }}
        />
        <div className='flex justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-white/40'>
          <span>Slow</span>
          <span>Fast</span>
        </div>
      </div>

      <div className='space-y-2'>
        <LabelWithHelp
          label='Final quality'
          tooltip='Smallest block size used for the final pass.'
          htmlFor='final-quality-range'
        />
        <input
          type='range'
          min={0}
          max={finalQualityOptions.length - 1}
          step={1}
          value={finalQualityPreset}
          className='w-full touch-manipulation accent-cyan-400 dark:accent-cyan-300'
          id='final-quality-range'
          name='final-quality'
          aria-label='Final quality'
          onChange={(event) => {
            const index = Math.round(Number(event.target.value));
            const option = finalQualityOptions[index];
            if (!option) {
              return;
            }
            onUpdateSettings({ finalBlockSize: option.value });
          }}
        />
        <div className='flex justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-white/40'>
          <span>Large</span>
          <span>Best</span>
        </div>
      </div>
    </>
  );
};
