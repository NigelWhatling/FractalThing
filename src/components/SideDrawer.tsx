import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RenderSettings } from '../state/settings';

type SideDrawerProps = {
  settings: RenderSettings;
  onUpdateSettings: (payload: Partial<RenderSettings>) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

const refinementOptions = [
  { label: 'Slow', steps: 7 },
  { label: 'Balanced', steps: 5 },
  { label: 'Fast', steps: 3 },
];

const finalQualityOptions = [
  { label: 'Large', value: 4 },
  { label: 'Medium', value: 2 },
  { label: 'Best', value: 1 },
];

const colourModeOptions = [
  { value: 'normalize', label: 'Normalise to max' },
  { value: 'cycle', label: 'Cycle palette' },
  { value: 'fixed', label: 'Fixed (2048)' },
];

const filterOptions = [
  { value: 'none', label: 'None' },
  { value: 'gaussianSoft', label: 'Gaussian blur' },
  { value: 'vivid', label: 'Vivid' },
  { value: 'mono', label: 'Mono' },
  { value: 'dither', label: 'Dither (banding)' },
];

type LabelWithHelpProps = {
  label: string;
  tooltip: string;
  variant?: 'subtitle' | 'body' | 'caption';
};

const LabelWithHelp = ({ label, tooltip, variant = 'subtitle' }: LabelWithHelpProps) => {
  const textClass =
    variant === 'caption'
      ? 'text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-white/50'
      : variant === 'body'
        ? 'text-sm text-slate-800 dark:text-white/90'
        : 'text-[11px] uppercase tracking-[0.14em] text-slate-600 dark:text-white/60';
  return (
    <div className="flex items-center gap-2">
      <span className={textClass}>{label}</span>
      <span
        className="cursor-help text-xs text-slate-400 dark:text-white/40"
        role="img"
        aria-label={`${label} info`}
        title={tooltip}
      >
        ⓘ
      </span>
    </div>
  );
};

const Section = ({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) => (
  <details
    className="group border-b border-slate-200/70 pb-6 dark:border-white/10"
    open={defaultOpen}
  >
    <summary className="flex cursor-pointer items-center justify-between py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600 dark:text-white/70 [&::-webkit-details-marker]:hidden">
      <span>{title}</span>
      <span className="transition-transform group-open:rotate-180">▾</span>
    </summary>
    <div className="space-y-4 pt-2">{children}</div>
  </details>
);

const SideDrawer = ({ settings, onUpdateSettings, theme, onToggleTheme }: SideDrawerProps) => {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const [tileSizeDraft, setTileSizeDraft] = useState(settings.tileSize);
  const [iterationsDraft, setIterationsDraft] = useState(settings.maxIterations);
  const [refinementPreset, setRefinementPreset] = useState(0);
  const [finalQualityPreset, setFinalQualityPreset] = useState(0);
  const [colourPeriodDraft, setColourPeriodDraft] = useState(settings.colourPeriod);
  const [autoIterationsScaleDraft, setAutoIterationsScaleDraft] = useState(
    settings.autoIterationsScale
  );
  const [gaussianBlurDraft, setGaussianBlurDraft] = useState(settings.gaussianBlur);
  const [ditherStrengthDraft, setDitherStrengthDraft] = useState(settings.ditherStrength);
  const [paletteSmoothnessDraft, setPaletteSmoothnessDraft] = useState(
    settings.paletteSmoothness
  );
  const [hueRotateDraft, setHueRotateDraft] = useState(settings.hueRotate);
  const [workerCountDraft, setWorkerCountDraft] = useState(settings.workerCount);

  const workerMax = useMemo(
    () => Math.max(1, typeof navigator === 'undefined' ? 8 : navigator.hardwareConcurrency || 8),
    []
  );

  useEffect(() => {
    setTileSizeDraft(settings.tileSize);
  }, [settings.tileSize]);

  useEffect(() => {
    setIterationsDraft(settings.maxIterations);
  }, [settings.maxIterations]);

  useEffect(() => {
    setColourPeriodDraft(settings.colourPeriod);
  }, [settings.colourPeriod]);

  useEffect(() => {
    setAutoIterationsScaleDraft(settings.autoIterationsScale);
  }, [settings.autoIterationsScale]);

  useEffect(() => {
    setGaussianBlurDraft(settings.gaussianBlur);
  }, [settings.gaussianBlur]);

  useEffect(() => {
    setDitherStrengthDraft(settings.ditherStrength);
  }, [settings.ditherStrength]);

  useEffect(() => {
    setPaletteSmoothnessDraft(settings.paletteSmoothness);
  }, [settings.paletteSmoothness]);

  useEffect(() => {
    setHueRotateDraft(settings.hueRotate);
  }, [settings.hueRotate]);

  useEffect(() => {
    setWorkerCountDraft(settings.workerCount);
  }, [settings.workerCount]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || drawerRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    const index = refinementOptions.findIndex(
      (preset) => preset.steps === settings.refinementStepsCount
    );
    setRefinementPreset(index === -1 ? 0 : index);
  }, [settings.refinementStepsCount]);

  useEffect(() => {
    const index = finalQualityOptions.findIndex(
      (option) => option.value === settings.finalBlockSize
    );
    setFinalQualityPreset(index === -1 ? 0 : index);
  }, [settings.finalBlockSize]);

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Open controls"
          className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/70 bg-white/70 text-lg text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.12)] backdrop-blur-xl transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900/70 dark:text-white/80 dark:shadow-[0_10px_24px_rgba(0,0,0,0.5)] dark:hover:border-white/30 dark:hover:text-white"
          onClick={() => setOpen(true)}
        >
          ☰
        </button>
      )}

      {open && (
        <aside
          className="fixed bottom-10 left-4 top-4 z-50 w-[340px] max-w-[92vw]"
          style={{ width: 340, maxWidth: '92vw' }}
          ref={drawerRef}
        >
          <button
            type="button"
            aria-label="Close controls"
            className="absolute right-[-44px] top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/70 bg-white/80 text-slate-600 transition hover:bg-white hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white"
            onClick={() => setOpen(false)}
            title="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div
            className="relative h-full overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.15)] dark:border-white/10 dark:bg-slate-900/70 dark:shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
            style={{ contain: 'paint' }}
          >
            <div className="flex h-full flex-col gap-6 overflow-y-auto overflow-x-hidden px-5 py-5 text-slate-900 dark:text-white">
              <Section title="Render settings" defaultOpen>
              <div className="space-y-2">
              <div className="flex items-center justify-between">
                <LabelWithHelp
                  label={settings.autoMaxIterations ? 'Base iterations' : 'Max iterations'}
                  tooltip={
                    settings.autoMaxIterations
                      ? 'Base escape-iteration cap. Auto mode adds extra iterations as you zoom.'
                      : 'Escape-iteration cap. Higher values reveal more detail but render slower.'
                  }
                  variant="body"
                />
                <span className="rounded-lg border border-slate-200/70 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-white/90">
                  {iterationsDraft}
                </span>
              </div>
              <input
                type="range"
                min={32}
                max={2048}
                step={32}
                value={iterationsDraft}
                className="w-full accent-cyan-400 dark:accent-cyan-300"
                onChange={(event) => {
                  const nextValue = Math.max(32, Math.round(Number(event.target.value)));
                  setIterationsDraft(nextValue);
                  onUpdateSettings({ maxIterations: nextValue });
                }}
              />
              <div className="flex justify-between text-[11px] text-slate-500 dark:text-white/40">
                <span>32</span>
                <span>2048</span>
              </div>
            </div>

            <div className="space-y-2">
              <LabelWithHelp
                label="Colour mode"
                tooltip="How iterations map to the palette: Normalise shifts with max, Cycle repeats, Fixed uses 2048."
              />
              <div className="relative">
                <select
                  className="w-full appearance-none rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 dark:border-white/10 dark:bg-white/5 dark:text-white/90 dark:hover:bg-white/10"
                  value={settings.colourMode}
                  onChange={(event) =>
                    onUpdateSettings({
                      colourMode: event.target.value as typeof settings.colourMode,
                    })
                  }
                >
                  {colourModeOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/60"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M7 10l5 5 5-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            <div className="space-y-2">
              <LabelWithHelp
                label="Filters"
                tooltip="Post-processing effects applied to the canvas."
              />
              <div className="relative">
                <select
                  className="w-full appearance-none rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 dark:border-white/10 dark:bg-white/5 dark:text-white/90 dark:hover:bg-white/10"
                  value={settings.filterMode}
                  onChange={(event) =>
                    onUpdateSettings({
                      filterMode: event.target.value as typeof settings.filterMode,
                    })
                  }
                >
                  {filterOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/60"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M7 10l5 5 5-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            <div className="space-y-2">
              <LabelWithHelp
                label="Colour blend"
                tooltip="Blends neighbouring palette colours to soften banding without blurring detail."
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={paletteSmoothnessDraft}
                className="w-full accent-cyan-400 dark:accent-cyan-300"
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setPaletteSmoothnessDraft(nextValue);
                  onUpdateSettings({ paletteSmoothness: Math.min(1, Math.max(0, nextValue)) });
                }}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <LabelWithHelp label="Hue shift" tooltip="Rotates the hue of the final image." />
                <span className="rounded-lg border border-slate-200/70 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-white/90">
                  {hueRotateDraft}
                </span>
              </div>
              <input
                type="range"
                min={-180}
                max={180}
                step={5}
                value={hueRotateDraft}
                className="w-full accent-cyan-400 dark:accent-cyan-300"
                onChange={(event) => {
                  const nextValue = Math.round(Number(event.target.value));
                  setHueRotateDraft(nextValue);
                  onUpdateSettings({ hueRotate: nextValue });
                }}
              />
            </div>

            {settings.filterMode === 'gaussianSoft' && (
              <div className="space-y-2">
                <LabelWithHelp
                  label="Gaussian blur strength"
                  tooltip="Applies a subtle blur in pixels. Lower values keep more detail."
                />
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={gaussianBlurDraft}
                  className="w-full accent-cyan-400 dark:accent-cyan-300"
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    setGaussianBlurDraft(nextValue);
                    onUpdateSettings({ gaussianBlur: Math.max(0, nextValue) });
                  }}
                />
              </div>
            )}

            {settings.filterMode === 'dither' && (
              <div className="space-y-2">
                <LabelWithHelp
                  label="Dither strength"
                  tooltip="Adds tiny colour variation to reduce flat banding without blurring detail."
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={ditherStrengthDraft}
                  className="w-full accent-cyan-400 dark:accent-cyan-300"
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    setDitherStrengthDraft(nextValue);
                    onUpdateSettings({ ditherStrength: Math.max(0, nextValue) });
                  }}
                />
              </div>
            )}

            {settings.colourMode === 'cycle' && (
              <div className="space-y-2">
                <LabelWithHelp
                  label="Colour period"
                  tooltip="Number of iterations per full palette cycle. Lower values repeat colours more often."
                />
                <input
                  type="range"
                  min={64}
                  max={2048}
                  step={64}
                  value={colourPeriodDraft}
                  className="w-full accent-cyan-400 dark:accent-cyan-300"
                  onChange={(event) => {
                    const nextValue = Math.round(Number(event.target.value));
                    setColourPeriodDraft(nextValue);
                    onUpdateSettings({ colourPeriod: Math.max(64, nextValue) });
                  }}
                />
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-slate-100/70 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                <LabelWithHelp
                  label="Smooth colouring"
                  tooltip="Interpolates between iteration bands for smoother gradients."
                  variant="body"
                />
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.smooth}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full border border-slate-200/70 transition dark:border-white/10 ${
                    settings.smooth
                      ? 'bg-cyan-500/25 dark:bg-cyan-400/30'
                      : 'bg-slate-300/70 dark:bg-white/15'
                  }`}
                  onClick={() => onUpdateSettings({ smooth: !settings.smooth })}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      settings.smooth ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-slate-100/70 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                <LabelWithHelp
                  label="Auto max iterations"
                  tooltip="Increase max iterations as you zoom in (log2 scale)."
                  variant="body"
                />
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.autoMaxIterations}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full border border-slate-200/70 transition dark:border-white/10 ${
                    settings.autoMaxIterations
                      ? 'bg-cyan-500/25 dark:bg-cyan-400/30'
                      : 'bg-slate-300/70 dark:bg-white/15'
                  }`}
                  onClick={() =>
                    onUpdateSettings({ autoMaxIterations: !settings.autoMaxIterations })
                  }
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      settings.autoMaxIterations ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            {settings.autoMaxIterations && (
              <div className="space-y-2">
                <LabelWithHelp
                  label="Auto iteration scale"
                  tooltip="Extra iterations added per zoom octave. Higher values sharpen deep zooms."
                />
                <input
                  type="range"
                  min={0}
                  max={512}
                  step={16}
                  value={autoIterationsScaleDraft}
                  className="w-full accent-cyan-400 dark:accent-cyan-300"
                  onChange={(event) => {
                    const nextValue = Math.max(0, Math.round(Number(event.target.value)));
                    setAutoIterationsScaleDraft(nextValue);
                    onUpdateSettings({ autoIterationsScale: nextValue });
                  }}
                />
              </div>
            )}
              </Section>

              <Section title="Advanced">
              <div className="space-y-2">
              <LabelWithHelp
                label="Tile size"
                tooltip="Size of render tiles in pixels. Smaller tiles update more granularly but add overhead."
              />
              <input
                type="range"
                min={32}
                max={512}
                step={32}
                value={tileSizeDraft}
                className="w-full accent-cyan-400 dark:accent-cyan-300"
                onChange={(event) => {
                  const nextValue = Math.max(32, Math.round(Number(event.target.value)));
                  setTileSizeDraft(nextValue);
                  onUpdateSettings({ tileSize: nextValue });
                }}
              />
            </div>

            <div className="space-y-2">
              <LabelWithHelp
                label="Worker count"
                tooltip="Number of render workers. Higher counts use more CPU."
              />
              <input
                type="range"
                min={1}
                max={workerMax}
                step={1}
                value={workerCountDraft}
                className="w-full accent-cyan-400 dark:accent-cyan-300"
                onChange={(event) => {
                  const nextValue = Math.max(1, Math.round(Number(event.target.value)));
                  setWorkerCountDraft(nextValue);
                  onUpdateSettings({ workerCount: nextValue });
                }}
              />
              <div className="flex justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-white/40">
                <span>1</span>
                <span>{workerMax}</span>
              </div>
            </div>

            <div className="space-y-2">
              <LabelWithHelp
                label="Refinement speed"
                tooltip="Number of progressive passes from coarse to fine."
              />
              <input
                type="range"
                min={0}
                max={refinementOptions.length - 1}
                step={1}
                value={refinementPreset}
                className="w-full accent-cyan-400 dark:accent-cyan-300"
                onChange={(event) => {
                  const index = Math.round(Number(event.target.value));
                  const preset = refinementOptions[index];
                  if (!preset) {
                    return;
                  }
                  setRefinementPreset(index);
                  onUpdateSettings({ refinementStepsCount: preset.steps });
                }}
              />
              <div className="flex justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-white/40">
                <span>Slow</span>
                <span>Fast</span>
              </div>
            </div>

            <div className="space-y-2">
              <LabelWithHelp
                label="Final quality"
                tooltip="Smallest block size used for the final pass."
              />
              <input
                type="range"
                min={0}
                max={finalQualityOptions.length - 1}
                step={1}
                value={finalQualityPreset}
                className="w-full accent-cyan-400 dark:accent-cyan-300"
                onChange={(event) => {
                  const index = Math.round(Number(event.target.value));
                  const option = finalQualityOptions[index];
                  if (!option) {
                    return;
                  }
                  setFinalQualityPreset(index);
                  onUpdateSettings({ finalBlockSize: option.value });
                }}
              />
              <div className="flex justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-white/40">
                <span>Large</span>
                <span>Best</span>
              </div>
            </div>
              </Section>

              <Section title="Interface">
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-slate-100/70 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                    <LabelWithHelp
                      label="Dark mode"
                      tooltip="Use the dark colour scheme for the interface."
                      variant="body"
                    />
                    <button
                      type="button"
                      role="switch"
                      aria-checked={theme === 'dark'}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full border border-slate-200/70 transition dark:border-white/10 ${
                        theme === 'dark'
                          ? 'bg-cyan-500/25 dark:bg-cyan-400/30'
                          : 'bg-slate-300/70 dark:bg-white/15'
                      }`}
                      onClick={onToggleTheme}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                          theme === 'dark' ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </Section>
            </div>
          </div>
        </aside>
      )}
    </>
  );
};

export default SideDrawer;
