import { useCallback, useEffect, useRef } from 'react';
import type { RenderSettings as RenderSettingsState } from '../state/settings';
import type { Navigation } from '../engine/viewport';
import type { FractalAlgorithm } from '../util/fractals';
import {
  APP_BUILD_TIME,
  formatBuildTimestamp,
  getVersionLabel,
} from '../util/version';
import { PANEL_TITLES, RAIL_WIDTH, type PanelId } from '../state/ui';
import type { SafeAreaInsets } from '../hooks/useSafeAreaInsets';
import { CloseIcon } from './icons';
import ColourFilterSettings from './drawer/ColourFilterSettings';
import FractalSettings from './drawer/FractalSettings';
import InterfaceSettings from './drawer/InterfaceSettings';
import { RefinementSettings } from './drawer/IterationRefinementSettings';
import RendererSettings from './drawer/RendererSettings';

type SettingsPanelProps = {
  panel: PanelId;
  railPosition: 'left' | 'right';
  asSheet: boolean;
  safeArea: SafeAreaInsets;
  onClose: () => void;
  settings: RenderSettingsState;
  onUpdateSettings: (payload: Partial<RenderSettingsState>) => void;
  onResetSettings: () => void;
  algorithm: FractalAlgorithm;
  onChangeAlgorithm: (algorithm: FractalAlgorithm) => void;
  navigation: Navigation;
  onPaletteEditorOpenChange: (open: boolean) => void;
  paletteEditorOpen: boolean;
};

/**
 * One panel at a time, expanding inward from the rail. On desktop the canvas is
 * inset to make room rather than being covered; below the `sm` breakpoint there
 * is not enough width for that, so the panel becomes a full-width sheet.
 */
const SettingsPanel = ({
  panel,
  railPosition,
  asSheet,
  safeArea,
  onClose,
  settings,
  onUpdateSettings,
  onResetSettings,
  algorithm,
  onChangeAlgorithm,
  navigation,
  onPaletteEditorOpenChange,
  paletteEditorOpen,
}: SettingsPanelProps) => {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const versionLabel = getVersionLabel();
  const buildLabel = formatBuildTimestamp(APP_BUILD_TIME);
  const railOffset =
    RAIL_WIDTH + (railPosition === 'right' ? safeArea.right : safeArea.left);
  const panelStyle = {
    top: safeArea.top,
    right:
      railPosition === 'right'
        ? railOffset
        : asSheet
          ? safeArea.right
          : undefined,
    bottom: safeArea.bottom,
    left:
      railPosition === 'left'
        ? railOffset
        : asSheet
          ? safeArea.left
          : undefined,
    maxWidth: `calc(100vw - ${RAIL_WIDTH + safeArea.left + safeArea.right}px)`,
    width: asSheet ? 'auto' : undefined,
  };

  useEffect(() => {
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      activeElement !== closeButtonRef.current
    ) {
      returnFocusRef.current = activeElement;
    }
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [panel]);

  useEffect(
    () => () => {
      const returnFocus = returnFocusRef.current;
      globalThis.requestAnimationFrame(() => {
        const activeElement = document.activeElement;
        const focusWasLost =
          activeElement === document.body ||
          activeElement === document.documentElement;
        if (focusWasLost && returnFocus?.isConnected) {
          returnFocus.focus({ preventScroll: true });
        }
      });
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
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
      onClose();
    },
    [onClose, paletteEditorOpen],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <aside
      id='settings-panel'
      aria-label={`${PANEL_TITLES[panel]} settings`}
      className={`fixed z-50 flex w-drawer flex-col border-rule bg-panel-solid backdrop-blur-md ${
        railPosition === 'right' ? 'border-l' : 'border-r'
      }`}
      style={panelStyle}
    >
      <div className='flex items-center justify-between border-b border-rule px-4 py-3'>
        <h2 className='text-micro font-semibold uppercase tracking-label text-dim'>
          {PANEL_TITLES[panel]}
        </h2>
        <button
          ref={closeButtonRef}
          type='button'
          title='Close'
          aria-label={`Close ${PANEL_TITLES[panel]} settings`}
          className='flex h-7 w-7 touch-manipulation items-center justify-center rounded-control border border-transparent text-dim transition hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none'
          onClick={onClose}
        >
          <CloseIcon className='h-4 w-4' />
        </button>
      </div>

      <div className='flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 text-ink'>
        {panel === 'fractal' && (
          <FractalSettings
            settings={settings}
            onUpdateSettings={onUpdateSettings}
            algorithm={algorithm}
            onChangeAlgorithm={onChangeAlgorithm}
          />
        )}

        {panel === 'colour' && (
          <ColourFilterSettings
            settings={settings}
            onUpdateSettings={onUpdateSettings}
            algorithm={algorithm}
            navigation={navigation}
            onPaletteEditorOpenChange={onPaletteEditorOpenChange}
          />
        )}

        {panel === 'renderer' && (
          <RendererSettings
            settings={settings}
            onUpdateSettings={onUpdateSettings}
          />
        )}

        {panel === 'detail' && (
          <RefinementSettings
            settings={settings}
            onUpdateSettings={onUpdateSettings}
          />
        )}

        {panel === 'interface' && (
          <>
            <InterfaceSettings
              settings={settings}
              onUpdateSettings={onUpdateSettings}
              onResetSettings={onResetSettings}
            />
            <div className='border-t border-rule pt-3 text-label text-dim'>
              <div className='font-semibold uppercase tracking-label'>
                Version {versionLabel}
              </div>
              <div className='mt-1 uppercase tracking-label'>
                Built {buildLabel}
              </div>
              <a
                href='https://github.com/NigelWhatling/FractalThing'
                target='_blank'
                rel='noreferrer'
                className='mt-2 inline-flex rounded-control text-label font-semibold uppercase tracking-label text-dim transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60'
              >
                View on GitHub
              </a>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};

export default SettingsPanel;
