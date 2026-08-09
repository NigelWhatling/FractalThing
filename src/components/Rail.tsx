import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckIcon,
  ChipIcon,
  ColourIcon,
  GearIcon,
  HandIcon,
  LinkIcon,
  MarqueeIcon,
  MoonIcon,
  PanelLeftIcon,
  PanelRightIcon,
  ResetIcon,
  ShapesIcon,
  SlidersIcon,
  SunIcon,
  AlertIcon,
} from './icons';
import {
  PANEL_ORDER,
  PANEL_TITLES,
  RAIL_WIDTH,
  type InteractionMode,
  type PanelId,
} from '../state/ui';
import type { SafeAreaInsets } from '../hooks/useSafeAreaInsets';

const PANEL_ICONS: Record<PanelId, typeof ShapesIcon> = {
  fractal: ShapesIcon,
  colour: ColourIcon,
  renderer: ChipIcon,
  detail: SlidersIcon,
  interface: GearIcon,
};

const buttonClass =
  'flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-control border border-transparent text-dim transition hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none';

const activeClass = 'border-accent/50 bg-accent/15 text-accent';

type CopyStatus = 'idle' | 'copied' | 'failed';

type RailProps = {
  interactionMode: InteractionMode;
  onChangeInteractionMode: (mode: InteractionMode) => void;
  onReset: () => void;
  openPanel: PanelId | null;
  onTogglePanel: (panel: PanelId) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  position: 'left' | 'right';
  onTogglePosition: () => void;
  safeArea: SafeAreaInsets;
  shareUrl: string;
};

/**
 * The persistent 40px instrument strip. The left edge of the screen stays clear
 * because that is where you grab and drag the fractal.
 */
const Rail = ({
  interactionMode,
  onChangeInteractionMode,
  onReset,
  openPanel,
  onTogglePanel,
  theme,
  onToggleTheme,
  position,
  onTogglePosition,
  safeArea,
  shareUrl,
}: RailProps) => {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const copyTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) {
        globalThis.clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  const showTemporaryCopyStatus = useCallback((status: CopyStatus) => {
    setCopyStatus(status);
    if (copyTimerRef.current !== null) {
      globalThis.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = globalThis.setTimeout(
      () => {
        setCopyStatus('idle');
        copyTimerRef.current = null;
      },
      status === 'failed' ? 4000 : 1600,
    );
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showTemporaryCopyStatus('copied');
    } catch (error) {
      console.warn('Failed to copy link', error);
      showTemporaryCopyStatus('failed');
    }
  }, [shareUrl, showTemporaryCopyStatus]);

  const railSideInset = position === 'right' ? safeArea.right : safeArea.left;
  const railStyle = {
    width: RAIL_WIDTH + railSideInset,
    paddingTop: safeArea.top + 8,
    paddingRight: position === 'right' ? railSideInset : 0,
    paddingBottom: safeArea.bottom + 8,
    paddingLeft: position === 'left' ? railSideInset : 0,
  };

  return (
    <nav
      className={`fixed bottom-0 top-0 z-[55] flex flex-col items-center gap-1 overflow-x-hidden overflow-y-auto overscroll-contain border-rule bg-panel [scrollbar-width:none] backdrop-blur-md transition-colors hover:bg-panel-solid motion-reduce:transition-none [&::-webkit-scrollbar]:hidden ${
        position === 'right' ? 'right-0 border-l' : 'left-0 border-r'
      }`}
      style={railStyle}
      aria-label='Controls'
    >
      <div
        className='flex shrink-0 flex-col gap-1'
        role='group'
        aria-label='Interaction mode'
      >
        <button
          type='button'
          aria-label='Grab mode'
          aria-pressed={interactionMode === 'grab'}
          title='Grab'
          className={`${buttonClass} ${interactionMode === 'grab' ? activeClass : ''}`}
          onClick={() => onChangeInteractionMode('grab')}
        >
          <HandIcon className='h-4 w-4' />
        </button>
        <button
          type='button'
          aria-label='Select mode'
          aria-pressed={interactionMode === 'select'}
          title='Select'
          className={`${buttonClass} ${interactionMode === 'select' ? activeClass : ''}`}
          onClick={() => onChangeInteractionMode('select')}
        >
          <MarqueeIcon className='h-4 w-4' />
        </button>
        <button
          type='button'
          aria-label='Reset view'
          title='Reset view'
          className={buttonClass}
          onClick={onReset}
        >
          <ResetIcon className='h-4 w-4' />
        </button>
      </div>

      <hr className='my-1 w-5 shrink-0 border-0 border-t border-rule' />

      <div className='flex shrink-0 flex-col gap-1'>
        {PANEL_ORDER.map((panel) => {
          const PanelIcon = PANEL_ICONS[panel];
          const isOpen = openPanel === panel;
          return (
            <button
              key={panel}
              type='button'
              aria-label={`${PANEL_TITLES[panel]} settings`}
              aria-expanded={isOpen}
              aria-controls='settings-panel'
              title={PANEL_TITLES[panel]}
              className={`${buttonClass} ${isOpen ? activeClass : ''}`}
              onClick={() => onTogglePanel(panel)}
            >
              <PanelIcon className='h-4 w-4' />
            </button>
          );
        })}
      </div>

      <hr className='my-1 w-5 shrink-0 border-0 border-t border-rule' />

      <button
        type='button'
        aria-label='Copy link to this view'
        title={
          copyStatus === 'copied'
            ? 'Copied'
            : copyStatus === 'failed'
              ? 'Copy failed — try again'
              : 'Copy link'
        }
        className={`${buttonClass} ${
          copyStatus === 'copied'
            ? 'text-accent'
            : copyStatus === 'failed'
              ? 'text-danger'
              : ''
        }`}
        onClick={handleCopyLink}
      >
        {copyStatus === 'copied' ? (
          <CheckIcon className='h-4 w-4' />
        ) : copyStatus === 'failed' ? (
          <AlertIcon className='h-4 w-4' />
        ) : (
          <LinkIcon className='h-4 w-4' />
        )}
      </button>
      <span className='sr-only' role='status' aria-live='polite'>
        {copyStatus === 'copied'
          ? 'Link copied to clipboard'
          : copyStatus === 'failed'
            ? 'Could not copy link. Check clipboard permission and try again.'
            : ''}
      </span>

      <button
        type='button'
        aria-label={`Move controls to the ${position === 'right' ? 'left' : 'right'}`}
        title={`Move to the ${position === 'right' ? 'left' : 'right'}`}
        className={`${buttonClass} mt-auto`}
        onClick={onTogglePosition}
      >
        {position === 'right' ? (
          <PanelLeftIcon className='h-4 w-4' />
        ) : (
          <PanelRightIcon className='h-4 w-4' />
        )}
      </button>

      <button
        type='button'
        role='switch'
        aria-checked={theme === 'dark'}
        aria-label='Dark mode'
        title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        className={buttonClass}
        onClick={onToggleTheme}
      >
        {theme === 'dark' ? (
          <MoonIcon className='h-4 w-4' />
        ) : (
          <SunIcon className='h-4 w-4' />
        )}
      </button>
    </nav>
  );
};

export default Rail;
