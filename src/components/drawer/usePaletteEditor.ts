import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import type { RenderSettings } from '../../state/settings';
import type { PaletteStop } from '../../util/PaletteGenerator';
import { BUILTIN_PALETTES, type PalettePreset } from '../../util/palettes';

const PALETTE_STORAGE_KEY = 'fractal:palettes';
const PALETTE_STORAGE_ERROR =
  'Could not save palettes in this browser. Allow site storage or free some space, then try again.';

export const storePalettePresets = (
  storage: Pick<Storage, 'setItem'>,
  palettes: PalettePreset[],
) => {
  try {
    storage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(palettes));
    return true;
  } catch {
    return false;
  }
};

const stopsEqual = (first: PaletteStop[], second: PaletteStop[]) =>
  first.length === second.length &&
  first.every(
    (stop, index) =>
      stop.position === second[index]?.position &&
      stop.colour === second[index]?.colour,
  );

const changePaletteStop = (
  stops: PaletteStop[],
  index: number,
  partial: Partial<PaletteStop>,
) => {
  let nextPartial = partial;
  if (partial.position !== undefined) {
    const orderedStops = stops
      .map((stop, stopIndex) => ({
        position: stop.position,
        index: stopIndex,
      }))
      .sort((first, second) => first.position - second.position);
    const currentIndex = orderedStops.findIndex((stop) => stop.index === index);
    const epsilon = 0.005;
    const min =
      currentIndex > 0 ? orderedStops[currentIndex - 1].position + epsilon : 0;
    const max =
      currentIndex < orderedStops.length - 1
        ? orderedStops[currentIndex + 1].position - epsilon
        : 1;
    nextPartial = {
      ...partial,
      position: Math.min(Math.max(min, max), Math.max(min, partial.position)),
    };
  }
  return stops.map((stop, stopIndex) =>
    stopIndex === index ? { ...stop, ...nextPartial } : stop,
  );
};

const getPaletteModalFocusables = (container: HTMLElement | null) => {
  if (!container) {
    return [];
  }
  const focusableSelector =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(
    container.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter(
    (element) =>
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-hidden') !== 'true',
  );
};

type UsePaletteEditorOptions = {
  settings: RenderSettings;
  onUpdateSettings: (payload: Partial<RenderSettings>) => void;
  onOpenChange?: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

export const usePaletteEditor = ({
  settings,
  onUpdateSettings,
  onOpenChange,
  triggerRef,
}: UsePaletteEditorOptions) => {
  const [paletteStopsDraft, setPaletteStopsDraft] = useState<PaletteStop[]>(
    settings.paletteStops,
  );
  const [paletteNameDraft, setPaletteNameDraft] = useState('');
  const [paletteModalOpen, setPaletteModalOpen] = useState(false);
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(
    null,
  );
  const [customPalettes, setCustomPalettes] = useState<PalettePreset[]>(() => {
    if (!('localStorage' in globalThis)) return [];
    try {
      const stored = globalThis.localStorage.getItem(PALETTE_STORAGE_KEY);
      if (!stored) {
        return [];
      }
      const parsed = JSON.parse(stored) as PalettePreset[];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((preset) => preset && Array.isArray(preset.stops));
    } catch {
      return [];
    }
  });
  const [activePresetId, setActivePresetId] = useState<string>(() => {
    const match = [...BUILTIN_PALETTES, ...customPalettes].find((preset) =>
      stopsEqual(preset.stops, settings.paletteStops),
    );
    return match?.id ?? 'current';
  });
  const [editingPaletteId, setEditingPaletteId] = useState<string | null>(null);
  const [paletteStorageError, setPaletteStorageError] = useState<string | null>(
    null,
  );
  const paletteDragIndexRef = useRef<number | null>(null);
  const palettePendingRef = useRef<{ index: number; startX: number } | null>(
    null,
  );

  const paletteBarRef = useRef<HTMLDivElement | null>(null);
  const paletteModalRef = useRef<HTMLDivElement | null>(null);
  const paletteReturnFocusRef = useRef<HTMLElement | null>(null);
  const paletteWasOpenRef = useRef(false);

  const palettePresets = useMemo(
    () => [...BUILTIN_PALETTES, ...customPalettes],
    [customPalettes],
  );

  useEffect(() => {
    const matchingPreset = palettePresets.find((preset) =>
      stopsEqual(preset.stops, settings.paletteStops),
    );
    const nextPresetId = matchingPreset?.id ?? 'current';
    // The preset list and persisted render settings are external state sources.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivePresetId((current) =>
      current === nextPresetId ? current : nextPresetId,
    );
  }, [palettePresets, settings.paletteStops]);

  useEffect(() => {
    if (paletteModalOpen) {
      return;
    }
    // Persisted/settings-driven palette changes remain visible while the
    // editor is closed without remounting its focus-return boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaletteStopsDraft((current) =>
      stopsEqual(current, settings.paletteStops)
        ? current
        : settings.paletteStops.map((stop) => ({ ...stop })),
    );
  }, [paletteModalOpen, settings.paletteStops]);

  const isBuiltinPalette = useMemo(
    () => new Set(BUILTIN_PALETTES.map((palette) => palette.id)),
    [],
  );

  const baselinePaletteStops = useMemo(() => {
    if (!editingPaletteId || editingPaletteId === 'current') {
      return settings.paletteStops;
    }
    const preset = palettePresets.find(
      (option) => option.id === editingPaletteId,
    );
    return preset?.stops ?? settings.paletteStops;
  }, [editingPaletteId, palettePresets, settings.paletteStops]);
  const baselinePaletteName = useMemo(() => {
    if (!editingPaletteId || editingPaletteId === 'current') {
      return '';
    }
    const preset = palettePresets.find(
      (option) => option.id === editingPaletteId,
    );
    return preset?.name ?? '';
  }, [editingPaletteId, palettePresets]);

  const persistCustomPalettes = (nextPalettes: PalettePreset[]) => {
    let storage: Storage;
    try {
      if (!('localStorage' in globalThis)) {
        setPaletteStorageError(PALETTE_STORAGE_ERROR);
        return false;
      }
      storage = globalThis.localStorage;
    } catch {
      setPaletteStorageError(PALETTE_STORAGE_ERROR);
      return false;
    }

    if (!storePalettePresets(storage, nextPalettes)) {
      setPaletteStorageError(PALETTE_STORAGE_ERROR);
      return false;
    }

    setPaletteStorageError(null);
    setCustomPalettes(nextPalettes);
    return true;
  };

  const updatePaletteStops = (
    updater: PaletteStop[] | ((currentStops: PaletteStop[]) => PaletteStop[]),
  ) => {
    setPaletteStopsDraft((currentStops) =>
      typeof updater === 'function' ? updater(currentStops) : updater,
    );
  };

  const paletteDirty = useMemo(() => {
    if (paletteStopsDraft.length !== settings.paletteStops.length) {
      return true;
    }
    return paletteStopsDraft.some((stop, index) => {
      const current = settings.paletteStops[index];
      return (
        !current ||
        current.position !== stop.position ||
        current.colour !== stop.colour
      );
    });
  }, [paletteStopsDraft, settings.paletteStops]);

  const paletteDraftDirty = useMemo(
    () =>
      !stopsEqual(paletteStopsDraft, baselinePaletteStops) ||
      paletteNameDraft.trim() !== baselinePaletteName,
    [
      paletteStopsDraft,
      baselinePaletteStops,
      paletteNameDraft,
      baselinePaletteName,
    ],
  );
  const paletteNameValid = paletteNameDraft.trim().length > 0;
  const isPaletteNameTaken = (name: string, excludeId?: string | null) => {
    const candidate = name.trim().toLowerCase();
    if (!candidate) {
      return false;
    }
    return palettePresets.some((preset) => {
      if (excludeId && preset.id === excludeId) {
        return false;
      }
      return preset.name.trim().toLowerCase() === candidate;
    });
  };
  const saveRequiresName =
    !editingPaletteId ||
    editingPaletteId === 'current' ||
    isBuiltinPalette.has(editingPaletteId) ||
    !customPalettes.some((item) => item.id === editingPaletteId);
  const saveDisabled =
    !paletteDraftDirty || (!saveRequiresName && !paletteNameValid);

  const applyPaletteStops = () => {
    onUpdateSettings({ paletteStops: paletteStopsDraft });
    setPaletteModalOpen(false);
    setActivePresetId('current');
    paletteDragIndexRef.current = null;
    palettePendingRef.current = null;
  };

  const closePaletteModal = () => {
    setPaletteStopsDraft(settings.paletteStops);
    setPaletteNameDraft('');
    setPaletteModalOpen(false);
    setSelectedStopIndex(null);
    setEditingPaletteId(null);
    paletteDragIndexRef.current = null;
    palettePendingRef.current = null;
  };

  const handlePaletteStopChange = (
    index: number,
    partial: Partial<PaletteStop>,
  ) => {
    updatePaletteStops((currentStops) =>
      changePaletteStop(currentStops, index, partial),
    );
  };

  const handleRemoveStop = (index: number) => {
    updatePaletteStops((currentStops) => {
      if (currentStops.length <= 2) {
        return currentStops;
      }
      const removed = currentStops[index];
      const nextStops = currentStops.filter(
        (_, stopIndex) => stopIndex !== index,
      );
      if (selectedStopIndex === null || !removed) {
        return nextStops;
      }
      if (selectedStopIndex === index) {
        const sorted = nextStops
          .map((stop, stopIndex) => ({
            index: stopIndex,
            position: stop.position,
          }))
          .sort((a, b) => a.position - b.position);
        if (sorted.length === 0) {
          setSelectedStopIndex(null);
          return nextStops;
        }
        let closest = sorted[0];
        let minDistance = Math.abs(sorted[0].position - removed.position);
        sorted.forEach((stop) => {
          const distance = Math.abs(stop.position - removed.position);
          if (distance < minDistance) {
            closest = stop;
            minDistance = distance;
          }
        });
        setSelectedStopIndex(closest.index);
        return nextStops;
      }
      if (selectedStopIndex > index) {
        setSelectedStopIndex(selectedStopIndex - 1);
      }
      return nextStops;
    });
  };

  const handleResetPalette = () => {
    updatePaletteStops(baselinePaletteStops.map((stop) => ({ ...stop })));
    setSelectedStopIndex(baselinePaletteStops.length > 0 ? 0 : null);
    setPaletteNameDraft(baselinePaletteName);
  };

  const handlePresetChange = (value: string) => {
    if (value === 'current') {
      setActivePresetId('current');
      return;
    }
    const preset = palettePresets.find((option) => option.id === value);
    if (!preset) {
      return;
    }
    onUpdateSettings({
      paletteStops: preset.stops.map((stop) => ({ ...stop })),
    });
    setActivePresetId(preset.id);
  };

  const openModal = () => {
    paletteReturnFocusRef.current = triggerRef.current;
    setPaletteStopsDraft(settings.paletteStops);
    setSelectedStopIndex(settings.paletteStops.length > 0 ? 0 : null);
    setEditingPaletteId(activePresetId);
    setPaletteNameDraft(
      palettePresets.find((preset) => preset.id === activePresetId)?.name ?? '',
    );
    setPaletteModalOpen(true);
  };

  const handleSavePaletteAs = () => {
    const initialName = paletteNameDraft.trim() || 'New palette';
    const promptValue = globalThis.prompt('Palette name', initialName);
    const name = promptValue?.trim() ?? '';
    if (!name) {
      return;
    }
    if (isPaletteNameTaken(name)) {
      globalThis.alert('A palette with that name already exists.');
      return;
    }
    const slug = name
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '');
    const id = `custom-${slug || 'palette'}-${Date.now()}`;
    const nextPreset: PalettePreset = {
      id,
      name: name.trim(),
      stops: paletteStopsDraft.map((stop) => ({ ...stop })),
    };
    if (!persistCustomPalettes([...customPalettes, nextPreset])) {
      return;
    }
    setEditingPaletteId(id);
    setPaletteNameDraft(name);
  };

  const handleSavePalette = () => {
    if (
      !editingPaletteId ||
      editingPaletteId === 'current' ||
      isBuiltinPalette.has(editingPaletteId)
    ) {
      handleSavePaletteAs();
      return;
    }
    const customIndex = customPalettes.findIndex(
      (item) => item.id === editingPaletteId,
    );
    if (customIndex === -1) {
      handleSavePaletteAs();
      return;
    }
    const currentName = customPalettes[customIndex]?.name ?? '';
    const nextName = paletteNameDraft.trim() || currentName;
    if (nextName && isPaletteNameTaken(nextName, editingPaletteId)) {
      globalThis.alert('A palette with that name already exists.');
      return;
    }
    const nextPalettes = customPalettes.map((item) =>
      item.id === editingPaletteId
        ? {
            ...item,
            name: nextName,
            stops: paletteStopsDraft.map((stop) => ({ ...stop })),
          }
        : item,
    );
    if (!persistCustomPalettes(nextPalettes)) {
      return;
    }
    setPaletteNameDraft(nextName);
  };

  const handleNewPalette = () => {
    const blank: PaletteStop[] = [
      { position: 0, colour: '#000000' },
      { position: 1, colour: '#ffffff' },
    ];
    updatePaletteStops(blank.map((stop) => ({ ...stop })));
    setSelectedStopIndex(blank.length > 0 ? 0 : null);
    setEditingPaletteId(null);
    setPaletteNameDraft('');
  };

  const handleRandomPalette = () => {
    const stopsCount = 4 + Math.floor(Math.random() * 3);
    const positions = Array.from({ length: stopsCount }, (_, index) => {
      if (index === 0) return 0;
      if (index === stopsCount - 1) return 1;
      return Math.random();
    }).sort((a, b) => a - b);
    const randomStops: PaletteStop[] = positions.map((position) => {
      const colour = `#${Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, '0')}`;
      return { position, colour };
    });
    updatePaletteStops(randomStops);
    setSelectedStopIndex(0);
    setEditingPaletteId(null);
    if (!paletteNameDraft.trim()) {
      setPaletteNameDraft('Random palette');
    }
  };

  const handleDeletePalette = (paletteId: string) => {
    const preset = customPalettes.find((item) => item.id === paletteId);
    if (!preset || !('confirm' in globalThis)) {
      return;
    }
    if (!globalThis.confirm(`Delete "${preset.name}"?`)) {
      return;
    }
    if (
      !persistCustomPalettes(
        customPalettes.filter((item) => item.id !== paletteId),
      )
    ) {
      return;
    }
    if (editingPaletteId === paletteId) {
      setEditingPaletteId(null);
    }
    if (activePresetId === paletteId) {
      setActivePresetId('current');
    }
  };

  const sortedStops = useMemo(
    () =>
      paletteStopsDraft
        .map((stop, index) => ({ ...stop, index }))
        .sort((a, b) => a.position - b.position),
    [paletteStopsDraft],
  );
  const selectedStop = useMemo(() => {
    if (selectedStopIndex === null) {
      return null;
    }
    return paletteStopsDraft[selectedStopIndex] ?? null;
  }, [paletteStopsDraft, selectedStopIndex]);

  const getPaletteGradient = (stops: PaletteStop[]) => {
    const sorted = [...stops].sort((a, b) => a.position - b.position);
    const gradientStops = sorted
      .map((stop) => `${stop.colour} ${Math.round(stop.position * 100)}%`)
      .join(', ');
    return `linear-gradient(90deg, ${gradientStops})`;
  };

  const paletteGradient = useMemo(
    () => getPaletteGradient(sortedStops),
    [sortedStops],
  );

  const getColourAtPosition = (position: number) => {
    const stops = sortedStops;
    if (stops.length === 0) {
      return '#ffffff';
    }
    const clamped = Math.min(1, Math.max(0, position));
    let left = stops[0];
    let right = stops[stops.length - 1];
    for (let index = 0; index < stops.length - 1; index += 1) {
      if (
        clamped >= stops[index].position &&
        clamped <= stops[index + 1].position
      ) {
        left = stops[index];
        right = stops[index + 1];
        break;
      }
    }
    const parse = (hex: string) => {
      const value = hex.replace('#', '');
      const int = Number.parseInt(
        value.length === 3
          ? value
              .split('')
              .map((c) => c + c)
              .join('')
          : value,
        16,
      );
      return {
        r: (int >> 16) & 255,
        g: (int >> 8) & 255,
        b: int & 255,
      };
    };
    const leftRgb = parse(left.colour);
    const rightRgb = parse(right.colour);
    const span = Math.max(0.0001, right.position - left.position);
    const t = (clamped - left.position) / span;
    const toHex = (value: number) =>
      Math.round(value).toString(16).padStart(2, '0');
    const r = leftRgb.r + (rightRgb.r - leftRgb.r) * t;
    const g = leftRgb.g + (rightRgb.g - leftRgb.g) * t;
    const b = leftRgb.b + (rightRgb.b - leftRgb.b) * t;
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  useEffect(() => {
    if (!paletteModalOpen) {
      return;
    }
    const handlePointerMove = (event: PointerEvent) => {
      if (paletteDragIndexRef.current === null && palettePendingRef.current) {
        const delta = Math.abs(
          event.clientX - palettePendingRef.current.startX,
        );
        if (delta > 3) {
          paletteDragIndexRef.current = palettePendingRef.current.index;
          palettePendingRef.current = null;
        } else {
          return;
        }
      }
      if (paletteDragIndexRef.current === null || !paletteBarRef.current) {
        return;
      }
      const rect = paletteBarRef.current.getBoundingClientRect();
      const position = Math.min(
        1,
        Math.max(0, (event.clientX - rect.left) / rect.width),
      );
      const index = paletteDragIndexRef.current;
      setPaletteStopsDraft((currentStops) =>
        changePaletteStop(currentStops, index, { position }),
      );
    };
    const handlePointerUp = () => {
      if (paletteDragIndexRef.current !== null) {
        paletteDragIndexRef.current = null;
        return;
      }
      if (palettePendingRef.current) {
        palettePendingRef.current = null;
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPaletteStopsDraft(settings.paletteStops);
        setPaletteNameDraft('');
        setPaletteModalOpen(false);
        setSelectedStopIndex(null);
        setEditingPaletteId(null);
        paletteDragIndexRef.current = null;
        palettePendingRef.current = null;
      }
    };
    globalThis.addEventListener('pointermove', handlePointerMove);
    globalThis.addEventListener('pointerup', handlePointerUp);
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.removeEventListener('pointermove', handlePointerMove);
      globalThis.removeEventListener('pointerup', handlePointerUp);
      globalThis.removeEventListener('keydown', handleKeyDown);
    };
  }, [paletteModalOpen, settings.paletteStops]);

  useEffect(() => {
    if (!paletteModalOpen) {
      if (!paletteWasOpenRef.current) {
        return;
      }
      paletteWasOpenRef.current = false;
      const returnTarget = paletteReturnFocusRef.current;
      paletteReturnFocusRef.current = null;
      if (returnTarget?.isConnected) {
        returnTarget.focus({ preventScroll: true });
      }
      return;
    }
    paletteWasOpenRef.current = true;
    const container = paletteModalRef.current;
    if (!container) {
      return;
    }
    const focusFrame = globalThis.requestAnimationFrame(() => {
      const focusables = getPaletteModalFocusables(container);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        container.focus();
      }
    });
    return () => {
      globalThis.cancelAnimationFrame(focusFrame);
    };
  }, [paletteModalOpen]);

  const handlePaletteModalKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== 'Tab') {
      return;
    }
    const focusables = getPaletteModalFocusables(paletteModalRef.current);
    if (focusables.length === 0) {
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || active === paletteModalRef.current) {
        event.preventDefault();
        last.focus();
      }
      return;
    }
    if (active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const addPaletteStopAt = (position: number) => {
    const clamped = Math.min(1, Math.max(0, position));
    const colour = getColourAtPosition(clamped);
    updatePaletteStops((currentStops) => {
      const nextIndex = currentStops.length;
      const nextStops = [...currentStops, { position: clamped, colour }];
      setSelectedStopIndex(nextIndex);
      return nextStops;
    });
  };

  const handlePaletteBarKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    const selectedPosition =
      selectedStopIndex === null
        ? undefined
        : paletteStopsDraft[selectedStopIndex]?.position;
    addPaletteStopAt(selectedPosition ?? 0.5);
  };

  const handleEditPalette = (preset: PalettePreset) => {
    updatePaletteStops(preset.stops.map((stop) => ({ ...stop })));
    setSelectedStopIndex(preset.stops.length > 0 ? 0 : null);
    setEditingPaletteId(preset.id);
    setPaletteNameDraft(preset.name);
  };

  useEffect(() => {
    onOpenChange?.(paletteModalOpen);
  }, [onOpenChange, paletteModalOpen]);

  return {
    activePresetId,
    addPaletteStopAt,
    applyPaletteStops,
    closeModal: closePaletteModal,
    customPalettes,
    editingPaletteId,
    handleDeletePalette,
    handleEditPalette,
    handleModalKeyDown: handlePaletteModalKeyDown,
    handleNewPalette,
    handlePaletteBarKeyDown,
    handlePaletteStopChange,
    handlePresetChange,
    handleRandomPalette,
    handleRemoveStop,
    handleResetPalette,
    handleSavePalette,
    handleSavePaletteAs,
    modalRef: paletteModalRef,
    open: paletteModalOpen,
    openModal,
    paletteBarRef,
    paletteDraftDirty,
    paletteDirty,
    paletteGradient,
    paletteNameDraft,
    palettePresets,
    paletteStorageError,
    paletteStopsDraft,
    pendingDragRef: palettePendingRef,
    saveDisabled,
    selectedStop,
    selectedStopIndex,
    setPaletteNameDraft,
    setSelectedStopIndex,
    sortedStops,
  };
};
