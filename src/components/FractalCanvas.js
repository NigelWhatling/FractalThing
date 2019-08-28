import React, { useState, useRef, useEffect } from 'react';
//import queryString from 'query-string';
import PaletteGenerator from '../util/PaletteGenerator';
import MandelbrotWorker from '../workers/mandelbrotWorker';
import * as WorkerCommands from '../workers/workerCommands';

const parseFloatWithDefault = (str, def) => {
  let val = parseFloat(str);
  if (val === undefined || isNaN(val)) {
    return def;
  }
  return val;
};

const lerpRgb = (rgb1, rgb2, t) => {
  return [(1 - t) * rgb1[0] + t * rgb2[0], (1 - t) * rgb1[1] + t * rgb2[1], (1 - t) * rgb1[2] + t * rgb2[2]];
}

const FractalCanvas = ({ width, height, query, props }) => {

  //console.log(props);
  //const queryProps = queryString.parse(query);

  let navProps = { x: -0.5, y: 0, z: 1 };

  if (props.loc) {
    let matches = props.loc.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))/i);
    if (matches) {
      navProps = {
        x: parseFloatWithDefault(matches[1], -0.5),
        y: parseFloatWithDefault(matches[2], 0),
        z: parseFloatWithDefault(matches[3], 1),
      }
    }
  }

  const [nav, setNav] = useState({ ...navProps, step: 0, t: Math.random() });

  const canvasRef = useRef(null);
  const sizePropsRef = useRef({ width: width, height: height });

  // console.log(`canvas: ${width} x ${height} | (${nav.x},${nav.y}) x${nav.z}`);

  const max = 256;
  const palette = PaletteGenerator(Math.max(max, 1000));

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

  const worker_count = 8;

  useEffect(() => {

    const canvas = canvasRef.current;
    let ctx = canvas.getContext("2d");

    let t0 = performance.now();
    let px, py;
    let pscale = (palette.length - 1) / max;

    if (sizePropsRef.current.width !== width || sizePropsRef.current.height !== height) {
      sizePropsRef.current = { width: width, height: height };
      setNav({ ...nav, step: 0 });
    }

    let bl = steps[nav.step];
    let smooth = true;

    const paintHandler = (px, py, i) => {
      let rgb;

      if (smooth) {
        let rgb1 = i < max - 1 ? palette[Math.floor(pscale * i)] : [0, 0, 0];
        let rgb2 = i < max - 1 ? palette[Math.floor(pscale * (i + 1))] : [0, 0, 0];
        rgb = lerpRgb(rgb1, rgb2, i % 1);
      } else {
        rgb = i < max ? palette[Math.floor(pscale * i)] : [0, 0, 0];
      }

      ctx.fillStyle = `rgb(${Math.floor(rgb[0])},${Math.floor(rgb[1])},${Math.floor(rgb[2])})`;
      ctx.fillRect(px, py, bl, bl);
    };

    const code = MandelbrotWorker.toString();
    const blob = new Blob(['(' + code + ')()']);
    const blobURL = URL.createObjectURL(blob);

    const workers = [];
    for (let i = 0; i < worker_count; i++) {
      let worker = new Worker(blobURL);
      worker.addEventListener('message', ev => {
        //console.log('worker', ev.data);
        paintHandler(ev.data.px, ev.data.py, ev.data.i);
      });
      workers[i] = worker;
    }

    // for (let i = 0; i < worker_count; i++) {
    //   workers[i].postMessage({ cmd: 'start', msg: 'blah' });
    // }

    let w = 0;

    for (py = 0; py < height; py += bl) {
      for (px = 0; px < width; px += bl) {

        workers[(w++ % worker_count)].postMessage({
          cmd: WorkerCommands.START,
          px: px,
          py: py,
          xs: x0 + (px * xscale),
          ys: y0 + (py * yscale),
          max: max,
          smooth: smooth
        });

      }
    }

    let t1 = performance.now();
    console.log(`Canvas render: ${width} x ${height} | (${nav.x},${nav.y}) x${nav.z} | [${bl}] ${Math.round((t1 - t0) * 10000) / 10000} ms.`);

    workers.forEach((worker) => { worker.postMessage({ cmd: WorkerCommands.STOP }) });

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
