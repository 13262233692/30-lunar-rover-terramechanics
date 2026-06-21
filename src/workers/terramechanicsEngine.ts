import { SoilParams, WheelParams, WheelState } from '../store/types';

const MAX_WHEELS = 6;

interface EngineState {
  soil: SoilParams;
  wheels: WheelParams[];
  wheelStates: WheelState[];
  resolution: number;
  heightData: Float32Array;
  rutBuffer: Float32Array;
  rutAccumulator: Float32Array;
}

const state: EngineState = {
  soil: { phi: 0.63, c: 170, k_c: 1400, k_phi: 820000, K: 0.018, rho: 1550, n: 1.0 },
  wheels: Array.from({ length: MAX_WHEELS }, () => ({ radius: 0.15, width: 0.12, openRatio: 0.3, load: 55 })),
  wheelStates: Array.from({ length: MAX_WHEELS }, () => ({ sinkage: 0, drawbarPull: 0, slipRatio: 0, motionResistance: 0, contactPressure: 0 })),
  resolution: 128,
  heightData: new Float32Array(128 * 128),
  rutBuffer: new Float32Array(128 * 128),
  rutAccumulator: new Float32Array(128 * 128),
};

function getHeightAt(x: number, z: number): number {
  const res = state.resolution;
  const halfW = 10;
  const nx = (x + halfW) / 20;
  const nz = (z + halfW) / 20;
  const fx = nx * (res - 1);
  const fz = nz * (res - 1);
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const ix1 = Math.min(ix + 1, res - 1);
  const iz1 = Math.min(iz + 1, res - 1);
  const ix0 = Math.max(0, Math.min(ix, res - 1));
  const iz0 = Math.max(0, Math.min(iz, res - 1));

  const h00 = state.heightData[iz0 * res + ix0];
  const h10 = state.heightData[iz0 * res + ix1];
  const h01 = state.heightData[iz1 * res + ix0];
  const h11 = state.heightData[iz1 * res + ix1];

  const h0 = h00 * (1 - tx) + h10 * tx;
  const h1 = h01 * (1 - tx) + h11 * tx;
  return h0 * (1 - tz) + h1 * tz;
}

function applyRutAtPosition(x: number, z: number, depth: number, wheelWidth: number, heading: number, wheelLength: number): void {
  const res = state.resolution;
  const cellSize = 20 / res;

  const radius_x = Math.max(2, Math.ceil((wheelWidth * 0.65) / cellSize) + 1);
  const radius_z = Math.max(2, Math.ceil((wheelLength * 0.85) / cellSize) + 1);
  const halfW = 10;
  const cx = (x + halfW) / 20 * (res - 1);
  const cz = (z + halfW) / 20 * (res - 1);

  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);

  const maxR = Math.max(radius_x, radius_z);
  const cx0 = Math.floor(cx);
  const cz0 = Math.floor(cz);

  for (let dz = -maxR; dz <= maxR; dz++) {
    const pz = cz0 + dz;
    if (pz < 0 || pz >= res) continue;
    const zFrac = pz + 0.5 - cz;
    for (let dx = -maxR; dx <= maxR; dx++) {
      const px = cx0 + dx;
      if (px < 0 || px >= res) continue;
      const xFrac = px + 0.5 - cx;

      const localX = xFrac * cosH + zFrac * sinH;
      const localZ = -xFrac * sinH + zFrac * cosH;

      const nx = localX / radius_x;
      const nz = localZ / radius_z;
      const distSq = nx * nx + nz * nz;

      if (distSq > 1.0) continue;

      const t = 1 - distSq;
      const falloff = t * t * t;

      const depression = depth * falloff * 0.85;
      const idx = pz * res + px;
      state.rutAccumulator[idx] += depression;
    }
  }
}

function computeSinkageBekker(W: number, b: number, r: number): number {
  const k_eq = state.soil.k_c / b + state.soil.k_phi;
  if (k_eq <= 0 || W <= 0) return 0;

  let theta_f: number;
  if (r <= 0) theta_f = 0.3;
  else {
    const A = W / (b * k_eq * Math.pow(r, state.soil.n + 1));
    const theta_candidate = Math.pow(Math.max(1e-12, A * (state.soil.n + 1)), 1 / (state.soil.n + 2));
    theta_f = Math.min(0.8, Math.max(0.005, theta_candidate));
  }

  let z = r * (1 - Math.cos(theta_f));
  const max_sinkage = r * 0.25;
  z = Math.min(z, max_sinkage);

  for (let iter = 0; iter < 20; iter++) {
    const theta = Math.acos(Math.max(-1, Math.min(1, 1 - Math.min(z, r * 0.99) / r)));
    const L_curr = r * Math.sin(theta);
    if (L_curr <= 0.001) {
      z = Math.min(z * 1.2, max_sinkage);
      continue;
    }

    const denom = b * L_curr * k_eq;
    if (denom <= 0) break;

    const z_new = Math.pow(W / denom, 1 / Math.max(0.3, state.soil.n));
    const delta = Math.abs(z_new - z);

    const omega = 0.5 + 0.1 * iter;
    z = z + omega * (z_new - z);

    if (z > max_sinkage) z = max_sinkage;
    if (z < 0) z = 0;

    if (delta < 1e-7) break;
  }

  return z;
}

function computeCompactionResistance(W: number, b: number, z: number): number {
  if (z < 1e-6) return 0;
  const { n, k_c, k_phi, c } = state.soil;
  const k_eq = k_c / b + k_phi;

  const F_compact = (b * k_eq * Math.pow(z, n + 1)) / (n + 1);
  const F_cohesion = (n - 1 > 0 ? (n - 1) * b * c * z * z * 0.5 : 0);

  return (F_compact + F_cohesion) / Math.max(z, 1e-6) * 0.015;
}

function computeBullDozingResistance(b: number, z: number): number {
  if (z < 1e-5) return 0;
  const phi = state.soil.phi;
  const tanPhi = Math.tan(phi);

  const N_c = (Math.PI + 2) * Math.exp(Math.PI * tanPhi) * tanPhi / (1 + Math.sin(phi));
  const N_gamma = 2 * (N_c + 1) * tanPhi * Math.sin(phi);
  const gamma = state.soil.rho * 1.62;

  const R_b = (state.soil.c * N_c + 0.5 * gamma * z * N_gamma) * b * z * 0.35;

  return Math.max(0, R_b);
}

export function init(heightData: Float32Array, resolution: number): void {
  state.resolution = resolution;
  state.heightData = new Float32Array(heightData);
  state.rutBuffer = new Float32Array(resolution * resolution);
  state.rutAccumulator = new Float32Array(resolution * resolution);
  for (let i = 0; i < MAX_WHEELS; i++) {
    state.wheelStates[i] = { sinkage: 0, drawbarPull: 0, slipRatio: 0, motionResistance: 0, contactPressure: 0 };
  }
}

export function setSoilParams(params: SoilParams): void {
  state.soil = { ...params };
}

export function setWheelParams(index: number, params: WheelParams): void {
  if (index >= 0 && index < MAX_WHEELS) {
    state.wheels[index] = { ...params };
  }
}

export function step(
  dt: number,
  roverX: number,
  roverZ: number,
  roverHeading: number,
  roverSpeed: number
): { wheelStates: WheelState[]; rutBuffer: Float32Array } {
  const wheelOffsets: [number, number][] = [
    [-0.35, -0.30], [0.35, -0.30],
    [-0.40, 0.00], [0.40, 0.00],
    [-0.35, 0.30], [0.35, 0.30],
  ];

  const cosH = Math.cos(roverHeading);
  const sinH = Math.sin(roverHeading);

  for (let i = 0; i < MAX_WHEELS; i++) {
    const localOffX = wheelOffsets[i][0];
    const localOffZ = wheelOffsets[i][1];

    const wx = roverX + localOffX * cosH - localOffZ * sinH;
    const wz = roverZ + localOffX * sinH + localOffZ * cosH;

    const W = state.wheels[i].load;
    const b = state.wheels[i].width;
    const r = state.wheels[i].radius;
    const openRatio = state.wheels[i].openRatio;
    const effectiveB = b * (1 - openRatio * 0.45);

    const z = computeSinkageBekker(W, effectiveB, r);

    const theta_f = Math.acos(Math.max(-1, Math.min(1, 1 - Math.min(z, r * 0.99) / r)));
    const L = r * Math.sin(theta_f);
    const A_contact = Math.max(0.0001, effectiveB * L);
    const p = W / A_contact;

    const R_c = computeCompactionResistance(W, effectiveB, z);
    const R_b = computeBullDozingResistance(effectiveB, z);
    const R_total = Math.max(0.5, R_c + R_b);

    let slipRatio = 0;
    let drawbarPull = 0;
    let H = 0;

    const tau_max = state.soil.c + p * Math.tan(state.soil.phi);
    const H_max = tau_max * A_contact;

    if (Math.abs(roverSpeed) > 0.005) {
      slipRatio = 0.02 + 0.18 * Math.min(1, z / (r * 0.20));
      slipRatio = Math.max(0.01, Math.min(0.45, slipRatio));

      const j = slipRatio * L;
      const tau = tau_max * (1 - Math.exp(-Math.max(1e-6, j) / state.soil.K));
      H = tau * A_contact;

      drawbarPull = H - R_total;
    } else {
      slipRatio = 0.001;
      drawbarPull = Math.max(0, H_max * 0.15 - R_total);
      H = drawbarPull + R_total;
    }

    state.wheelStates[i] = {
      sinkage: z,
      drawbarPull: drawbarPull,
      slipRatio: slipRatio,
      motionResistance: R_total,
      contactPressure: p,
    };

    if (z > 0.0005) {
      applyRutAtPosition(wx, wz, z, effectiveB, roverHeading, L);
    }
  }

  state.rutBuffer.set(state.rutAccumulator);
  state.rutAccumulator.fill(0);

  return {
    wheelStates: state.wheelStates.map(s => ({ ...s })),
    rutBuffer: new Float32Array(state.rutBuffer),
  };
}

export function reset(): void {
  state.rutBuffer = new Float32Array(state.resolution * state.resolution);
  state.rutAccumulator = new Float32Array(state.resolution * state.resolution);
  for (let i = 0; i < MAX_WHEELS; i++) {
    state.wheelStates[i] = { sinkage: 0, drawbarPull: 0, slipRatio: 0, motionResistance: 0, contactPressure: 0 };
  }
}
