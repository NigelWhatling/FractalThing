import { useEffect, useMemo, useState } from 'react';
import {
  getAnalyticsConsent,
  isAnalyticsEnabled,
  isValidAnalyticsMeasurementId,
  setAnalyticsConsent,
  setAnalyticsEnabled,
  type AnalyticsConsent,
} from '../util/analytics';
import { useGeo } from '../util/geo';

const CONSENT_KEY = 'fractal:analytics-consent';
const ANALYTICS_KEY = 'fractal:analytics';

const CookieConsentBanner = () => {
  const measurementId = import.meta.env.VITE_GA_ID;
  const hasValidMeasurementId = Boolean(
    measurementId && isValidAnalyticsMeasurementId(measurementId),
  );
  const [consent, setConsentState] = useState<AnalyticsConsent>(() =>
    getAnalyticsConsent(),
  );
  const [analyticsEnabled, setAnalyticsEnabledState] = useState(() =>
    isAnalyticsEnabled(),
  );
  const geo = useGeo(hasValidMeasurementId && analyticsEnabled && consent === 'unset');

  useEffect(() => {
    const handleToggle = (event: Event) => {
      const detail = (event as CustomEvent<{ consent: AnalyticsConsent }>).detail;
      setConsentState(detail?.consent ?? getAnalyticsConsent());
    };
    const handleAnalyticsToggle = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled: boolean }>).detail;
      setAnalyticsEnabledState(detail?.enabled ?? isAnalyticsEnabled());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY) {
        setConsentState(getAnalyticsConsent());
        return;
      }
      if (event.key === ANALYTICS_KEY) {
        setAnalyticsEnabledState(isAnalyticsEnabled());
      }
    };
    globalThis.addEventListener('fractal-analytics-consent-change', handleToggle);
    globalThis.addEventListener('fractal-analytics-change', handleAnalyticsToggle);
    globalThis.addEventListener('storage', handleStorage);
    return () => {
      globalThis.removeEventListener('fractal-analytics-consent-change', handleToggle);
      globalThis.removeEventListener('fractal-analytics-change', handleAnalyticsToggle);
      globalThis.removeEventListener('storage', handleStorage);
    };
  }, []);

  const shouldShow = useMemo(() => {
    if (!hasValidMeasurementId) return false;
    if (geo.status !== 'ready') return false;
    if (!geo.isEu) return false;
    if (!analyticsEnabled) return false;
    return consent === 'unset';
  }, [analyticsEnabled, consent, geo.isEu, geo.status, hasValidMeasurementId]);

  if (!shouldShow) {
    return null;
  }

  const bottomOffset = 'calc(var(--info-panel-height, 28px) + 10px)';

  return (
    <div
      className='pointer-events-auto fixed left-3 right-3 z-[55] mx-auto max-w-xl rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-[11px] text-white/80 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-md'
      style={{ bottom: bottomOffset }}
      role='region'
      aria-label='Cookie consent'
    >
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='text-balance pr-2 leading-snug'>
          This site uses analytics cookies to understand usage in aggregate.
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <button
            type='button'
            className='touch-manipulation rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none'
            onClick={() => {
              setAnalyticsConsent('no');
              setAnalyticsEnabled(false);
            }}
          >
            Decline
          </button>
          <button
            type='button'
            className='touch-manipulation rounded-lg border border-cyan-400/30 bg-cyan-400/15 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none'
            onClick={() => {
              setAnalyticsConsent('yes');
              setAnalyticsEnabled(true);
            }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsentBanner;
