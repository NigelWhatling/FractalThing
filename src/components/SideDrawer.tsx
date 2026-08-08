import { useCallback, useEffect, useRef, useState } from 'react';
import type { RenderSettings as RenderSettingsState } from '../state/settings';
import type { Navigation } from '../engine/viewport';
import type { FractalAlgorithm } from '../util/fractals';
import {
  APP_BUILD_TIME,
  formatBuildTimestamp,
  getVersionLabel,
} from '../util/version';
import { Section } from './drawer/DrawerPrimitives';
import InterfaceSettings from './drawer/InterfaceSettings';
import { RefinementSettings } from './drawer/IterationRefinementSettings';
import RendererSettings from './drawer/RendererSettings';
import RenderSettings from './drawer/RenderSettings';

type SideDrawerProps = {
  settings: RenderSettingsState;
  onUpdateSettings: (payload: Partial<RenderSettingsState>) => void;
  onResetSettings: () => void;
  algorithm: FractalAlgorithm;
  onChangeAlgorithm: (algorithm: FractalAlgorithm) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOverlayChange?: (open: boolean) => void;
  navigation: Navigation;
};

const SideDrawer = ({
  settings,
  onUpdateSettings,
  onResetSettings,
  algorithm,
  onChangeAlgorithm,
  theme,
  onToggleTheme,
  onOverlayChange,
  navigation,
}: SideDrawerProps) => {
  const [open, setOpen] = useState(false);
  const [paletteEditorOpen, setPaletteEditorOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const openButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerWasOpenRef = useRef(false);
  const versionLabel = getVersionLabel();
  const buildLabel = formatBuildTimestamp(APP_BUILD_TIME);
  const closeDrawer = useCallback(() => {
    setOpen(false);
  }, []);
  const handlePaletteEditorOpenChange = useCallback((nextOpen: boolean) => {
    setPaletteEditorOpen(nextOpen);
  }, []);

  useEffect(() => {
    onOverlayChange?.(open || paletteEditorOpen);
  }, [open, paletteEditorOpen, onOverlayChange]);

  useEffect(() => {
    if (open) {
      drawerWasOpenRef.current = true;
      closeButtonRef.current?.focus({ preventScroll: true });
      return;
    }
    if (!drawerWasOpenRef.current) {
      return;
    }
    drawerWasOpenRef.current = false;
    openButtonRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        !target ||
        drawerRef.current?.contains(target) ||
        (target instanceof Element &&
          target.closest('[data-palette-editor-overlay]'))
      ) {
        return;
      }
      closeDrawer();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        paletteEditorOpen ||
        (target instanceof Element &&
          target.closest('[data-palette-editor-overlay]'))
      ) {
        return;
      }
      event.preventDefault();
      closeDrawer();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeDrawer, open, paletteEditorOpen]);

  return (
    <>
      {!open && (
        <button
          ref={openButtonRef}
          type='button'
          aria-label='Open controls'
          aria-controls='control-drawer'
          aria-expanded={open}
          className='fixed left-4 top-4 z-50 flex h-10 w-10 touch-manipulation items-center justify-center rounded-xl border border-slate-200/70 bg-white/70 text-lg text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.12)] backdrop-blur-xl transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none dark:border-white/10 dark:bg-slate-900/70 dark:text-white/80 dark:shadow-[0_10px_24px_rgba(0,0,0,0.5)] dark:hover:border-white/30 dark:hover:text-white'
          onClick={() => setOpen(true)}
        >
          ☰
        </button>
      )}

      {open && (
        <aside
          id='control-drawer'
          className='fixed bottom-10 left-4 top-4 z-50 w-[340px] max-w-[92vw]'
          style={{ width: 340, maxWidth: '92vw' }}
          ref={drawerRef}
          aria-label='Controls'
        >
          <button
            ref={closeButtonRef}
            type='button'
            aria-label='Close controls'
            aria-controls='control-drawer'
            className='absolute right-[-44px] top-4 inline-flex h-9 w-9 touch-manipulation items-center justify-center rounded-xl border border-slate-200/70 bg-white/80 text-slate-600 transition hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white'
            onClick={closeDrawer}
            title='Close'
          >
            <svg
              className='h-5 w-5'
              viewBox='0 0 24 24'
              fill='none'
              aria-hidden='true'
            >
              <path
                d='M18 6L6 18M6 6l12 12'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
              />
            </svg>
          </button>
          <div
            className='relative h-full overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.15)] dark:border-white/10 dark:bg-slate-900/70 dark:shadow-[0_20px_60px_rgba(0,0,0,0.55)]'
            style={{ contain: 'paint' }}
          >
            <div className='flex h-full flex-col gap-6 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-5 text-slate-900 dark:text-white'>
              <Section title='Render Settings' defaultOpen>
                <RenderSettings
                  settings={settings}
                  onUpdateSettings={onUpdateSettings}
                  algorithm={algorithm}
                  onChangeAlgorithm={onChangeAlgorithm}
                  navigation={navigation}
                  onPaletteEditorOpenChange={handlePaletteEditorOpenChange}
                />
              </Section>

              <Section title='Advanced'>
                <RefinementSettings
                  settings={settings}
                  onUpdateSettings={onUpdateSettings}
                />
              </Section>

              <Section title='Experimental'>
                <RendererSettings
                  settings={settings}
                  onUpdateSettings={onUpdateSettings}
                />
              </Section>

              <Section title='Interface'>
                <InterfaceSettings
                  settings={settings}
                  onUpdateSettings={onUpdateSettings}
                  onResetSettings={onResetSettings}
                  theme={theme}
                  onToggleTheme={onToggleTheme}
                />
              </Section>

              <div className='border-t border-slate-200/70 pt-3 text-[10px] text-slate-500 dark:border-white/10 dark:text-white/40'>
                <div>
                  <div className='font-semibold uppercase tracking-[0.18em]'>
                    Version {versionLabel}
                  </div>
                  <div className='mt-1 uppercase tracking-[0.16em]'>
                    Built {buildLabel}
                  </div>
                  <a
                    href='https://github.com/NigelWhatling/FractalThing'
                    target='_blank'
                    rel='noreferrer'
                    className='mt-2 inline-flex text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 dark:text-white/40 dark:hover:text-white/70'
                  >
                    View on GitHub
                  </a>
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}
    </>
  );
};

export default SideDrawer;
