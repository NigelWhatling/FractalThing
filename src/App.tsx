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
import InteractionModeToggle, {
  type InteractionMode,
} from './components/InteractionModeToggle';
import SideDrawer from './components/SideDrawer';
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
  initAnalytics,
  isAnalyticsEnabled,
  trackPageView,
} from './util/analytics';

type WindowSize = {
  width: number;
  height: number;
};

type ThemeMode = 'light' | 'dark';

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

const formatNavValue = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const fixed = value.toFixed(15);
  return fixed.replace(/\.?0+$/, '');
};

const buildLocFromNav = (nav: { x: number; y: number; z: number }) =>
  `@${formatNavValue(nav.x)},${formatNavValue(nav.y)}x${formatNavValue(nav.z)}`;

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
  const [settings, dispatchSettings] = useReducer(
    settingsReducer,
    defaultSettings,
    loadStoredSettings,
  );
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>('grab');
  const [resetSignal, setResetSignal] = useState(0);
  const [uiOverlayOpen, setUiOverlayOpen] = useState(false);
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
      const locString = buildLocFromNav(defaultNav);
      const nextPath = `/${nextAlgorithm}/${locString}`;
      const nextSearch = searchParams.toString();
      navigate(`${nextPath}${nextSearch ? `?${nextSearch}` : ''}`);
    },
    [location.search, navigate],
  );

  useEffect(() => {
    const root = document.documentElement;
    const isDark = theme === 'dark';
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = theme;
    globalThis.localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if ('localStorage' in globalThis) {
      globalThis.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(settings),
      );
    }
  }, [settings]);

  return (
    <>
      <a
        href='#main'
        className='sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[60] focus-visible:rounded-full focus-visible:bg-white focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-slate-900 focus-visible:shadow-lg dark:focus-visible:bg-slate-900 dark:focus-visible:text-white'
      >
        Skip to content
      </a>
      <main
        id='main'
        tabIndex={-1}
        className='relative h-screen w-screen overflow-hidden bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100'
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        }}
      >
        <div
          className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.15),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(14,165,233,0.12),transparent_50%)] dark:opacity-80'
          aria-hidden
        />
        <SideDrawer
          settings={settings}
          onUpdateSettings={updateSettings}
          onResetSettings={handleResetSettings}
          algorithm={resolvedAlgorithm}
          onChangeAlgorithm={handleAlgorithmChange}
          theme={theme}
          onToggleTheme={() =>
            setTheme((value) => (value === 'dark' ? 'light' : 'dark'))
          }
          onOverlayChange={setUiOverlayOpen}
          loc={locParam}
        />
        <InteractionModeToggle
          value={interactionMode}
          onChange={setInteractionMode}
          onReset={() => setResetSignal((value) => value + 1)}
        />
        <FractalCanvas
          loc={locParam}
          width={width}
          height={height}
          settings={settings}
          interactionMode={interactionMode}
          resetSignal={resetSignal}
          uiOverlayOpen={uiOverlayOpen}
        />
      </main>
    </>
  );
};

const AnalyticsTracker = () => {
  const location = useLocation();
  const measurementId = import.meta.env.VITE_GA_ID;
  const [enabled, setEnabled] = useState(() => isAnalyticsEnabled());
  const shouldTrack = useMemo(
    () => import.meta.env.PROD && Boolean(measurementId) && enabled,
    [enabled, measurementId],
  );

  useEffect(() => {
    const handleToggle = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled: boolean }>).detail;
      setEnabled(detail?.enabled ?? isAnalyticsEnabled());
    };
    globalThis.addEventListener('fractal-analytics-change', handleToggle);
    return () => {
      globalThis.removeEventListener('fractal-analytics-change', handleToggle);
    };
  }, []);

  useEffect(() => {
    if (!shouldTrack || !measurementId) {
      return;
    }
    initAnalytics(measurementId);
  }, [measurementId, shouldTrack]);

  useEffect(() => {
    if (!shouldTrack || !measurementId) {
      return;
    }
    const path = `${location.pathname}${location.search}${location.hash}`;
    trackPageView(measurementId, path);
  }, [location.hash, location.pathname, location.search, measurementId, shouldTrack]);

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
      <Routes>
        <Route path='/' element={<FractalRoute />} />
        <Route path='/:algorithm' element={<FractalRoute />} />
        <Route path='/:algorithm/:loc' element={<FractalRoute />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
