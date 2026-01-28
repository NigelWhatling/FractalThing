let analyticsInitialized = false;
const ANALYTICS_PREF_KEY = 'fractal:analytics';
const ANALYTICS_CONSENT_KEY = 'fractal:analytics-consent';
const MEASUREMENT_ID_REGEX = /^G-[A-Z0-9]{6,}$/i;

const isValidMeasurementId = (measurementId: string) =>
  MEASUREMENT_ID_REGEX.test(measurementId);

export const isAnalyticsEnabled = () => {
  if (!('localStorage' in globalThis)) return false;
  const stored = globalThis.localStorage.getItem(ANALYTICS_PREF_KEY);
  if (!stored) return true;
  return stored !== 'off';
};

export const setAnalyticsEnabled = (enabled: boolean) => {
  if (!('localStorage' in globalThis)) return;
  // Disabling analytics stops future events but does not unload GA for the current session.
  globalThis.localStorage.setItem(ANALYTICS_PREF_KEY, enabled ? 'on' : 'off');
  globalThis.dispatchEvent(
    new CustomEvent('fractal-analytics-change', { detail: { enabled } }),
  );
};

export type AnalyticsConsent = 'yes' | 'no' | 'unset';

export const getAnalyticsConsent = (): AnalyticsConsent => {
  if (!('localStorage' in globalThis)) return 'unset';
  const stored = globalThis.localStorage.getItem(ANALYTICS_CONSENT_KEY);
  return stored === 'yes' || stored === 'no' ? stored : 'unset';
};

export const setAnalyticsConsent = (consent: AnalyticsConsent) => {
  if (!('localStorage' in globalThis)) return;

  if (consent === 'unset') {
    globalThis.localStorage.removeItem(ANALYTICS_CONSENT_KEY);
  } else {
    globalThis.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent);
  }

  globalThis.dispatchEvent(
    new CustomEvent('fractal-analytics-consent-change', { detail: { consent } }),
  );
};

const ensureGtag = () => {
  if (typeof document === 'undefined') return;
  globalThis.dataLayer ??= [];
  globalThis.gtag ??= (...args: unknown[]) => {
    globalThis.dataLayer?.push(args);
  };
};

export const initAnalytics = (measurementId: string) => {
  if (
    !measurementId ||
    !isValidMeasurementId(measurementId) ||
    analyticsInitialized ||
    typeof document === 'undefined' ||
    !isAnalyticsEnabled()
  ) {
    return;
  }

  const scriptId = 'ga-gtag';
  if (!document.getElementById(scriptId)) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
      measurementId,
    )}`;
    script.id = scriptId;
    document.head.appendChild(script);
  }

  ensureGtag();
  globalThis.gtag?.('js', new Date());
  globalThis.gtag?.('config', measurementId, { send_page_view: false });
  analyticsInitialized = true;
};

export const trackPageView = (measurementId: string, pagePath: string) => {
  if (
    !measurementId ||
    !isValidMeasurementId(measurementId) ||
    globalThis.document === undefined ||
    !globalThis.gtag ||
    !isAnalyticsEnabled() ||
    !analyticsInitialized
  ) {
    return;
  }

  globalThis.gtag('event', 'page_view', {
    page_path: pagePath,
    page_location: globalThis.location.href,
    page_title: document.title,
  });
};
