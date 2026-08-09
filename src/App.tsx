import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import FractalCanvas from './components/FractalCanvas';
import Rail from './components/Rail';
import {
  PANEL_WIDTH,
  RAIL_WIDTH,
  type InteractionMode,
  type PanelId,
} from './state/ui';
import SettingsPanel from './components/SettingsPanel';
import CookieConsentBanner from './components/CookieConsentBanner';
import {
  defaultSettings,
  settingsReducer,
  type RenderSettings,
} from './state/settings';
import {
  getDefaultView,
  normaliseAlgorithm,
  type FractalAlgorithm,
} from './util/fractals';
import {
  APP_BUILD_TIME,
  APP_COMMIT,
  APP_VERSION,
  formatBuildTimestamp,
} from './util/version';
import {
  getAnalyticsConsent,
  initAnalytics,
  isAnalyticsEnabled,
  isValidAnalyticsMeasurementId,
  trackPageView,
  type AnalyticsConsent,
} from './util/analytics';
import { accentFrom, formatAccentChannels } from './util/accent';
import { useGeo } from './util/geo';
import { applySeo, buildSeoPayload } from './util/seo';
import { formatNavigation, navigationFromView } from './engine/viewport';
import { useFractalNavigation } from './hooks/useFractalNavigation';
import { useSafeAreaInsets } from './hooks/useSafeAreaInsets';

type WindowSize = {
  width: number;
  height: number;
};

type ThemeMode = 'light' | 'dark';

/** Below this the panel covers the canvas as a sheet instead of insetting it. */
const SHEET_BREAKPOINT = 640;

const SETTINGS_STORAGE_KEY = 'fractal-thing-settings';

const getDefaultSettings = (): RenderSettings => ({
  ...defaultSettings,
  paletteStops: defaultSettings.paletteStops.map((stop) => ({ ...stop })),
});

const loadStoredSettings = (): RenderSettings => {
  const base = getDefaultSettings();
  if (!('localStorage' in globalThis)) return base;
  const raw = globalThis.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) {
    return base;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<RenderSettings>;
    if (!parsed || typeof parsed !== 'object') {
      return base;
    }
    const renderBackend = parsed.renderBackend === 'gpu' ? 'gpu' : 'cpu';
    const railPosition = parsed.railPosition === 'left' ? 'left' : 'right';
    const coordinateLabels =
      parsed.coordinateLabels === 'cartesian' ? 'cartesian' : 'complex';
    const gpuPrecision =
      parsed.gpuPrecision === 'double' || parsed.gpuPrecision === 'limb'
        ? parsed.gpuPrecision
        : 'single';
    const gpuLimbProfile =
      parsed.gpuLimbProfile === 'high' ||
      parsed.gpuLimbProfile === 'extreme' ||
      parsed.gpuLimbProfile === 'ultra'
        ? parsed.gpuLimbProfile
        : 'balanced';
    const paletteStops = Array.isArray(parsed.paletteStops)
      ? parsed.paletteStops
          .filter((stop): stop is { position: number; colour: string } =>
            Boolean(stop && typeof stop === 'object'),
          )
          .map((stop) => ({
            position: Number(stop.position),
            colour: String(stop.colour),
          }))
      : null;

    return {
      ...base,
      ...parsed,
      renderBackend,
      railPosition,
      coordinateLabels,
      gpuPrecision,
      gpuLimbProfile,
      paletteStops:
        paletteStops && paletteStops.length >= 2
          ? paletteStops
          : base.paletteStops,
    };
  } catch (error) {
    console.warn('Failed to parse stored settings', error);
    return base;
  }
};

const useWindowSize = (): WindowSize => {
  const [size, setSize] = useState<WindowSize>({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const resizeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleResize = () => {
      if (resizeTimerRef.current !== null) {
        return;
      }
      resizeTimerRef.current = globalThis.setTimeout(() => {
        setSize({ width: window.innerWidth, height: window.innerHeight });
        resizeTimerRef.current = null;
      }, 200);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimerRef.current !== null) {
        globalThis.clearTimeout(resizeTimerRef.current);
      }
    };
  }, []);

  return size;
};

const FractalRoute = () => {
  const { loc, algorithm } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { width, height } = useWindowSize();
  const safeArea = useSafeAreaInsets();
  const [settings, dispatchSettings] = useReducer(
    settingsReducer,
    defaultSettings,
    loadStoredSettings,
  );
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>('grab');
  const [resetSignal, setResetSignal] = useState(0);
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);
  const [paletteEditorOpen, setPaletteEditorOpen] = useState(false);
  const locParam = useMemo(() => {
    if (loc) {
      return loc;
    }
    const searchParams = new URLSearchParams(location.search);
    const xParam = searchParams.get('x');
    const yParam = searchParams.get('y');
    const zParam = searchParams.get('z');
    if (xParam && yParam) {
      const x = Number(xParam);
      const y = Number(yParam);
      const z = zParam ? Number(zParam) : 1;
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        return `@${xParam},${yParam}x${zParam ?? '1'}`;
      }
    }
    return undefined;
  }, [loc, location.search]);
  const resolvedAlgorithm = useMemo(
    () => normaliseAlgorithm(algorithm),
    [algorithm],
  );
  const { navigation, setNavigation } = useFractalNavigation({
    algorithm: resolvedAlgorithm,
    loc: locParam,
    resetSignal,
    autoUpdateUrl: settings.autoUpdateUrl,
  });
  const isRootRoute = !algorithm;
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (!('localStorage' in globalThis)) return 'dark';
    const stored = globalThis.localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return globalThis.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });
  const updateSettings = useCallback(
    (payload: Partial<typeof defaultSettings>) => {
      dispatchSettings({ type: 'update', payload });
    },
    [],
  );
  const handleTogglePanel = useCallback((panel: PanelId) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  }, []);
  const handleClosePanel = useCallback(() => {
    setOpenPanel(null);
  }, []);
  const handleResetSettings = useCallback(() => {
    dispatchSettings({ type: 'update', payload: getDefaultSettings() });
    if ('localStorage' in globalThis) {
      globalThis.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    }
  }, []);

  const handleAlgorithmChange = useCallback(
    (nextAlgorithm: FractalAlgorithm) => {
      const searchParams = new URLSearchParams(location.search);
      searchParams.delete('loc');
      searchParams.delete('x');
      searchParams.delete('y');
      searchParams.delete('z');
      const defaultNav = getDefaultView(nextAlgorithm);
      const locString = formatNavigation(navigationFromView(defaultNav));
      const nextPath = `/${nextAlgorithm}/${locString}`;
      const nextSearch = searchParams.toString();
      navigate(`${nextPath}${nextSearch ? `?${nextSearch}` : ''}`);
    },
    [location.search, navigate],
  );

  useEffect(() => {
    applySeo(buildSeoPayload(resolvedAlgorithm, { isRoot: isRootRoute }));
  }, [isRootRoute, resolvedAlgorithm]);

  useEffect(() => {
    const root = document.documentElement;
    const isDark = theme === 'dark';
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = theme;
    globalThis.localStorage.setItem('theme', theme);
  }, [theme]);

  // The chrome borrows its accent from the palette, so editing the palette
  // recolours rings, switches and the precision rule along with the fractal.
  useEffect(() => {
    const accent = accentFrom(settings.paletteStops, theme);
    const root = document.documentElement;
    root.style.setProperty('--ft-accent-rgb', formatAccentChannels(accent));
  }, [settings.paletteStops, theme]);

  useEffect(() => {
    if ('localStorage' in globalThis) {
      globalThis.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(settings),
      );
    }
  }, [settings]);

  // The panel shifts the canvas rather than covering or resizing it, so opening
  // it never hides the region being inspected and never triggers a re-render.
  // There is no room for the shift on a phone, so below the breakpoint the
  // panel becomes a sheet and the canvas is left where it is.
  const usableWidth = Math.max(1, width - safeArea.left - safeArea.right);
  const asSheet = usableWidth < SHEET_BREAKPOINT;
  const panelInset = openPanel && !asSheet ? PANEL_WIDTH : 0;
  const canvasWidth = Math.max(1, usableWidth - RAIL_WIDTH);
  const canvasHeight = Math.max(1, height - safeArea.top - safeArea.bottom);
  const visibleCanvasWidth = Math.max(1, canvasWidth - panelInset);
  const railOnLeft = settings.railPosition === 'left';
  const canvasOffsetLeft =
    safeArea.left + (railOnLeft ? RAIL_WIDTH + panelInset : 0);
  const uiOverlayOpen = paletteEditorOpen || (asSheet && openPanel !== null);
  const shareUrl = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    searchParams.delete('loc');
    searchParams.delete('x');
    searchParams.delete('y');
    searchParams.delete('z');
    const path = `/${resolvedAlgorithm}/${formatNavigation(navigation)}`;
    const search = searchParams.toString();
    return new URL(
      `${path}${search ? `?${search}` : ''}${location.hash}`,
      globalThis.location.origin,
    ).href;
  }, [location.hash, location.search, navigation, resolvedAlgorithm]);

  return (
    <>
      <a
        href='#main'
        className='sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[60] focus-visible:rounded-panel focus-visible:bg-void focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-ink focus-visible:shadow-panel'
      >
        Skip to content
      </a>
      <main
        id='main'
        tabIndex={-1}
        className='relative h-screen w-screen overflow-hidden bg-void text-ink'
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        }}
      >
        <FractalCanvas
          algorithm={resolvedAlgorithm}
          navigation={navigation}
          setNavigation={setNavigation}
          width={canvasWidth}
          visibleWidth={visibleCanvasWidth}
          offsetLeft={canvasOffsetLeft}
          offsetTop={safeArea.top}
          height={canvasHeight}
          settings={settings}
          interactionMode={interactionMode}
          resetSignal={resetSignal}
          uiOverlayOpen={uiOverlayOpen}
          onOpenPanel={setOpenPanel}
        />
        <Rail
          interactionMode={interactionMode}
          onChangeInteractionMode={setInteractionMode}
          onReset={() => setResetSignal((value) => value + 1)}
          openPanel={openPanel}
          onTogglePanel={handleTogglePanel}
          theme={theme}
          onToggleTheme={() =>
            setTheme((value) => (value === 'dark' ? 'light' : 'dark'))
          }
          position={settings.railPosition}
          safeArea={safeArea}
          shareUrl={shareUrl}
          onTogglePosition={() =>
            updateSettings({ railPosition: railOnLeft ? 'right' : 'left' })
          }
        />
        {openPanel && (
          <SettingsPanel
            panel={openPanel}
            railPosition={settings.railPosition}
            asSheet={asSheet}
            safeArea={safeArea}
            onClose={handleClosePanel}
            settings={settings}
            onUpdateSettings={updateSettings}
            onResetSettings={handleResetSettings}
            algorithm={resolvedAlgorithm}
            onChangeAlgorithm={handleAlgorithmChange}
            navigation={navigation}
            onPaletteEditorOpenChange={setPaletteEditorOpen}
            paletteEditorOpen={paletteEditorOpen}
          />
        )}
      </main>
    </>
  );
};

const AnalyticsTracker = () => {
  const location = useLocation();
  const measurementId = import.meta.env.VITE_GA_ID;
  const validMeasurementId =
    measurementId && isValidAnalyticsMeasurementId(measurementId)
      ? measurementId
      : null;
  const [enabled, setEnabled] = useState(() => isAnalyticsEnabled());
  const [consent, setConsent] = useState<AnalyticsConsent>(() =>
    getAnalyticsConsent(),
  );
  const needsGeo =
    import.meta.env.PROD &&
    Boolean(validMeasurementId) &&
    enabled &&
    consent === 'unset';
  const geo = useGeo(needsGeo);
  const shouldTrack = useMemo(() => {
    if (!import.meta.env.PROD) return false;
    if (!validMeasurementId) return false;
    if (!enabled) return false;
    if (consent === 'yes') return true;
    if (consent === 'no') return false;
    if (geo.status !== 'ready') return false;
    return !geo.isEu;
  }, [consent, enabled, geo.isEu, geo.status, validMeasurementId]);

  useEffect(() => {
    const handleToggle = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled: boolean }>).detail;
      setEnabled(detail?.enabled ?? isAnalyticsEnabled());
    };
    const handleConsentToggle = (event: Event) => {
      const detail = (event as CustomEvent<{ consent: AnalyticsConsent }>)
        .detail;
      setConsent(detail?.consent ?? getAnalyticsConsent());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'fractal:analytics') {
        setEnabled(isAnalyticsEnabled());
        return;
      }
      if (event.key === 'fractal:analytics-consent') {
        setConsent(getAnalyticsConsent());
      }
    };
    globalThis.addEventListener('fractal-analytics-change', handleToggle);
    globalThis.addEventListener(
      'fractal-analytics-consent-change',
      handleConsentToggle,
    );
    globalThis.addEventListener('storage', handleStorage);
    return () => {
      globalThis.removeEventListener('fractal-analytics-change', handleToggle);
      globalThis.removeEventListener(
        'fractal-analytics-consent-change',
        handleConsentToggle,
      );
      globalThis.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!shouldTrack || !validMeasurementId) {
      return;
    }
    initAnalytics(validMeasurementId);
  }, [shouldTrack, validMeasurementId]);

  useEffect(() => {
    if (!shouldTrack || !validMeasurementId) {
      return;
    }
    const path = `${location.pathname}${location.search}${location.hash}`;
    trackPageView(validMeasurementId, path);
  }, [
    location.hash,
    location.pathname,
    location.search,
    shouldTrack,
    validMeasurementId,
  ]);

  return null;
};

const App = () => {
  useEffect(() => {
    const buildLabel = formatBuildTimestamp(APP_BUILD_TIME);
    const commitLabel = APP_COMMIT === 'unknown' ? 'unknown' : APP_COMMIT;
    console.info(
      `[FractalThing] Version ${APP_VERSION} (${commitLabel}) built ${buildLabel}`,
    );
  }, []);

  return (
    <BrowserRouter>
      <AnalyticsTracker />
      <CookieConsentBanner />
      <Routes>
        <Route path='/' element={<FractalRoute />} />
        <Route path='/:algorithm' element={<FractalRoute />} />
        <Route path='/:algorithm/:loc' element={<FractalRoute />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
