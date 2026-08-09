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
import { RAIL_WIDTH } from '../state/ui';

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
  const geo = useGeo(
    hasValidMeasurementId && analyticsEnabled && consent === 'unset',
  );

  useEffect(() => {
    const handleToggle = (event: Event) => {
      const detail = (event as CustomEvent<{ consent: AnalyticsConsent }>)
        .detail;
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
    globalThis.addEventListener(
      'fractal-analytics-consent-change',
      handleToggle,
    );
    globalThis.addEventListener(
      'fractal-analytics-change',
      handleAnalyticsToggle,
    );
    globalThis.addEventListener('storage', handleStorage);
    return () => {
      globalThis.removeEventListener(
        'fractal-analytics-consent-change',
        handleToggle,
      );
      globalThis.removeEventListener(
        'fractal-analytics-change',
        handleAnalyticsToggle,
      );
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

  const bottomOffset =
    'calc(var(--info-panel-height, 28px) + env(safe-area-inset-bottom) + 10px)';

  return (
    <div
      className='pointer-events-auto fixed z-[55] mx-auto max-w-xl rounded-panel border border-rule bg-panel-solid px-4 py-3 text-micro text-ink shadow-panel backdrop-blur-md'
      style={{
        right: `calc(${RAIL_WIDTH}px + env(safe-area-inset-right) + 0.75rem)`,
        bottom: bottomOffset,
        left: `calc(${RAIL_WIDTH}px + env(safe-area-inset-left) + 0.75rem)`,
      }}
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
            className='touch-manipulation rounded-control border border-rule-strong bg-raised px-3 py-2 text-label font-semibold uppercase tracking-label text-dim transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none'
            onClick={() => {
              setAnalyticsConsent('no');
              setAnalyticsEnabled(false);
            }}
          >
            Decline
          </button>
          <button
            type='button'
            className='touch-manipulation rounded-control border border-accent/60 bg-accent/15 px-3 py-2 text-label font-semibold uppercase tracking-label text-ink transition hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none'
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
