import { useEffect, useState } from 'react';
import type { RenderSettings } from '../../state/settings';
import {
  getAnalyticsConsent,
  isAnalyticsEnabled,
  setAnalyticsConsent,
  setAnalyticsEnabled,
} from '../../util/analytics';
import { ToggleControl } from './DrawerPrimitives';
import { buttonClass } from './styles';

type InterfaceSettingsProps = {
  settings: RenderSettings;
  onUpdateSettings: (payload: Partial<RenderSettings>) => void;
  onResetSettings: () => void;
};

const InterfaceSettings = ({
  settings,
  onUpdateSettings,
  onResetSettings,
}: InterfaceSettingsProps) => {
  const [analyticsEnabled, setAnalyticsEnabledState] = useState(() =>
    isAnalyticsEnabled(),
  );

  useEffect(() => {
    const handleToggle = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled: boolean }>).detail;
      setAnalyticsEnabledState(detail?.enabled ?? isAnalyticsEnabled());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'fractal:analytics') {
        return;
      }
      setAnalyticsEnabledState(isAnalyticsEnabled());
    };
    globalThis.addEventListener('fractal-analytics-change', handleToggle);
    globalThis.addEventListener('storage', handleStorage);
    return () => {
      globalThis.removeEventListener('fractal-analytics-change', handleToggle);
      globalThis.removeEventListener('storage', handleStorage);
    };
  }, []);

  return (
    <>
      <div className='space-y-3'>
        <ToggleControl
          checked={settings.autoUpdateUrl}
          label='Auto update URL'
          tooltip='Keep the URL in sync with your current position and zoom.'
          onClick={() =>
            onUpdateSettings({ autoUpdateUrl: !settings.autoUpdateUrl })
          }
        />
        <ToggleControl
          checked={settings.railPosition === 'left'}
          label='Controls on the left'
          tooltip='Dock the control rail and its panels to the left edge instead of the right.'
          onClick={() =>
            onUpdateSettings({
              railPosition: settings.railPosition === 'left' ? 'right' : 'left',
            })
          }
        />
        <ToggleControl
          checked={settings.coordinateLabels === 'cartesian'}
          label='Use X / Y labels'
          tooltip='Label the coordinate readout X and Y instead of the complex-plane RE and IM.'
          onClick={() =>
            onUpdateSettings({
              coordinateLabels:
                settings.coordinateLabels === 'cartesian'
                  ? 'complex'
                  : 'cartesian',
            })
          }
        />
        <ToggleControl
          checked={settings.showMinimap}
          label='Show minimap'
          tooltip='Show an overview of the selected fractal and your current location.'
          onClick={() =>
            onUpdateSettings({ showMinimap: !settings.showMinimap })
          }
        />
        <ToggleControl
          checked={analyticsEnabled}
          label='Analytics'
          tooltip='Toggle anonymous usage analytics.'
          onClick={() => {
            const next = !analyticsEnabled;
            setAnalyticsEnabledState(next);
            setAnalyticsEnabled(next);
            if (next) {
              setAnalyticsConsent('yes');
              return;
            }
            if (getAnalyticsConsent() === 'unset') {
              setAnalyticsConsent('no');
            }
          }}
        />
      </div>
      <div>
        <button
          type='button'
          className={`${buttonClass} w-full`}
          onClick={onResetSettings}
        >
          Reset to Defaults
        </button>
      </div>
    </>
  );
};

export default InterfaceSettings;
