import type { RenderSettings as RenderSettingsState } from '../../state/settings';
import type { Navigation } from '../../engine/viewport';
import {
  FRACTAL_OPTIONS,
  normaliseAlgorithm,
  type FractalAlgorithm,
} from '../../util/fractals';
import ColourFilterSettings from './ColourFilterSettings';
import { LabelWithHelp, SelectChevron } from './DrawerPrimitives';
import {
  AutoIterationSettings,
  IterationSettings,
} from './IterationRefinementSettings';

type RenderSettingsProps = {
  settings: RenderSettingsState;
  onUpdateSettings: (payload: Partial<RenderSettingsState>) => void;
  algorithm: FractalAlgorithm;
  onChangeAlgorithm: (algorithm: FractalAlgorithm) => void;
  navigation: Navigation;
  onPaletteEditorOpenChange?: (open: boolean) => void;
};

const RenderSettings = ({
  settings,
  onUpdateSettings,
  algorithm,
  onChangeAlgorithm,
  navigation,
  onPaletteEditorOpenChange,
}: RenderSettingsProps) => (
  <>
    <div className='space-y-2'>
      <LabelWithHelp
        label='Fractal'
        tooltip='Select the fractal set. Updates the URL so you can share the view.'
        htmlFor='fractal-select'
      />
      <div className='relative'>
        <select
          className='w-full touch-manipulation appearance-none rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 dark:border-white/10 dark:bg-white/5 dark:text-white/90 dark:hover:bg-white/10'
          id='fractal-select'
          name='fractal'
          aria-label='Fractal'
          value={normaliseAlgorithm(algorithm)}
          onChange={(event) =>
            onChangeAlgorithm(event.target.value as FractalAlgorithm)
          }
        >
          {FRACTAL_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
              className='bg-white text-slate-900 dark:bg-slate-900 dark:text-white'
            >
              {option.label}
            </option>
          ))}
        </select>
        <SelectChevron />
      </div>
    </div>

    <IterationSettings
      settings={settings}
      onUpdateSettings={onUpdateSettings}
    />

    <ColourFilterSettings
      settings={settings}
      onUpdateSettings={onUpdateSettings}
      algorithm={algorithm}
      navigation={navigation}
      onPaletteEditorOpenChange={onPaletteEditorOpenChange}
    />

    <AutoIterationSettings
      settings={settings}
      onUpdateSettings={onUpdateSettings}
    />
  </>
);

export default RenderSettings;
