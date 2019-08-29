/* eslint-disable no-restricted-globals */

// this doesn't work
// import * as WorkerCommands from './workerCommands';

export default () => {
    self.addEventListener('message', (e) => {
        let data = e.data;
        switch (data.cmd) {

            case 'start':

                let values = [];

                for (let py = 0; py < data.height; py += data.blockSize) {
                    for (let px = 0; px < data.width; px += data.blockSize) {

                        let xs = data.x0 + ((data.px + px) * data.xScale);
                        let ys = data.y0 + ((data.py + py) * data.yScale);

                        let x = 0;
                        let y = 0;
                        let i = 0;

                        let r2 = 0;
                        let i2 = 0;
                        let z2 = 0;

                        while (r2 + i2 <= 4 && i < data.max) {
                            x = r2 - i2 + xs;
                            y = z2 - r2 - i2 + ys;
                            r2 = x * x;
                            i2 = y * y;
                            z2 = (x + y) * (x + y);
                            i++;
                        }

                        if (data.smooth && i < data.max) {
                            let log_zn = Math.log(r2 + i2) / 2;
                            let nu = Math.log(log_zn / Math.log(2)) / Math.log(2);
                            i = i + 1 - nu;
                        }

                        values.push(i);
                    }
                }

                self.postMessage({
                    px: data.px,
                    py: data.py,
                    width: data.width,
                    height: data.height,
                    blockSize: data.blockSize,
                    max: data.max,
                    values: values
                });
                break;

            case 'stop':
                self.close(); // Terminate the worker.
                break;

            default:
            // todo
        };
    }, false);
}