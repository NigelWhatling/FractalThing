import type { RenderSettings as RenderSettingsState } from '../../state/settings';
import {
  FRACTAL_OPTIONS,
  normaliseAlgorithm,
  type FractalAlgorithm,
} from '../../util/fractals';
import { LabelWithHelp, SelectChevron } from './DrawerPrimitives';
import {
  AutoIterationSettings,
  IterationSettings,
} from './IterationRefinementSettings';
import { optionClass, selectClass } from './styles';

type FractalSettingsProps = {
  settings: RenderSettingsState;
  onUpdateSettings: (payload: Partial<RenderSettingsState>) => void;
  algorithm: FractalAlgorithm;
  onChangeAlgorithm: (algorithm: FractalAlgorithm) => void;
};

const FractalSettings = ({
  settings,
  onUpdateSettings,
  algorithm,
  onChangeAlgorithm,
}: FractalSettingsProps) => (
  <>
    <div className='space-y-2'>
      <LabelWithHelp
        label='Fractal'
        tooltip='Select the fractal set. Updates the URL so you can share the view.'
        htmlFor='fractal-select'
      />
      <div className='relative'>
        <select
          className={selectClass}
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
              className={optionClass}
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

    <AutoIterationSettings
      settings={settings}
      onUpdateSettings={onUpdateSettings}
    />
  </>
);

export default FractalSettings;
