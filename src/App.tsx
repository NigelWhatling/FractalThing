import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import FractalCanvas from './components/FractalCanvas';
import InteractionModeToggle, { type InteractionMode } from './components/InteractionModeToggle';
import SideDrawer from './components/SideDrawer';
import { defaultSettings, settingsReducer } from './state/settings';

type WindowSize = {
  width: number;
  height: number;
};

type ThemeMode = 'light' | 'dark';

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
      resizeTimerRef.current = window.setTimeout(() => {
        setSize({ width: window.innerWidth, height: window.innerHeight });
        resizeTimerRef.current = null;
      }, 200);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
      }
    };
  }, []);

  return size;
};

const FractalRoute = () => {
  const { loc } = useParams();
  const location = useLocation();
  const { width, height } = useWindowSize();
  const [settings, dispatchSettings] = useReducer(settingsReducer, defaultSettings);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('grab');
  const [resetSignal, setResetSignal] = useState(0);
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
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }
    const stored = window.localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const updateSettings = useCallback(
    (payload: Partial<typeof defaultSettings>) => {
      dispatchSettings({ type: 'update', payload });
    },
    []
  );

  useEffect(() => {
    const root = document.documentElement;
    const isDark = theme === 'dark';
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = theme;
    window.localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.15),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(14,165,233,0.12),transparent_50%)] dark:opacity-80"
        aria-hidden
      />
      <SideDrawer
        settings={settings}
        onUpdateSettings={updateSettings}
        theme={theme}
        onToggleTheme={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
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
      />
    </div>
  );
};

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FractalRoute />} />
        <Route path="/:algorithm" element={<FractalRoute />} />
        <Route path="/:algorithm/:loc" element={<FractalRoute />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
