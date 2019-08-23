import React, { useState, useRef, useEffect } from 'react';
import PaletteGenerator from '../util/PaletteGenerator';

const FractalCanvas = ({ width, height }) => {

  const [nav, setNav] = useState({ x: -0.5, y: 0, z: 1, step: 0, t: Math.random() });

  const canvasRef = useRef(null);
  const sizePropsRef = useRef({ width: width, height: height });

  // console.log(`canvas: ${width} x ${height} | (${nav.x},${nav.y}) x${nav.z}`);

  const max = 500;
  const palette = PaletteGenerator(max);

  // Mandelbrot set range: -2.5 > x < 1    -1 > y < 1
  const BASE_NUMBER_RANGE = 1;

  const ratio = width / height;
  const x0 = nav.x - ((BASE_NUMBER_RANGE * ratio) / nav.z);
  const x1 = nav.x + ((BASE_NUMBER_RANGE * ratio) / nav.z);
  const y0 = nav.y - (BASE_NUMBER_RANGE / nav.z);
  const y1 = nav.y + (BASE_NUMBER_RANGE / nav.z);

  const xscale = Math.abs(x1 - x0) / width;
  const yscale = Math.abs(y1 - y0) / height;

  const steps = [100, 50, 20, 4, 1];

  useEffect(() => {
    const canvas = canvasRef.current;
    let ctx = canvas.getContext("2d");

    let t0 = performance.now();
    let px, py;
    let pscale = palette.length / max;

    if (sizePropsRef.current.width !== width || sizePropsRef.current.height !== height) {
      nav.step = 0;
      sizePropsRef.current = { width: width, height: height };
    }

    let bl = steps[nav.step];

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
    console.log(`Canvas render: ${width} x ${height} | (${nav.x},${nav.y}) x${nav.z} | [${bl}] ${Math.round((t1 - t0) * 10000) / 10000} ms.`);

    //console.log(nav);
    if (nav.step < steps.length - 1) {
      setNav({ ...nav, step: ++nav.step, t: Math.random() });
    }

    const clickHandler = (e) => {
      console.log(`click: ${e.offsetX}, ${e.offsetY}`, e);
      if (!e.ctrlKey) {
        setNav({ ...nav, x: x0 + (xscale * e.offsetX), y: y0 + (yscale * e.offsetY), z: nav.z * 2, step: 0, t: Math.random() });
      } else if (nav.z > 1) {
        setNav({ ...nav, x: x0 + (xscale * e.offsetX), y: y0 + (yscale * e.offsetY), z: nav.z / 2, step: 0, t: Math.random() });
      }
    };

    const wheelHandler = (e) => {
      console.log(`wheel: ${e.deltaY}`, e);
      if (e.deltaY < 0) {
        setNav({ x: x0 + (xscale * e.offsetX), y: y0 + (yscale * e.offsetY), z: nav.z * 2, step: 0, t: Math.random() });
      } else {
        if (nav.z > 1) {
          setNav({ x: x0 + (xscale * e.offsetX), y: y0 + (yscale * e.offsetY), z: nav.z / 2, step: 0, t: Math.random() });
        } else {
          setNav({ x: x0 + (xscale * e.offsetX), y: y0 + (yscale * e.offsetY), step: 0, t: Math.random() });
        }
      }
    };

    canvas.addEventListener('click', clickHandler);
    canvas.addEventListener('wheel', wheelHandler);

    return (() => {
      canvas.removeEventListener('click', clickHandler);
      canvas.removeEventListener('wheel', wheelHandler);
    });
  }, [width, height, palette, steps, nav, x0, xscale, y0, yscale]);

  return (
    <canvas ref={canvasRef} width={width} height={height}>
    </canvas>
  );
}

export default FractalCanvas;
