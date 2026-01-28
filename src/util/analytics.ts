let analyticsInitialized = false;
const ANALYTICS_PREF_KEY = 'fractal:analytics';

export const isAnalyticsEnabled = () => {
  if (!('localStorage' in globalThis)) return false;
  const stored = globalThis.localStorage.getItem(ANALYTICS_PREF_KEY);
  if (!stored) return true;
  return stored !== 'off';
};

export const setAnalyticsEnabled = (enabled: boolean) => {
  if (!('localStorage' in globalThis)) return;
  globalThis.localStorage.setItem(ANALYTICS_PREF_KEY, enabled ? 'on' : 'off');
  globalThis.dispatchEvent(
    new CustomEvent('fractal-analytics-change', { detail: { enabled } }),
  );
};

const ensureGtag = () => {
  (globalThis as any).dataLayer = (globalThis as any).dataLayer || [];
  if (!(globalThis as any).gtag) {
    (globalThis as any).gtag = (...args: unknown[]) => {
      (globalThis as any).dataLayer.push(args);
    };
  }
};

export const initAnalytics = (measurementId: string) => {
  if (
    !measurementId ||
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
  (globalThis as any).gtag('js', new Date());
  (globalThis as any).gtag('config', measurementId, { send_page_view: false });
  analyticsInitialized = true;
};

export const trackPageView = (measurementId: string, pagePath: string) => {
  if (
    !measurementId ||
    !(globalThis as any).gtag ||
    !isAnalyticsEnabled() ||
    !analyticsInitialized
  ) {
    return;
  }

  (globalThis as any).gtag('event', 'page_view', {
    page_path: pagePath,
    page_location: globalThis.location.href,
    page_title: document.title,
  });
};
