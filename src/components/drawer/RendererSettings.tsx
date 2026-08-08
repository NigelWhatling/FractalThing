import type { RenderSettings } from '../../state/settings';
import { LabelWithHelp, SelectChevron } from './DrawerPrimitives';

const rendererOptions = [
  { value: 'cpu', label: 'CPU (workers)' },
  { value: 'gpu-single', label: 'GPU single (fast)' },
  { value: 'gpu-double', label: 'GPU double (slow, higher precision)' },
  { value: 'gpu-limb', label: 'GPU multi-limb (very slow, highest precision)' },
];

const limbProfileOptions = [
  { value: 'balanced', label: 'Balanced (40-bit fractional)' },
  { value: 'high', label: 'High (60-bit fractional)' },
  { value: 'extreme', label: 'Extreme (70-bit fractional)' },
  { value: 'ultra', label: 'Ultra (80-bit fractional)' },
];

type RendererSettingsProps = {
  settings: RenderSettings;
  onUpdateSettings: (payload: Partial<RenderSettings>) => void;
};

const RendererSettings = ({
  settings,
  onUpdateSettings,
}: RendererSettingsProps) => {
  const currentRenderer =
    settings.renderBackend === 'cpu'
      ? 'cpu'
      : settings.gpuPrecision === 'double'
        ? 'gpu-double'
        : settings.gpuPrecision === 'limb'
          ? 'gpu-limb'
          : 'gpu-single';

  const handleRendererChange = (value: string) => {
    switch (value) {
      case 'gpu-double':
        onUpdateSettings({ renderBackend: 'gpu', gpuPrecision: 'double' });
        return;
      case 'gpu-limb':
        onUpdateSettings({ renderBackend: 'gpu', gpuPrecision: 'limb' });
        return;
      case 'gpu-single':
        onUpdateSettings({ renderBackend: 'gpu', gpuPrecision: 'single' });
        return;
      case 'cpu':
      default:
        onUpdateSettings({ renderBackend: 'cpu' });
    }
  };

  return (
    <>
      <div className='space-y-2'>
        <LabelWithHelp
          label='Renderer'
          tooltip='Experimental GPU path. Multi-limb is slowest but highest precision. Distribution colouring is not supported on GPU.'
          htmlFor='renderer-select'
        />
        <div className='relative'>
          <select
            className='w-full touch-manipulation appearance-none rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 dark:border-white/10 dark:bg-white/5 dark:text-white/90 dark:hover:bg-white/10'
            id='renderer-select'
            name='renderer'
            aria-label='Renderer'
            value={currentRenderer}
            onChange={(event) => handleRendererChange(event.target.value)}
          >
            {rendererOptions.map((option) => (
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

      {settings.renderBackend === 'gpu' && settings.gpuPrecision === 'limb' && (
        <div className='space-y-2'>
          <LabelWithHelp
            label='Limb profile'
            tooltip='Controls how many fractional limbs are used. Higher values increase precision but reduce integer range.'
            htmlFor='limb-profile-select'
          />
          <div className='relative'>
            <select
              className='w-full touch-manipulation appearance-none rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 dark:border-white/10 dark:bg-white/5 dark:text-white/90 dark:hover:bg-white/10'
              id='limb-profile-select'
              name='limb-profile'
              aria-label='Limb profile'
              value={settings.gpuLimbProfile}
              onChange={(event) =>
                onUpdateSettings({
                  gpuLimbProfile: event.target
                    .value as RenderSettings['gpuLimbProfile'],
                })
              }
            >
              {limbProfileOptions.map((option) => (
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
      )}
    </>
  );
};

export default RendererSettings;
