import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

type InfoPanelProps = {
  nav: {
    x: number;
    y: number;
    z: number;
  };
  isRendering: boolean;
  maxIterations: number;
};

const formatValue = (value: number) => value.toFixed(6);

const InfoPanel = ({ nav, isRendering, maxIterations }: InfoPanelProps) => {
  const renderStatus = isRendering ? 'Rendering…' : 'Idle';

  return (
    <Box
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        py: 0.5,
        px: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        backgroundColor: 'rgba(0,0,0,0.6)',
        color: 'white',
        fontSize: 12,
        pointerEvents: 'none',
      }}
    >
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="caption">X {formatValue(nav.x)}</Typography>
        <Typography variant="caption">Y {formatValue(nav.y)}</Typography>
        <Typography variant="caption">Z {formatValue(nav.z)}</Typography>
        <Typography variant="caption">Max {Math.round(maxIterations)}</Typography>
      </Box>
      <Typography variant="caption">{renderStatus}</Typography>
    </Box>
  );
};

export default InfoPanel;
