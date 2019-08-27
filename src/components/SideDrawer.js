import React, { useState, useRef, useEffect } from 'react';
import { Drawer } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import MenuIcon from '@material-ui/icons/Menu';
import Fab from '@material-ui/core/Fab';

const useStyles = makeStyles(theme => ({
    fab: {
        position: 'absolute',
        left: 10,
        top: 10,
        margin: theme.spacing(1),
    },
    content: {
        width: 250
    }
}));

const SideDrawer = () => {

    const classes = useStyles();
    const [state, setState] = useState(false);

    const toggleDrawer = (open) => event => {
        if (event.type === 'keydown' && (event.key === 'Tab' || event.key === 'Shift')) {
            return;
        }

        setState(open);
    };

    return (
        <div>
            <Fab size="small" color="primary" aria-label="menu" className={classes.fab} onClick={toggleDrawer(true)}>
                <MenuIcon />
            </Fab>

            <Drawer anchor="left" open={state} onClose={toggleDrawer(false)}>
                <div
                    className={classes.content}
                    role="presentation"
                    onClick={toggleDrawer(false)}
                    onKeyDown={toggleDrawer(false)}
                >
                    controls go here
                </div>
            </Drawer>
        </div>
    );
}

export default SideDrawer;
