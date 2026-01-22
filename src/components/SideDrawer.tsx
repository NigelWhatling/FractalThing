import { useState } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Fab from '@mui/material/Fab';
import MenuIcon from '@mui/icons-material/Menu';

const SideDrawer = () => {
  const [open, setOpen] = useState(false);

  const toggleDrawer = (nextOpen: boolean) => () => {
    setOpen(nextOpen);
  };

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

      <Drawer anchor="left" open={open} onClose={toggleDrawer(false)}>
        <Box sx={{ width: 250, p: 2 }}>controls go here</Box>
      </Drawer>
    </div>
  );
};

export default SideDrawer;
