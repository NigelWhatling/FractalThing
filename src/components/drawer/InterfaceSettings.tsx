import { useEffect, useState } from 'react';
import type { RenderSettings } from '../../state/settings';
import {
  getAnalyticsConsent,
  isAnalyticsEnabled,
  setAnalyticsConsent,
  setAnalyticsEnabled,
} from '../../util/analytics';
import { ToggleControl } from './DrawerPrimitives';

type InterfaceSettingsProps = {
  settings: RenderSettings;
  onUpdateSettings: (payload: Partial<RenderSettings>) => void;
  onResetSettings: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

const InterfaceSettings = ({
  settings,
  onUpdateSettings,
  onResetSettings,
  theme,
  onToggleTheme,
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
          checked={theme === 'dark'}
          label='Dark mode'
          tooltip='Use the dark colour scheme for the interface.'
          onClick={onToggleTheme}
        />
        <ToggleControl
          checked={settings.autoUpdateUrl}
          label='Auto update URL'
          tooltip='Keep the URL in sync with your current position and zoom.'
          onClick={() =>
            onUpdateSettings({ autoUpdateUrl: !settings.autoUpdateUrl })
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
          className='w-full touch-manipulation rounded-xl border border-slate-200/70 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10'
          onClick={onResetSettings}
        >
          Reset to Defaults
        </button>
      </div>
    </>
  );
};

export default InterfaceSettings;
