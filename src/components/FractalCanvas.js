import React, { useState, useRef, useEffect } from 'react';
import { connect, useSelector } from 'react-redux';
import { incTasks, decTasks } from '../redux/actions';
//import queryString from 'query-string';
import PaletteGenerator from '../util/PaletteGenerator';
import MandelbrotWorker from '../workers/Mandelbrot.Worker';
import * as WorkerCommands from '../workers/WorkerCommands';
import InfoPanel from './InfoPanel';

// Parse float from string with default value for invalid inputs.
const parseFloatWithDefault = (str, def) => {
  let val = parseFloat(str);
  if (val === undefined || isNaN(val)) {
    return def;
  }
  return val;
};

// Linear interpolation calculation for RGB values supplied in arrays ([r,g,b]).
const lerpRgb = (rgb1, rgb2, t) => {
  return [(1 - t) * rgb1[0] + t * rgb2[0], (1 - t) * rgb1[1] + t * rgb2[1], (1 - t) * rgb1[2] + t * rgb2[2]];
}

let active_tasks = 0;

const FractalCanvas = ({ width, height, query, props, incTasks, decTasks }) => {

  const workers = [];

  const taskCount = useSelector((state) => {
    return state.info.active_tasks;
  });

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

  // Calculate the bounds of the canvas in fractal space.
  const ratio = width / height;
  const x0 = nav.x - ((BASE_NUMBER_RANGE * ratio) / nav.z);
  const x1 = nav.x + ((BASE_NUMBER_RANGE * ratio) / nav.z);
  const y0 = nav.y - (BASE_NUMBER_RANGE / nav.z);
  const y1 = nav.y + (BASE_NUMBER_RANGE / nav.z);

  // Calculate the x and y scales (should be equal).
  const xScale = Math.abs(x1 - x0) / width;
  const yScale = Math.abs(y1 - y0) / height;

  //const blockSteps = [100, 50, 20, 4, 1];
  const blockSteps = [256, 64, 16, 4, 1];

  const worker_count = 8;

  useEffect(() => {

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    let t0 = performance.now();
    let pscale = (palette.length - 1) / max;

    if (sizePropsRef.current.width !== width || sizePropsRef.current.height !== height) {
      sizePropsRef.current = { width: width, height: height };
      setNav({ ...nav, step: 0 });
    }

    let blockSize = blockSteps[nav.step];
    let smooth = true;

    const paintHandler = (spx, spy, width, height, blockSize, max, values) => {
      //console.log('painter', { spx, spy, width, height, blockSize, max, values });
      let b = 0;
      for (let py = 0; py < height; py += blockSize) {
        for (let px = 0; px < width; px += blockSize) {

          let rgb;
          let i = values[b++];

          if (smooth) {
            let rgb1 = i < max - 1 ? palette[Math.floor(pscale * i)] : [0, 0, 0];
            let rgb2 = i < max - 1 ? palette[Math.floor(pscale * (i + 1))] : [0, 0, 0];
            rgb = lerpRgb(rgb1, rgb2, i % 1);
          } else {
            rgb = i < max ? palette[Math.floor(pscale * i)] : [0, 0, 0];
          }

          ctx.fillStyle = `rgb(${Math.floor(rgb[0])},${Math.floor(rgb[1])},${Math.floor(rgb[2])})`;
          ctx.fillRect(spx + px, spy + py, blockSize, blockSize);
        }
      }

      //decTasks();
      active_tasks--;
      // console.log(active_tasks);
    };

    if (workers.length < 1) {
      const code = MandelbrotWorker.toString();
      const blob = new Blob([`(${code})()`]);
      const blobURL = URL.createObjectURL(blob);

      for (let i = 0; i < worker_count; i++) {
        console.log(`worker ${i}`);
        let worker = new Worker(blobURL);
        worker.addEventListener('message', e => {
          //console.log('worker', e.data);
          paintHandler(e.data.px, e.data.py, e.data.width, e.data.height, e.data.blockSize, e.data.max, e.data.values);
        });
        workers[i] = worker;
      }
    }

    let w = 0;

    for (let py = 0; py < height; py += blockSize) {
      //for (let px = 0; px < width; px += blockSize) {

      workers[(w++ % worker_count)].postMessage({
        cmd: WorkerCommands.START,
        // px: px,
        px: 0,
        py: py,
        // xs: x0 + (px * xScale),
        x0: x0,
        // ys: y0 + (py * yScale),
        y0: y0,
        xScale: xScale,
        yScale: yScale,
        width: width,
        height: 1,
        blockSize: blockSize,
        max: max,
        smooth: smooth
      });

      //incTasks();
      active_tasks++;

      //}
    }

    let t1 = performance.now();
    console.log(`Canvas render: ${width} x ${height} | (${nav.x},${nav.y}) x${nav.z} | [${blockSize}] ${Math.round((t1 - t0) * 10000) / 10000} ms.`);

    if (blockSize === 1) {
      workers.forEach((worker) => { worker.postMessage({ cmd: WorkerCommands.STOP }) });
    }

    //console.log(nav);
    if (nav.step < blockSteps.length - 1) {
      setNav({ ...nav, step: ++nav.step, t: Math.random() });
    }

    const clickHandler = (e) => {
      console.log(`click: ${e.offsetX}, ${e.offsetY}`, e);
      if (!e.ctrlKey) {
        setNav({ ...nav, x: x0 + (xScale * e.offsetX), y: y0 + (yScale * e.offsetY), z: nav.z * 2, step: 0, t: Math.random() });
      } else if (nav.z > 1) {
        setNav({ ...nav, x: x0 + (xScale * e.offsetX), y: y0 + (yScale * e.offsetY), z: nav.z / 2, step: 0, t: Math.random() });
      }
    };

    const wheelHandler = (e) => {
      console.log(`wheel: ${e.deltaY}`, e);
      if (e.deltaY < 0) {
        setNav({ x: x0 + (xScale * e.offsetX), y: y0 + (yScale * e.offsetY), z: nav.z * 2, step: 0, t: Math.random() });
      } else {
        if (nav.z > 1) {
          setNav({ x: x0 + (xScale * e.offsetX), y: y0 + (yScale * e.offsetY), z: nav.z / 2, step: 0, t: Math.random() });
        } else {
          setNav({ x: x0 + (xScale * e.offsetX), y: y0 + (yScale * e.offsetY), step: 0, t: Math.random() });
        }
      }
    };

    canvas.addEventListener('click', clickHandler);
    canvas.addEventListener('wheel', wheelHandler);

    return (() => {
      canvas.removeEventListener('click', clickHandler);
      canvas.removeEventListener('wheel', wheelHandler);
    });
  }, [width, height, palette, blockSteps, nav, x0, xScale, y0, yScale]);


  return (
    <div>
      <canvas ref={canvasRef} width={width} height={height}>
      </canvas>
      <InfoPanel nav={nav} tasks={active_tasks}></InfoPanel>
    </div>
  );
}

export default connect(
  (state) => { return { info: state.info } },
  { incTasks, decTasks }
)(FractalCanvas);
