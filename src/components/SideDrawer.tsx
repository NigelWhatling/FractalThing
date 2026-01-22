import { useCallback, useEffect, useMemo, useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Fab from '@mui/material/Fab';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormControl from '@mui/material/FormControl';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import type { RenderSettings } from '../state/settings';

type SideDrawerProps = {
  settings: RenderSettings;
  onUpdateSettings: (payload: Partial<RenderSettings>) => void;
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
  variant?: 'subtitle2' | 'body2' | 'caption';
};

const LabelWithHelp = ({ label, tooltip, variant = 'subtitle2' }: LabelWithHelpProps) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
    <Typography variant={variant} component="span">
      {label}
    </Typography>
    <Tooltip title={tooltip} arrow placement="top">
      <IconButton size="small" aria-label={`${label} info`}>
        <InfoOutlinedIcon fontSize="inherit" />
      </IconButton>
    </Tooltip>
  </Box>
);

const SideDrawer = ({ settings, onUpdateSettings }: SideDrawerProps) => {
  const [open, setOpen] = useState(false);
  const [tileSizeDraft, setTileSizeDraft] = useState(settings.tileSize);
  const [iterationsDraft, setIterationsDraft] = useState(settings.maxIterations);
  const [refinementPreset, setRefinementPreset] = useState(0);
  const [finalQualityPreset, setFinalQualityPreset] = useState(0);
  const [colorPeriodDraft, setColorPeriodDraft] = useState(settings.colorPeriod);
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

  const toggleDrawer = (nextOpen: boolean) => () => {
    setOpen(nextOpen);
  };

  useEffect(() => {
    setTileSizeDraft(settings.tileSize);
  }, [settings.tileSize]);

  useEffect(() => {
    setIterationsDraft(settings.maxIterations);
  }, [settings.maxIterations]);

  useEffect(() => {
    setColorPeriodDraft(settings.colorPeriod);
  }, [settings.colorPeriod]);

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

  const handleTileSizeCommit = useCallback(
    (_: Event, value: number | number[]) => {
      const nextValue = Array.isArray(value) ? value[0] : value;
      onUpdateSettings({ tileSize: Math.max(32, Math.round(nextValue)) });
    },
    [onUpdateSettings]
  );

  const handleIterationsCommit = useCallback(
    (_: Event, value: number | number[]) => {
      const nextValue = Array.isArray(value) ? value[0] : value;
      onUpdateSettings({ maxIterations: Math.max(32, Math.round(nextValue)) });
    },
    [onUpdateSettings]
  );

  const handleRefinementCommit = useCallback(
    (_: Event, value: number | number[]) => {
      const index = Array.isArray(value) ? value[0] : value;
      const preset = refinementOptions[index];
      if (!preset) {
        return;
      }
      setRefinementPreset(index);
      onUpdateSettings({ refinementStepsCount: preset.steps });
    },
    [onUpdateSettings]
  );

  const handleFinalQualityCommit = useCallback(
    (_: Event, value: number | number[]) => {
      const index = Array.isArray(value) ? value[0] : value;
      const option = finalQualityOptions[index];
      if (!option) {
        return;
      }
      setFinalQualityPreset(index);
      onUpdateSettings({ finalBlockSize: option.value });
    },
    [onUpdateSettings]
  );

  const sliderMarks = useMemo(
    () => [
      { value: 32, label: '32' },
      { value: 64, label: '64' },
      { value: 128, label: '128' },
      { value: 256, label: '256' },
      { value: 512, label: '512' },
    ],
    []
  );

  const colourPeriodMarks = useMemo(
    () => [
      { value: 64, label: '64' },
      { value: 128, label: '128' },
      { value: 256, label: '256' },
      { value: 512, label: '512' },
      { value: 1024, label: '1024' },
      { value: 2048, label: '2048' },
    ],
    []
  );

  const alignedMarkSx = useMemo(
    () => ({
      '& .MuiSlider-markLabel': {
        whiteSpace: 'nowrap',
        transform: 'translateX(0)',
        textAlign: 'left',
      },
      '& .MuiSlider-markLabel:last-of-type': {
        transform: 'translateX(-100%)',
        textAlign: 'right',
      },
    }),
    []
  );

  const handleWorkerCountCommit = useCallback(
    (_: Event, value: number | number[]) => {
      const nextValue = Array.isArray(value) ? value[0] : value;
      onUpdateSettings({ workerCount: Math.max(1, Math.round(nextValue)) });
    },
    [onUpdateSettings]
  );


  return (
    <div>
      <Fab
        size="small"
        color="primary"
        aria-label="menu"
        onClick={toggleDrawer(true)}
        sx={{ position: 'absolute', left: 10, top: 10, m: 1 }}
      >
        <MenuIcon />
      </Fab>

      <Drawer
        anchor="left"
        open={open}
        onClose={toggleDrawer(false)}
        ModalProps={{ keepMounted: true }}
      >
        <Box sx={{ width: { xs: '100vw', sm: 320 }, p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Controls
          </Typography>

          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Render settings</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <Box>
                  <LabelWithHelp
                    label={settings.autoMaxIterations ? 'Base iterations' : 'Max iterations'}
                    tooltip={
                      settings.autoMaxIterations
                        ? 'Base escape-iteration cap. Auto mode adds extra iterations as you zoom.'
                        : 'Escape-iteration cap. Higher values reveal more detail but render slower.'
                    }
                  />
                  <Slider
                    value={iterationsDraft}
                    min={32}
                    max={2048}
                    step={32}
                    valueLabelDisplay="auto"
                    onChange={(_, value) => {
                      const nextValue = Array.isArray(value) ? value[0] : value;
                      setIterationsDraft(Math.round(nextValue));
                    }}
                    onChangeCommitted={handleIterationsCommit}
                  />
                </Box>
                <FormControl fullWidth size="small">
                  <LabelWithHelp
                    label="Colour mode"
                    tooltip="How iterations map to the palette: Normalise shifts with max, Cycle repeats, Fixed uses 2048."
                  />
                  <Select
                    value={settings.colorMode}
                    aria-label="Colour mode"
                    onChange={(event) =>
                      onUpdateSettings({
                        colorMode: event.target.value as typeof settings.colorMode,
                      })
                    }
                  >
                    {colourModeOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth size="small">
                  <LabelWithHelp
                    label="Filters"
                    tooltip="Post-processing effects applied to the canvas."
                  />
                  <Select
                    value={settings.filterMode}
                    aria-label="Filters"
                    onChange={(event) =>
                      onUpdateSettings({
                        filterMode: event.target.value as typeof settings.filterMode,
                      })
                    }
                  >
                    {filterOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Box>
                  <LabelWithHelp
                    label="Colour blend"
                    tooltip="Blends neighbouring palette colours to soften banding without blurring detail."
                  />
                  <Slider
                    value={paletteSmoothnessDraft}
                    min={0}
                    max={1}
                    step={0.05}
                    valueLabelDisplay="auto"
                    onChange={(_, value) => {
                      const nextValue = Array.isArray(value) ? value[0] : value;
                      setPaletteSmoothnessDraft(Number(nextValue));
                    }}
                    onChangeCommitted={(_, value) => {
                      const nextValue = Array.isArray(value) ? value[0] : value;
                      onUpdateSettings({
                        paletteSmoothness: Math.min(1, Math.max(0, Number(nextValue))),
                      });
                    }}
                  />
                </Box>
                <Box>
                  <LabelWithHelp
                    label="Hue shift"
                    tooltip="Rotates the hue of the final image."
                  />
                  <Slider
                    value={hueRotateDraft}
                    min={-180}
                    max={180}
                    step={5}
                    valueLabelDisplay="auto"
                    onChange={(_, value) => {
                      const nextValue = Array.isArray(value) ? value[0] : value;
                      setHueRotateDraft(Math.round(nextValue));
                    }}
                    onChangeCommitted={(_, value) => {
                      const nextValue = Array.isArray(value) ? value[0] : value;
                      onUpdateSettings({
                        hueRotate: Math.round(Number(nextValue)),
                      });
                    }}
                  />
                </Box>
                {settings.filterMode === 'gaussianSoft' && (
                  <Box>
                    <LabelWithHelp
                      label="Gaussian blur strength"
                      tooltip="Applies a subtle blur in pixels. Lower values keep more detail."
                    />
                    <Slider
                      value={gaussianBlurDraft}
                      min={0}
                      max={2}
                      step={0.1}
                      valueLabelDisplay="auto"
                      onChange={(_, value) => {
                        const nextValue = Array.isArray(value) ? value[0] : value;
                        setGaussianBlurDraft(Number(nextValue));
                      }}
                      onChangeCommitted={(_, value) => {
                        const nextValue = Array.isArray(value) ? value[0] : value;
                        onUpdateSettings({
                          gaussianBlur: Math.max(0, Number(nextValue)),
                        });
                      }}
                    />
                  </Box>
                )}
                {settings.filterMode === 'dither' && (
                  <Box>
                    <LabelWithHelp
                      label="Dither strength"
                      tooltip="Adds tiny colour variation to reduce flat banding without blurring detail."
                    />
                    <Slider
                      value={ditherStrengthDraft}
                      min={0}
                      max={1}
                      step={0.05}
                      valueLabelDisplay="auto"
                      onChange={(_, value) => {
                        const nextValue = Array.isArray(value) ? value[0] : value;
                        setDitherStrengthDraft(Number(nextValue));
                      }}
                      onChangeCommitted={(_, value) => {
                        const nextValue = Array.isArray(value) ? value[0] : value;
                        onUpdateSettings({
                          ditherStrength: Math.max(0, Number(nextValue)),
                        });
                      }}
                    />
                  </Box>
                )}
                {settings.colorMode === 'cycle' && (
                  <Box>
                    <LabelWithHelp
                      label="Colour period"
                      tooltip="Number of iterations per full palette cycle. Lower values repeat colours more often."
                    />
                    <Slider
                      value={colorPeriodDraft}
                      min={64}
                      max={2048}
                      step={null}
                      marks={colourPeriodMarks}
                      valueLabelDisplay="auto"
                      sx={alignedMarkSx}
                      onChange={(_, value) => {
                        const nextValue = Array.isArray(value) ? value[0] : value;
                        setColorPeriodDraft(Math.round(nextValue));
                      }}
                      onChangeCommitted={(_, value) => {
                        const nextValue = Array.isArray(value) ? value[0] : value;
                        onUpdateSettings({ colorPeriod: Math.max(64, Math.round(nextValue)) });
                      }}
                    />
                  </Box>
                )}
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.smooth}
                      onChange={(event) => onUpdateSettings({ smooth: event.target.checked })}
                    />
                  }
                  label={
                    <LabelWithHelp
                      label="Smooth colouring"
                      tooltip="Interpolates between iteration bands for smoother gradients."
                      variant="body2"
                    />
                  }
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.autoMaxIterations}
                      onChange={(event) =>
                        onUpdateSettings({ autoMaxIterations: event.target.checked })
                      }
                    />
                  }
                  label={
                    <LabelWithHelp
                      label="Auto max iterations"
                      tooltip="Increase max iterations as you zoom in (log2 scale)."
                      variant="body2"
                    />
                  }
                />
                {settings.autoMaxIterations && (
                  <Box>
                    <LabelWithHelp
                      label="Auto iteration scale"
                      tooltip="Extra iterations added per zoom octave. Higher values sharpen deep zooms."
                    />
                    <Slider
                      value={autoIterationsScaleDraft}
                      min={0}
                      max={512}
                      step={16}
                      valueLabelDisplay="auto"
                      onChange={(_, value) => {
                        const nextValue = Array.isArray(value) ? value[0] : value;
                        setAutoIterationsScaleDraft(Math.round(nextValue));
                      }}
                      onChangeCommitted={(_, value) => {
                        const nextValue = Array.isArray(value) ? value[0] : value;
                        onUpdateSettings({
                          autoIterationsScale: Math.max(0, Math.round(nextValue)),
                        });
                      }}
                    />
                  </Box>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Advanced</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <Box>
                  <LabelWithHelp
                    label="Tile size"
                    tooltip="Size of render tiles in pixels. Smaller tiles update more granularly but add overhead."
                  />
                  <Slider
                    value={tileSizeDraft}
                    min={32}
                    max={512}
                    step={null}
                    marks={sliderMarks}
                    valueLabelDisplay="auto"
                    sx={alignedMarkSx}
                    onChange={(_, value) => {
                      const nextValue = Array.isArray(value) ? value[0] : value;
                      setTileSizeDraft(Math.round(nextValue));
                    }}
                    onChangeCommitted={handleTileSizeCommit}
                  />
                </Box>
                <Box>
                  <LabelWithHelp
                    label="Worker count"
                    tooltip="Number of render workers. Higher counts use more CPU."
                  />
                  <Slider
                    value={workerCountDraft}
                    min={1}
                    max={workerMax}
                    step={1}
                    valueLabelDisplay="auto"
                    onChange={(_, value) => {
                      const nextValue = Array.isArray(value) ? value[0] : value;
                      setWorkerCountDraft(Math.round(nextValue));
                    }}
                    onChangeCommitted={handleWorkerCountCommit}
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                    <Typography variant="caption">1</Typography>
                    <Typography variant="caption">{workerMax}</Typography>
                  </Box>
                </Box>
                <Box>
                  <LabelWithHelp
                    label="Refinement speed"
                    tooltip="Number of progressive passes from coarse to fine."
                  />
                  <Slider
                    value={refinementPreset}
                    min={0}
                    max={refinementOptions.length - 1}
                    step={1}
                    marks={refinementOptions.map((preset, index) => ({
                      value: index,
                    }))}
                    onChange={(_, value) => {
                      const index = Array.isArray(value) ? value[0] : value;
                      setRefinementPreset(index);
                    }}
                    onChangeCommitted={handleRefinementCommit}
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                    <Typography variant="caption">Slow</Typography>
                    <Typography variant="caption">Fast</Typography>
                  </Box>
                </Box>
                <Box>
                  <LabelWithHelp
                    label="Final quality"
                    tooltip="Smallest block size used for the final pass."
                  />
                  <Slider
                    value={finalQualityPreset}
                    min={0}
                    max={finalQualityOptions.length - 1}
                    step={1}
                    marks={finalQualityOptions.map((option, index) => ({
                      value: index,
                    }))}
                    onChange={(_, value) => {
                      const index = Array.isArray(value) ? value[0] : value;
                      setFinalQualityPreset(index);
                    }}
                    onChangeCommitted={handleFinalQualityCommit}
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                    <Typography variant="caption">Large</Typography>
                    <Typography variant="caption">Best</Typography>
                  </Box>
                </Box>
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Box>
      </Drawer>
    </div>
  );
};

export default SideDrawer;
