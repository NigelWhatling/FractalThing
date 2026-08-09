import type { RenderSettings } from '../../state/settings';
import type { Navigation } from '../../engine/viewport';
import type { FractalAlgorithm } from '../../util/fractals';
import {
  LabelWithHelp,
  SelectChevron,
  ToggleControl,
} from './DrawerPrimitives';
import PaletteEditor from './PaletteEditor';
import {
  optionClass,
  rangeClass,
  readoutBadgeClass,
  selectClass,
} from './styles';

const colourModeOptions = [
  { value: 'normalize', label: 'Normalise to max' },
  { value: 'distribution', label: 'Distribution (equalised)' },
  { value: 'cycle', label: 'Cycle palette' },
  { value: 'fixed', label: 'Fixed (2048)' },
];

const filterOptions = [
  { value: 'none', label: 'None' },
  { value: 'gaussianSoft', label: 'Gaussian blur' },
  { value: 'vivid', label: 'Vivid' },
  { value: 'mono', label: 'Mono' },
  { value: 'dither', label: 'Dither (banding)' },
];

type ColourFilterSettingsProps = {
  settings: RenderSettings;
  onUpdateSettings: (payload: Partial<RenderSettings>) => void;
  algorithm: FractalAlgorithm;
  navigation: Navigation;
  onPaletteEditorOpenChange?: (open: boolean) => void;
};

const ColourFilterSettings = ({
  settings,
  onUpdateSettings,
  algorithm,
  navigation,
  onPaletteEditorOpenChange,
}: ColourFilterSettingsProps) => {
  return (
    <>
      <div className='space-y-2'>
        <LabelWithHelp
          label='Colour mode'
          tooltip='How iterations map to the palette: Normalise scales with max, Distribution equalises, Cycle repeats, Fixed uses 2048.'
          htmlFor='colour-mode-select'
        />
        <div className='relative'>
          <select
            className={selectClass}
            id='colour-mode-select'
            name='colour-mode'
            aria-label='Colour mode'
            value={settings.colourMode}
            onChange={(event) =>
              onUpdateSettings({
                colourMode: event.target.value as RenderSettings['colourMode'],
              })
            }
          >
            {colourModeOptions.map((option) => (
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

      <PaletteEditor
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        algorithm={algorithm}
        navigation={navigation}
        onOpenChange={onPaletteEditorOpenChange}
      />

      <div className='space-y-2'>
        <LabelWithHelp
          label='Filters'
          tooltip='Post-processing effects applied to the canvas.'
          htmlFor='filter-select'
        />
        <div className='relative'>
          <select
            className={selectClass}
            id='filter-select'
            name='filter-mode'
            aria-label='Filters'
            value={settings.filterMode}
            onChange={(event) =>
              onUpdateSettings({
                filterMode: event.target.value as RenderSettings['filterMode'],
              })
            }
          >
            {filterOptions.map((option) => (
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

      <div className='space-y-2'>
        <LabelWithHelp
          label='Colour blend'
          tooltip='Blends neighbouring palette colours to soften banding without blurring detail.'
          htmlFor='colour-blend-range'
        />
        <input
          type='range'
          min={0}
          max={1}
          step={0.05}
          value={settings.paletteSmoothness}
          className={rangeClass}
          id='colour-blend-range'
          name='colour-blend'
          aria-label='Colour blend'
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            onUpdateSettings({
              paletteSmoothness: Math.min(1, Math.max(0, nextValue)),
            });
          }}
        />
      </div>

      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <LabelWithHelp
            label='Hue shift'
            tooltip='Rotates the hue of the final image.'
            htmlFor='hue-shift-range'
          />
          <span className={readoutBadgeClass}>{settings.hueRotate}</span>
        </div>
        <input
          type='range'
          min={-180}
          max={180}
          step={5}
          value={settings.hueRotate}
          className={rangeClass}
          id='hue-shift-range'
          name='hue-shift'
          aria-label='Hue shift'
          onChange={(event) => {
            const nextValue = Math.round(Number(event.target.value));
            onUpdateSettings({ hueRotate: nextValue });
          }}
        />
      </div>

      {settings.filterMode === 'gaussianSoft' && (
        <div className='space-y-2'>
          <LabelWithHelp
            label='Gaussian blur strength'
            tooltip='Applies a subtle blur in pixels. Lower values keep more detail.'
            htmlFor='gaussian-blur-range'
          />
          <input
            type='range'
            min={0}
            max={2}
            step={0.1}
            value={settings.gaussianBlur}
            className={rangeClass}
            id='gaussian-blur-range'
            name='gaussian-blur'
            aria-label='Gaussian blur strength'
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              onUpdateSettings({ gaussianBlur: Math.max(0, nextValue) });
            }}
          />
        </div>
      )}

      {settings.filterMode === 'dither' && (
        <div className='space-y-2'>
          <LabelWithHelp
            label='Dither strength'
            tooltip='Adds tiny colour variation to reduce flat banding without blurring detail.'
            htmlFor='dither-strength-range'
          />
          <input
            type='range'
            min={0}
            max={1}
            step={0.05}
            value={settings.ditherStrength}
            className={rangeClass}
            id='dither-strength-range'
            name='dither-strength'
            aria-label='Dither strength'
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              onUpdateSettings({ ditherStrength: Math.max(0, nextValue) });
            }}
          />
        </div>
      )}

      {settings.colourMode === 'cycle' && (
        <div className='space-y-2'>
          <LabelWithHelp
            label='Colour period'
            tooltip='Number of iterations per full palette cycle. Lower values repeat colours more often.'
            htmlFor='colour-period-range'
          />
          <input
            type='range'
            min={64}
            max={2048}
            step={64}
            value={settings.colourPeriod}
            className={rangeClass}
            id='colour-period-range'
            name='colour-period'
            aria-label='Colour period'
            onChange={(event) => {
              const nextValue = Math.round(Number(event.target.value));
              onUpdateSettings({ colourPeriod: Math.max(64, nextValue) });
            }}
          />
        </div>
      )}

      <ToggleControl
        checked={settings.smooth}
        label='Smooth colouring'
        tooltip='Interpolates between iteration bands for smoother gradients.'
        onClick={() => onUpdateSettings({ smooth: !settings.smooth })}
      />
    </>
  );
};

export default ColourFilterSettings;
