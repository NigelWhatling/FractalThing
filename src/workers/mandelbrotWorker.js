/* eslint-disable no-restricted-globals */

import * as WorkerCommands from '../workers/workerCommands';

export default () => {
    self.addEventListener('message', (e) => {
        let data = e.data;
        switch (data.cmd) {

            case WorkerCommands.START:
                let x = 0;
                let y = 0;
                let i = 0;

                let r2 = 0;
                let i2 = 0;
                let z2 = 0;

                while (r2 + i2 <= 4 && i < data.max) {
                    x = r2 - i2 + data.xs;
                    y = z2 - r2 - i2 + data.ys;
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

                self.postMessage({
                    px: data.px,
                    py: data.py,
                    i: i
                });
                break;

            case WorkerCommands.STOP:
                self.close(); // Terminate the worker.
                break;

            default:
                // todo
        };
    }, false);
}