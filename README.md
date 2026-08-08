[![Netlify Status](https://api.netlify.com/api/v1/badges/be80390e-51e4-42f4-8beb-ac4b71baec8f/deploy-status)](https://app.netlify.com/sites/fractalthing/deploys)

# FractalThing

FractalThing is an interactive deep-zoom fractal explorer built with React, TypeScript, Web Workers and WebGL. It started as a small React experiment, sat neglected for a few years, and came back with a considerably more serious rendering engine.

It currently explores five fractal families:

- Mandelbrot
- Julia
- Burning Ship
- Tricorn (Mandelbar)
- Multibrot, power 3

## Rendering engine

The renderer has two independently managed backends:

- **CPU workers** use a bounded job scheduler, progressive tiles and transferable typed-array results. The hot loop is specialised once per algorithm and includes Mandelbrot cardioid/bulb rejection, exact Brent-style periodicity detection and an expanded bailout for smoother colouring.
- **WebGL** supports ordinary float, double-double and selectable 12-limb fixed-point modes. Limb mode receives exact decimal viewport origins, retaining detail after an absolute JavaScript `number` can no longer represent neighbouring coordinates.

Mandelbrot views at `10^12` zoom and beyond automatically use CPU perturbation. One BigInt fixed-point reference orbit is cached per worker/render; pixels are evaluated as Float64 deltas, checked with the Pauldelbrot relative-error criterion, and resolved with a direct high-precision fallback when a glitch is detected. Other fractal families retain their specialised CPU and limb-shader paths because the quadratic Mandelbrot perturbation recurrence does not apply to them unchanged.

Coordinates in routes are stored as exact decimal coefficients and exponents. Pan and zoom operations add relative pixel deltas to those values instead of repeatedly rounding the centre through a 53-bit JavaScript number.

Colouring includes cyclic, fixed, normalised and CPU histogram/distribution modes, custom palettes, progressive iteration refinement and presentation filters.

## Architecture

Rendering resources and UI state have deliberately separate lifecycles:

- `src/engine/cpu/CpuRenderer.ts` owns workers, scheduling, tiles and CPU canvas output.
- `src/engine/gpu/WebGLRenderer.ts` owns the WebGL context, programs, textures, progressive passes, timers and context restoration.
- `src/hooks/useFractalRenderer.ts` translates React settings into controller requests.
- `src/hooks/useCanvasInteractions.ts` owns pointer, wheel, keyboard and selection navigation.
- `src/engine/viewport.ts` owns exact URL coordinates and viewport geometry.
- `src/components/drawer/` contains the focused settings and palette-editor features composed by `SideDrawer`.

The worker maths and precision modules are independently testable without rendering a canvas.

## Development

Use a Node version supported by Vite (`^20.19.0` or `>=22.12.0`), then run:

```sh
npm install
npm run dev
```

Verification commands:

```sh
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
```

## What are fractals?

A fractal is a structure whose detail repeats or remains complex across scales. For this project, the practical result is an effectively endless collection of shapes that can be explored and coloured into images like this:

![Fractal](https://raw.githubusercontent.com/NigelWhatling/FractalThing/master/docs/images/fractal.png)

The underlying algorithms follow widely documented escape-time fractal techniques. A useful starting point is [the Mandelbrot set article on Wikipedia](https://en.wikipedia.org/wiki/Mandelbrot_set).
