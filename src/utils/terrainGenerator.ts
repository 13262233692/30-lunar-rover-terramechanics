const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

class SimplexNoise {
  private perm: number[];
  private gradP: number[][];

  constructor(seed: number = 0) {
    this.perm = new Array(512);
    this.gradP = new Array(512);
    const p = new Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807 + 0) % 2147483647;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.gradP[i] = GRAD3[this.perm[i] % 12];
    }
  }

  private dot3(g: number[], x: number, y: number, z: number): number {
    return g[0] * x + g[1] * y + g[2] * z;
  }

  noise2D(xin: number, yin: number): number {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    let i1: number, j1: number;
    if (x0 > y0) { i1 = 1; j1 = 0; }
    else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = this.perm[ii + this.perm[jj]] % 12;
    const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12;
    const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * (this.gradP[gi0][0] * x0 + this.gradP[gi0][1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * (this.gradP[gi1][0] * x1 + this.gradP[gi1][1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * (this.gradP[gi2][0] * x2 + this.gradP[gi2][1] * y2); }
    return 70 * (n0 + n1 + n2);
  }
}

export function generateTerrainHeightmap(
  width: number,
  depth: number,
  resolution: number,
  seed: number = 42
): Float32Array {
  const simplex = new SimplexNoise(seed);
  const heights = new Float32Array(resolution * resolution);
  const halfW = width / 2;
  const halfD = depth / 2;

  for (let iz = 0; iz < resolution; iz++) {
    for (let ix = 0; ix < resolution; ix++) {
      const x = (ix / (resolution - 1)) * width - halfW;
      const z = (iz / (resolution - 1)) * depth - halfD;

      let h = 0;
      h += simplex.noise2D(x * 0.15, z * 0.15) * 1.2;
      h += simplex.noise2D(x * 0.4, z * 0.4) * 0.5;
      h += simplex.noise2D(x * 1.0, z * 1.0) * 0.15;
      h += simplex.noise2D(x * 2.5, z * 2.5) * 0.05;

      const distFromCenter = Math.sqrt(x * x + z * z);
      const edgeFade = Math.max(0, 1 - distFromCenter / (halfW * 0.9));
      h *= edgeFade;

      heights[iz * resolution + ix] = h;
    }
  }

  return heights;
}

export function getHeightAtPosition(
  heights: Float32Array,
  resolution: number,
  terrainWidth: number,
  terrainDepth: number,
  x: number,
  z: number
): number {
  const halfW = terrainWidth / 2;
  const halfD = terrainDepth / 2;
  const nx = (x + halfW) / terrainWidth;
  const nz = (z + halfD) / terrainDepth;
  const fx = nx * (resolution - 1);
  const fz = nz * (resolution - 1);
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const ix1 = Math.min(ix + 1, resolution - 1);
  const iz1 = Math.min(iz + 1, resolution - 1);
  const ix0 = Math.max(0, Math.min(ix, resolution - 1));
  const iz0 = Math.max(0, Math.min(iz, resolution - 1));

  const h00 = heights[iz0 * resolution + ix0];
  const h10 = heights[iz0 * resolution + ix1];
  const h01 = heights[iz1 * resolution + ix0];
  const h11 = heights[iz1 * resolution + ix1];

  const h0 = h00 * (1 - tx) + h10 * tx;
  const h1 = h01 * (1 - tx) + h11 * tx;
  return h0 * (1 - tz) + h1 * tz;
}

const _lunarPalette = [
  { t: 0.00, r: 0.38, g: 0.36, b: 0.34 },
  { t: 0.25, r: 0.48, g: 0.45, b: 0.42 },
  { t: 0.50, r: 0.56, g: 0.53, b: 0.49 },
  { t: 0.75, r: 0.64, g: 0.60, b: 0.56 },
  { t: 1.00, r: 0.72, g: 0.68, b: 0.62 },
];

const _marsPalette = [
  { t: 0.00, r: 0.18, g: 0.09, b: 0.06 },
  { t: 0.25, r: 0.42, g: 0.18, b: 0.10 },
  { t: 0.50, r: 0.58, g: 0.28, b: 0.14 },
  { t: 0.75, r: 0.70, g: 0.38, b: 0.18 },
  { t: 1.00, r: 0.82, g: 0.48, b: 0.22 },
];

export function terrainColorAtHeight(
  t: number,
  seed: number = 42
): [number, number, number] {
  const palette = seed === 42 ? _lunarPalette : _marsPalette;
  const tc = Math.max(0, Math.min(1, t));
  for (let i = 0; i < palette.length - 1; i++) {
    const a = palette[i];
    const b = palette[i + 1];
    if (tc >= a.t && tc <= b.t) {
      const u = (tc - a.t) / (b.t - a.t);
      const noise = ((Math.sin(tc * 91.3 + seed) + 1) * 0.5) * 0.05;
      return [
        Math.max(0, Math.min(1, a.r + (b.r - a.r) * u + noise - 0.025)),
        Math.max(0, Math.min(1, a.g + (b.g - a.g) * u + noise * 0.8 - 0.02)),
        Math.max(0, Math.min(1, a.b + (b.b - a.b) * u + noise * 0.5 - 0.015)),
      ];
    }
  }
  const last = palette[palette.length - 1];
  return [last.r, last.g, last.b];
}
