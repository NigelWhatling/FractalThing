import {
  START,
  STOP,
  type WorkerRequestMessage,
  type WorkerResponseMessage,
} from './WorkerCommands';

const workerContext = globalThis as DedicatedWorkerGlobalScope;

workerContext.addEventListener(
  'message',
  (event: MessageEvent<WorkerRequestMessage>) => {
    const data = event.data;
    switch (data.cmd) {
      case START: {
        const values: number[] = [];

        for (let py = 0; py < data.height; py += data.blockSize) {
          for (let px = 0; px < data.width; px += data.blockSize) {
            const realSeed = data.x0 + (data.px + px) * data.xScale;
            const imagSeed = data.y0 + (data.py + py) * data.yScale;

            let realPart = data.algorithm === 'julia' ? realSeed : 0;
            let imagPart = data.algorithm === 'julia' ? imagSeed : 0;
            const cReal = data.algorithm === 'julia' ? data.juliaCr : realSeed;
            const cImag = data.algorithm === 'julia' ? data.juliaCi : imagSeed;

            let iteration = 0;
            let realSquared = realPart * realPart;
            let imagSquared = imagPart * imagPart;

            while (realSquared + imagSquared <= 4 && iteration < data.max) {
              switch (data.algorithm) {
                case 'burning-ship': {
                  const absReal = Math.abs(realPart);
                  const absImag = Math.abs(imagPart);
                  const absRealSq = absReal * absReal;
                  const absImagSq = absImag * absImag;
                  const nextReal = absRealSq - absImagSq + cReal;
                  const nextImag = 2 * absReal * absImag + cImag;
                  realPart = nextReal;
                  imagPart = nextImag;
                  break;
                }
                case 'tricorn': {
                  const nextReal = realSquared - imagSquared + cReal;
                  const nextImag = -2 * realPart * imagPart + cImag;
                  realPart = nextReal;
                  imagPart = nextImag;
                  break;
                }
                case 'multibrot-3': {
                  const realSq = realSquared;
                  const imagSq = imagSquared;
                  const nextReal =
                    realSq * realPart - 3 * realPart * imagSq + cReal;
                  const nextImag =
                    3 * realSq * imagPart - imagSq * imagPart + cImag;
                  realPart = nextReal;
                  imagPart = nextImag;
                  break;
                }
                case 'julia':
                case 'mandelbrot':
                default: {
                  const nextReal = realSquared - imagSquared + cReal;
                  const nextImag = 2 * realPart * imagPart + cImag;
                  realPart = nextReal;
                  imagPart = nextImag;
                  break;
                }
              }

              realSquared = realPart * realPart;
              imagSquared = imagPart * imagPart;
              iteration += 1;
            }

            if (data.smooth && iteration < data.max) {
              const logZn = Math.log(realSquared + imagSquared) / 2;
              const nu = Math.log(logZn / Math.log(2)) / Math.log(2);
              iteration = iteration + 1 - nu;
            }

            values.push(iteration);
          }
        }

        const response: WorkerResponseMessage = {
          renderId: data.renderId,
          tileId: data.tileId,
          stepIndex: data.stepIndex,
          px: data.px,
          py: data.py,
          width: data.width,
          height: data.height,
          blockSize: data.blockSize,
          max: data.max,
          values,
        };

        workerContext.postMessage(response);
        break;
      }
      case STOP:
        workerContext.close();
        break;
      default:
        break;
    }
  },
);
