import {
  START,
  STOP,
  type WorkerRequestMessage,
  type WorkerResponseMessage,
} from './WorkerCommands';

const workerContext = self as DedicatedWorkerGlobalScope;

workerContext.addEventListener('message', (event: MessageEvent<WorkerRequestMessage>) => {
  const data = event.data;
  switch (data.cmd) {
    case START: {
      const values: number[] = [];

      for (let py = 0; py < data.height; py += data.blockSize) {
        for (let px = 0; px < data.width; px += data.blockSize) {
          const realSeed = data.x0 + (data.px + px) * data.xScale;
          const imagSeed = data.y0 + (data.py + py) * data.yScale;

          let realPart = 0;
          let imagPart = 0;
          let iteration = 0;

          let realSquared = 0;
          let imagSquared = 0;
          let sumSquared = 0;

          while (realSquared + imagSquared <= 4 && iteration < data.max) {
            realPart = realSquared - imagSquared + realSeed;
            imagPart = sumSquared - realSquared - imagSquared + imagSeed;
            realSquared = realPart * realPart;
            imagSquared = imagPart * imagPart;
            sumSquared = (realPart + imagPart) * (realPart + imagPart);
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
});
