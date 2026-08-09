import { useRef } from 'react';
import type { RenderSettings } from '../../state/settings';
import type { Navigation } from '../../engine/viewport';
import type { FractalAlgorithm } from '../../util/fractals';
import { createPortal } from 'react-dom';
import { LabelWithHelp, SelectChevron } from './DrawerPrimitives';
import PaletteEditorModal from './PaletteEditorModal';
import { usePaletteEditor } from './usePaletteEditor';
import { buttonClass, optionClass, selectClass } from './styles';

type PaletteEditorProps = {
  settings: RenderSettings;
  onUpdateSettings: (payload: Partial<RenderSettings>) => void;
  algorithm: FractalAlgorithm;
  navigation: Navigation;
  onOpenChange?: (open: boolean) => void;
};

const PaletteEditor = ({
  settings,
  onUpdateSettings,
  algorithm,
  navigation,
  onOpenChange,
}: PaletteEditorProps) => {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const editor = usePaletteEditor({
    settings,
    onUpdateSettings,
    onOpenChange,
    triggerRef,
  });

  return (
    <>
      <div className='space-y-3'>
        <LabelWithHelp
          label='Palette'
          tooltip='Switch between saved palettes. Palettes are stored locally in this browser.'
          htmlFor='palette-select'
        />
        <div className='relative'>
          <select
            className={selectClass}
            id='palette-select'
            name='palette'
            aria-label='Palette'
            value={editor.activePresetId}
            onChange={(event) => editor.handlePresetChange(event.target.value)}
          >
            <option value='current' className={optionClass}>
              Current
            </option>
            {editor.palettePresets.map((option) => (
              <option key={option.id} value={option.id} className={optionClass}>
                {option.name}
              </option>
            ))}
          </select>
          <SelectChevron />
        </div>
        <div
          className='h-3 w-full rounded-control border border-rule-strong'
          style={{ backgroundImage: editor.paletteGradient }}
        />
        <button
          ref={triggerRef}
          type='button'
          aria-haspopup='dialog'
          aria-controls='palette-editor-modal'
          aria-expanded={editor.open}
          className={buttonClass}
          onClick={editor.openModal}
        >
          Palette Editor
        </button>
      </div>

      {editor.open &&
        typeof document !== 'undefined' &&
        createPortal(
          <PaletteEditorModal
            algorithm={algorithm}
            navigation={navigation}
            settings={settings}
            modalRef={editor.modalRef}
            paletteBarRef={editor.paletteBarRef}
            pendingDragRef={editor.pendingDragRef}
            paletteStops={editor.paletteStopsDraft}
            sortedStops={editor.sortedStops}
            selectedStop={editor.selectedStop}
            selectedStopIndex={editor.selectedStopIndex}
            setSelectedStopIndex={editor.setSelectedStopIndex}
            paletteName={editor.paletteNameDraft}
            setPaletteName={editor.setPaletteNameDraft}
            paletteGradient={editor.paletteGradient}
            palettePresets={editor.palettePresets}
            customPalettes={editor.customPalettes}
            paletteStorageError={editor.paletteStorageError}
            editingPaletteId={editor.editingPaletteId}
            saveDisabled={editor.saveDisabled}
            paletteDraftDirty={editor.paletteDraftDirty}
            paletteDirty={editor.paletteDirty}
            onModalKeyDown={editor.handleModalKeyDown}
            onAddStop={editor.addPaletteStopAt}
            onPaletteBarKeyDown={editor.handlePaletteBarKeyDown}
            onStopChange={editor.handlePaletteStopChange}
            onRemoveStop={editor.handleRemoveStop}
            onSave={editor.handleSavePalette}
            onSaveAs={editor.handleSavePaletteAs}
            onNew={editor.handleNewPalette}
            onRandom={editor.handleRandomPalette}
            onReset={editor.handleResetPalette}
            onEdit={editor.handleEditPalette}
            onDelete={editor.handleDeletePalette}
            onCancel={editor.closeModal}
            onApply={editor.applyPaletteStops}
          />,
          document.body,
        )}
    </>
  );
};

export default PaletteEditor;
