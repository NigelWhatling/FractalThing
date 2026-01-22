const PaletteGenerator = (size: number): number[][] => {
  const createInterpolant = (xs: number[], ys: number[]) => {
    let length = xs.length;

    if (length !== ys.length) {
      throw new Error('Need an equal count of xs and ys.');
    }
    if (length === 0) {
      return () => 0;
    }
    if (length === 1) {
      const result = +ys[0];
      return () => result;
    }

    const indexes: number[] = [];
    for (let index = 0; index < length; index += 1) {
      indexes.push(index);
    }
    indexes.sort((a, b) => (xs[a] < xs[b] ? -1 : 1));
    const oldXs = xs;
    const oldYs = ys;
    xs = [];
    ys = [];
    for (let index = 0; index < length; index += 1) {
      xs.push(+oldXs[indexes[index]]);
      ys.push(+oldYs[indexes[index]]);
    }

    const dys: number[] = [];
    const dxs: number[] = [];
    const ms: number[] = [];
    for (let index = 0; index < length - 1; index += 1) {
      const dx = xs[index + 1] - xs[index];
      const dy = ys[index + 1] - ys[index];
      dxs.push(dx);
      dys.push(dy);
      ms.push(dy / dx);
    }

    const c1s: number[] = [ms[0]];
    for (let index = 0; index < dxs.length - 1; index += 1) {
      const slope = ms[index];
      const nextSlope = ms[index + 1];
      if (slope * nextSlope <= 0) {
        c1s.push(0);
      } else {
        const dx = dxs[index];
        const dxNext = dxs[index + 1];
        const common = dx + dxNext;
        c1s.push(3 * common / ((common + dxNext) / slope + (common + dx) / nextSlope));
      }
    }
    c1s.push(ms[ms.length - 1]);

    const c2s: number[] = [];
    const c3s: number[] = [];
    for (let index = 0; index < c1s.length - 1; index += 1) {
      const c1 = c1s[index];
      const slope = ms[index];
      const invDx = 1 / dxs[index];
      const common = c1 + c1s[index + 1] - slope - slope;
      c2s.push((slope - c1 - common) * invDx);
      c3s.push(common * invDx * invDx);
    }

    return (value: number) => {
      let index = xs.length - 1;
      if (value === xs[index]) {
        return ys[index];
      }

      let low = 0;
      let mid = 0;
      let high = c3s.length - 1;
      while (low <= high) {
        mid = Math.floor(0.5 * (low + high));
        const valueHere = xs[mid];
        if (valueHere < value) {
          low = mid + 1;
        } else if (valueHere > value) {
          high = mid - 1;
        } else {
          return ys[mid];
        }
      }
      index = Math.max(0, high);

      const delta = value - xs[index];
      const deltaSq = delta * delta;
      return ys[index] + c1s[index] * delta + c2s[index] * deltaSq + c3s[index] * delta * deltaSq;
    };
  };

  const interpolantR = createInterpolant(
    [0.0, 0.16, 0.42, 0.6425, 0.8575, 1.0],
    [0, 32, 237, 255, 0, 0]
  );
  const interpolantG = createInterpolant(
    [0.0, 0.16, 0.42, 0.6425, 0.8575, 1.0],
    [7, 107, 255, 170, 2, 0]
  );
  const interpolantB = createInterpolant(
    [0.0, 0.16, 0.42, 0.6425, 0.8575, 1.0],
    [100, 203, 255, 0, 0, 100]
  );

  const palette: number[][] = [];
  for (let index = 0; index <= size; index += 1) {
    const ratio = index / size;
    palette[index] = [interpolantR(ratio), interpolantG(ratio), interpolantB(ratio)];
  }

  return palette;
};

export default PaletteGenerator;
