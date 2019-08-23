import React, { useState, useRef, useEffect } from 'react';
import {Drawer } from '@material-ui/core';

const SideDrawer = ({ width, height }) => {

    return (
        <Drawer anchor="left" open={false} ></Drawer>
    );
}

export default SideDrawer;
