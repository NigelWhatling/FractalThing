import React, { useState, useRef, useEffect } from 'react';
import PaletteGenerator from '../util/PaletteGenerator';

const FractalCanvas = ({ width, height }) => {

  const [nav, setNav] = useState({ x: -0.5, y: 0, z: 1, block: 0, t: Math.random() });

  const canvasRef = useRef(null);

  //console.log(`canvas: ${width} x ${height} | (${nav.x},${nav.y}) x${nav.z}`);

  const max = 500;
  const palette = PaletteGenerator(max);

  // const x0 = -2.5;
  // const x1 = 1;
  // const y0 = -1;
  // const y1 = 1;

  const r = height / width;
  const x0 = nav.x - ((1.75 * r) / nav.z);
  const x1 = nav.x + ((1.75 * r) / nav.z);
  const y0 = nav.y - (1 / nav.z);
  const y1 = nav.y + (1 / nav.z);

  const xscale = Math.abs(x1 - x0) / width;
  const yscale = Math.abs(y1 - y0) / height;

  const blocks = [100, 50, 20, 4, 1];

  useEffect(() => {
    const canvas = canvasRef.current;
    let ctx = canvas.getContext("2d");

    let t0 = performance.now();
    let px, py;
    let pscale = palette.length / max;
    let bl = blocks[nav.block];

    for (py = 0; py < height; py += bl) {
      for (px = 0; px < width; px += bl) {

        let xs = x0 + (px * xscale);
        let ys = y0 + (py * yscale);
        let x = 0;
        let y = 0;
        let i = 0;

        let r2 = 0;
        let i2 = 0;
        let z2 = 0;

        while (r2 + i2 <= 4 && i < max) {
          x = r2 - i2 + xs;
          y = z2 - r2 - i2 + ys;
          r2 = x * x;
          i2 = y * y;
          z2 = (x + y) * (x + y);
          i++;
        }

        ctx.fillStyle = i < max ? palette[Math.round(pscale * i)] : `#000`;
        ctx.fillRect(px, py, bl, bl);
      }
    }

    let t1 = performance.now();
    console.log(`Render(${bl}) took ${(t1 - t0)} milliseconds.`);

    if (++nav.block < blocks.length) {
      setNav({ ...nav, block: nav.block, t: Math.random() });
    }

    const clickHandler = (e) => {
      console.log(`click: ${e.offsetX}, ${e.offsetY}`, e);
      if (!e.ctrlKey) {
        setNav({ ...nav, x: x0 + (xscale * e.offsetX), y: y0 + (yscale * e.offsetY), z: nav.z * 2, block: 0, t: Math.random() });
      } else if (nav.z > 1) {
        setNav({ ...nav, x: x0 + (xscale * e.offsetX), y: y0 + (yscale * e.offsetY), z: nav.z / 2, block: 0, t: Math.random() });
      }
    };

    const wheelHandler = (e) => {
      console.log(`wheel: ${e.deltaY}`, e);
      if (e.deltaY < 0) {
        setNav({ x: x0 + (xscale * e.offsetX), y: y0 + (yscale * e.offsetY), z: nav.z * 2, block: 0, t: Math.random() });
      } else {
        if (nav.z > 1) {
          setNav({ x: x0 + (xscale * e.offsetX), y: y0 + (yscale * e.offsetY), z: nav.z / 2, block: 0, t: Math.random() });
        } else {
          setNav({ x: x0 + (xscale * e.offsetX), y: y0 + (yscale * e.offsetY), block: 0, t: Math.random() });
        }
      }
    };

    canvas.addEventListener('click', clickHandler);
    canvas.addEventListener('wheel', wheelHandler);

    return (() => {
      canvas.removeEventListener('click', clickHandler);
      canvas.removeEventListener('wheel', wheelHandler);
    });
  }, [palette, blocks, nav, height, width, x0, xscale, y0, yscale]);

  return (
    <canvas ref={canvasRef} width={width} height={height} style={{ border: `1px solid black` }}>
    </canvas>
  );
}

export default FractalCanvas;
