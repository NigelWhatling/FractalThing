import Box from '@mui/material/Box';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import PanToolAltIcon from '@mui/icons-material/PanToolAlt';
import CropSquareIcon from '@mui/icons-material/CropSquare';

export type InteractionMode = 'grab' | 'select';

type InteractionModeToggleProps = {
  value: InteractionMode;
  onChange: (mode: InteractionMode) => void;
};

const InteractionModeToggle = ({ value, onChange }: InteractionModeToggleProps) => {
  return (
    <Box sx={{ position: 'absolute', right: 12, top: 12, zIndex: 2 }}>
      <ToggleButtonGroup
        value={value}
        exclusive
        size="small"
        color="primary"
        onChange={(_, nextValue: InteractionMode | null) => {
          if (nextValue) {
            onChange(nextValue);
          }
        }}
      >
        <ToggleButton value="grab" aria-label="Grab mode">
          <Tooltip title="Grab" arrow>
            <span>
              <PanToolAltIcon fontSize="small" />
            </span>
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="select" aria-label="Select mode">
          <Tooltip title="Select" arrow>
            <span>
              <CropSquareIcon fontSize="small" />
            </span>
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
};

export default InteractionModeToggle;
