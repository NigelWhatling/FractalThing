let analyticsInitialized = false;
const ANALYTICS_PREF_KEY = 'fractal:analytics';

export const isAnalyticsEnabled = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  const stored = window.localStorage.getItem(ANALYTICS_PREF_KEY);
  if (!stored) {
    return true;
  }
  return stored !== 'off';
};

export const setAnalyticsEnabled = (enabled: boolean) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(ANALYTICS_PREF_KEY, enabled ? 'on' : 'off');
  window.dispatchEvent(
    new CustomEvent('fractal-analytics-change', { detail: { enabled } })
  );
};

const ensureGtag = () => {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = (...args: unknown[]) => {
      window.dataLayer.push(args);
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
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false });
  analyticsInitialized = true;
};

export const trackPageView = (measurementId: string, pagePath: string) => {
  if (!measurementId || !window.gtag || !isAnalyticsEnabled()) {
    return;
  }

  window.gtag('event', 'page_view', {
    page_path: pagePath,
    page_location: window.location.href,
    page_title: document.title,
  });
};
