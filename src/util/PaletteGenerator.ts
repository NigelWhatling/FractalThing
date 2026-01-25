export type PaletteStop = {
  position: number;
  colour: string;
};

export const DEFAULT_PALETTE_STOPS: PaletteStop[] = [
  { position: 0, colour: '#000764' },
  { position: 0.16, colour: '#206BCB' },
  { position: 0.42, colour: '#EDFFFF' },
  { position: 0.6425, colour: '#FFAA00' },
  { position: 0.8575, colour: '#000200' },
  { position: 1, colour: '#000064' },
];

const parseHexColour = (value: string): [number, number, number] | null => {
  if (!value) {
    return null;
  }
  const hex = value.trim().replace('#', '');
  if (hex.length === 3) {
    const expanded = hex
      .split('')
      .map((char) => char + char)
      .join('');
    const int = Number.parseInt(expanded, 16);
    if (Number.isNaN(int)) {
      return null;
    }
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  }
  if (hex.length !== 6) {
    return null;
  }
  const int = Number.parseInt(hex, 16);
  if (Number.isNaN(int)) {
    return null;
  }
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normaliseStops = (stops: PaletteStop[]): { position: number; rgb: number[] }[] => {
  const parsed = stops
    .map((stop) => {
      const position = clamp(Number(stop.position), 0, 1);
      const rgb = parseHexColour(stop.colour);
      if (!rgb) {
        return null;
      }
      return { position, rgb };
    })
    .filter((stop): stop is { position: number; rgb: number[] } => Boolean(stop));

  if (parsed.length < 2) {
    return normaliseStops(DEFAULT_PALETTE_STOPS);
  }

  parsed.sort((a, b) => a.position - b.position);

  const unique: { position: number; rgb: number[] }[] = [];
  const epsilon = 0.0001;
  parsed.forEach((stop) => {
    const last = unique[unique.length - 1];
    if (last && Math.abs(stop.position - last.position) <= epsilon) {
      unique[unique.length - 1] = stop;
    } else {
      unique.push(stop);
    }
  });

  if (unique[0]?.position > 0) {
    unique.unshift({ position: 0, rgb: unique[0].rgb });
  }
  if (unique[unique.length - 1]?.position < 1) {
    unique.push({ position: 1, rgb: unique[unique.length - 1].rgb });
  }

  return unique;
};

const PaletteGenerator = (
  size: number,
  stops: PaletteStop[] = DEFAULT_PALETTE_STOPS
): number[][] => {
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

  const resolvedStops = normaliseStops(stops);
  const xs = resolvedStops.map((stop) => stop.position);
  const rs = resolvedStops.map((stop) => stop.rgb[0]);
  const gs = resolvedStops.map((stop) => stop.rgb[1]);
  const bs = resolvedStops.map((stop) => stop.rgb[2]);

  const interpolantR = createInterpolant(xs, rs);
  const interpolantG = createInterpolant(xs, gs);
  const interpolantB = createInterpolant(xs, bs);

  const palette: number[][] = [];
  for (let index = 0; index <= size; index += 1) {
    const ratio = index / size;
    palette[index] = [interpolantR(ratio), interpolantG(ratio), interpolantB(ratio)];
  }

  return palette;
};

export default PaletteGenerator;
