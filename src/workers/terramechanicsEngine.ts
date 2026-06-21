import { SoilParams, WheelParams, WheelState, DirtyRegion, DiffLockState, WheelCondition, AxlePair } from '../store/types';
import { TERRAIN_RESOLUTION } from '../utils/soilPresets';
import { SAB_RUT_BUFFER_BYTE_OFFSET, FLAG_WORKER_WRITING, FLAG_MAIN_PENDING } from '../utils/sharedMemory';

const MAX_WHEELS = 6;
const BASE_TORQUE_PER_WHEEL = 2.5;

interface DiffLockConfig {
  enabled: boolean;
  slipThreshold: number;
  consecutiveFramesToLock: number;
  torqueTransferRate: number;
  warningThreshold: number;
  maxTorqueRatio: number;
  smoothingFactor: number;
}

interface EngineState {
  soil: SoilParams;
  wheels: WheelParams[];
  wheelStates: WheelState[];
  resolution: number;
  heightData: Float32Array;
  sharedRutBuffer: SharedArrayBuffer | null;
  sharedRutView: Float32Array | null;
  sharedMetaView: Int32Array | null;
  sharedMode: boolean;
  dirtyMinX: number;
  dirtyMaxX: number;
  dirtyMinZ: number;
  dirtyMaxZ: number;
  hasDirty: boolean;
  standaloneRut: Float32Array;
  standaloneRutAccum: Float32Array;
  frameCounter: number;
  diffLock: DiffLockConfig;
  consecutiveExcess: number[];
  prevSlipRatios: number[];
  torqueAllocations: number[];
  smoothedTorque: number[];
  diffLockState: DiffLockState;
  roverSpeed: number;
  targetSpeed: number;
}

const state: EngineState = {
  soil: { phi: 0.63, c: 170, k_c: 1400, k_phi: 820000, K: 0.018, rho: 1550, n: 1.0 },
  wheels: Array.from({ length: MAX_WHEELS }, () => ({ radius: 0.15, width: 0.12, openRatio: 0.3, load: 55 })),
  wheelStates: Array.from({ length: MAX_WHEELS }, () => ({
    sinkage: 0, drawbarPull: 0, slipRatio: 0, motionResistance: 0,
    contactPressure: 0, torqueAllocation: BASE_TORQUE_PER_WHEEL,
    angularVelocity: 0, groundSpeed: 0,
  })),
  resolution: 128,
  heightData: new Float32Array(128 * 128),
  sharedRutBuffer: null,
  sharedRutView: null,
  sharedMetaView: null,
  sharedMode: false,
  dirtyMinX: 0, dirtyMaxX: 0, dirtyMinZ: 0, dirtyMaxZ: 0,
  hasDirty: false,
  standaloneRut: new Float32Array(128 * 128),
  standaloneRutAccum: new Float32Array(128 * 128),
  frameCounter: 0,
  diffLock: {
    enabled: true,
    slipThreshold: 0.40,
    consecutiveFramesToLock: 3,
    torqueTransferRate: 0.85,
    warningThreshold: 0.25,
    maxTorqueRatio: 0.15,
    smoothingFactor: 0.3,
  },
  consecutiveExcess: new Array(MAX_WHEELS).fill(0),
  prevSlipRatios: new Array(MAX_WHEELS).fill(0),
  torqueAllocations: new Array(MAX_WHEELS).fill(BASE_TORQUE_PER_WHEEL),
  smoothedTorque: new Array(MAX_WHEELS).fill(BASE_TORQUE_PER_WHEEL),
  diffLockState: createEmptyDiffLockState(),
  roverSpeed: 0,
  targetSpeed: 0,
};

function createEmptyDiffLockState(): DiffLockState {
  return {
    enabled: true,
    slipThreshold: 0.40,
    consecutiveFramesToLock: 3,
    torqueTransferRate: 0.85,
    wheelConditions: Array.from({ length: MAX_WHEELS }, (_, i) => ({
      wheelIndex: i,
      slipRatio: 0,
      gripStatus: 'healthy' as const,
      tractionAvailable: BASE_TORQUE_PER_WHEEL,
      torqueRequested: BASE_TORQUE_PER_WHEEL,
      torqueActual: BASE_TORQUE_PER_WHEEL,
      excessConsecutiveFrames: 0,
    })),
    axlePairs: [
      { leftIndex: 0, rightIndex: 1, leftSlip: 0, rightSlip: 0, leftTorque: BASE_TORQUE_PER_WHEEL, rightTorque: BASE_TORQUE_PER_WHEEL, torqueTransferAmount: 0, torqueTransferDirection: 'none' as const, lockEngaged: false },
      { leftIndex: 2, rightIndex: 3, leftSlip: 0, rightSlip: 0, leftTorque: BASE_TORQUE_PER_WHEEL, rightTorque: BASE_TORQUE_PER_WHEEL, torqueTransferAmount: 0, torqueTransferDirection: 'none' as const, lockEngaged: false },
      { leftIndex: 4, rightIndex: 5, leftSlip: 0, rightSlip: 0, leftTorque: BASE_TORQUE_PER_WHEEL, rightTorque: BASE_TORQUE_PER_WHEEL, torqueTransferAmount: 0, torqueTransferDirection: 'none' as const, lockEngaged: false },
    ],
    activeLockCount: 0,
    totalTorqueRedistributed: 0,
    interventionCount: 0,
  };
}

function resetDirty(): void {
  state.dirtyMinX = state.resolution;
  state.dirtyMaxX = -1;
  state.dirtyMinZ = state.resolution;
  state.dirtyMaxZ = -1;
  state.hasDirty = false;
}

function markDirty(ix: number, iz: number): void {
  if (ix < state.dirtyMinX) state.dirtyMinX = ix;
  if (ix > state.dirtyMaxX) state.dirtyMaxX = ix;
  if (iz < state.dirtyMinZ) state.dirtyMinZ = iz;
  if (iz > state.dirtyMaxZ) state.dirtyMaxZ = iz;
  state.hasDirty = true;
}

function writeRutValue(idx: number, ix: number, iz: number, val: number): void {
  if (val <= 0.00005) return;
  if (state.sharedMode && state.sharedRutView) {
    state.sharedRutView[idx] += val;
  } else {
    state.standaloneRutAccum[idx] += val;
  }
  markDirty(ix, iz);
}

function applyRutAtPosition(
  x: number, z: number, depth: number, wheelWidth: number, heading: number, wheelLength: number
): void {
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
      writeRutValue(pz * res + px, px, pz, depression);
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
    if (L_curr <= 0.001) { z = Math.min(z * 1.2, max_sinkage); continue; }
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

function computeSlipRatio(
  wheelIndex: number,
  sinkage: number,
  wheelRadius: number,
  roverSpeed: number,
): number {
  const r = wheelRadius;
  const torqueFrac = state.torqueAllocations[wheelIndex] / BASE_TORQUE_PER_WHEEL;
  const targetOmega = (state.targetSpeed / Math.max(r, 0.01)) * torqueFrac;
  const actualGroundSpeed = Math.abs(roverSpeed);

  if (actualGroundSpeed < 0.005 && Math.abs(targetOmega) < 0.01) return 0.001;

  const wheelLinearSpeed = Math.abs(targetOmega) * r;

  if (wheelLinearSpeed < 1e-6 && actualGroundSpeed < 1e-6) return 0.001;

  let slip: number;
  const denom = Math.max(wheelLinearSpeed, actualGroundSpeed, 1e-6);
  if (wheelLinearSpeed > actualGroundSpeed) {
    slip = (wheelLinearSpeed - actualGroundSpeed) / denom;
  } else {
    slip = (actualGroundSpeed - wheelLinearSpeed) / denom;
  }

  const sinkageFactor = 0.02 + 0.18 * Math.min(1, sinkage / (r * 0.20));
  slip = Math.max(slip * 0.70 + sinkageFactor * 0.30, 0.001);
  slip = Math.min(slip, 0.95);

  return slip;
}

function runDiffLockController(slipRatios: number[], drawbarPulls: number[]): DiffLockState {
  const cfg = state.diffLock;
  if (!cfg.enabled) {
    for (let i = 0; i < MAX_WHEELS; i++) {
      state.torqueAllocations[i] = BASE_TORQUE_PER_WHEEL;
      state.smoothedTorque[i] = BASE_TORQUE_PER_WHEEL;
    }
    return createEmptyDiffLockState();
  }

  const wheelConditions: WheelCondition[] = [];
  let activeLockCount = 0;
  let totalRedistributed = 0;

  for (let i = 0; i < MAX_WHEELS; i++) {
    const slip = slipRatios[i];
    const prevExcess = state.consecutiveExcess[i];

    if (slip >= cfg.slipThreshold) {
      state.consecutiveExcess[i] = prevExcess + 1;
    } else if (slip >= cfg.warningThreshold) {
      state.consecutiveExcess[i] = Math.max(0, prevExcess - 0.5);
    } else {
      state.consecutiveExcess[i] = Math.max(0, prevExcess - 2);
    }

    const excessFrames = Math.floor(state.consecutiveExcess[i]);
    let gripStatus: WheelCondition['gripStatus'];
    if (excessFrames >= cfg.consecutiveFramesToLock) {
      gripStatus = 'locked';
    } else if (excessFrames >= 1) {
      gripStatus = 'critical';
    } else if (slip >= cfg.warningThreshold) {
      gripStatus = 'warning';
    } else {
      gripStatus = 'healthy';
    }

    const tractionRatio = Math.max(0, 1 - slip);
    const tractionAvailable = BASE_TORQUE_PER_WHEEL * tractionRatio;

    wheelConditions.push({
      wheelIndex: i,
      slipRatio: slip,
      gripStatus,
      tractionAvailable,
      torqueRequested: BASE_TORQUE_PER_WHEEL,
      torqueActual: state.torqueAllocations[i],
      excessConsecutiveFrames: excessFrames,
    });
  }

  const axlePairs: AxlePair[] = [];
  const axleIndices = [[0, 1], [2, 3], [4, 5]];

  for (const [li, ri] of axleIndices) {
    const leftSlip = slipRatios[li];
    const rightSlip = slipRatios[ri];
    const leftCondition = wheelConditions[li];
    const rightCondition = wheelConditions[ri];

    let transferAmount = 0;
    let transferDirection: AxlePair['torqueTransferDirection'] = 'none';
    let lockEngaged = false;

    const leftIsSpinning = leftCondition.gripStatus === 'locked' || leftCondition.gripStatus === 'critical';
    const rightIsSpinning = rightCondition.gripStatus === 'locked' || rightCondition.gripStatus === 'critical';

    if (leftIsSpinning && !rightIsSpinning) {
      const excessFraction = Math.min(1, (leftSlip - cfg.slipThreshold) / cfg.slipThreshold);
      transferAmount = BASE_TORQUE_PER_WHEEL * cfg.torqueTransferRate * excessFraction;
      transferDirection = 'left-to-right';
      lockEngaged = leftCondition.gripStatus === 'locked';
      state.torqueAllocations[li] = BASE_TORQUE_PER_WHEEL * Math.max(cfg.maxTorqueRatio, 1 - cfg.torqueTransferRate * excessFraction);
      state.torqueAllocations[ri] = BASE_TORQUE_PER_WHEEL + transferAmount;
    } else if (rightIsSpinning && !leftIsSpinning) {
      const excessFraction = Math.min(1, (rightSlip - cfg.slipThreshold) / cfg.slipThreshold);
      transferAmount = BASE_TORQUE_PER_WHEEL * cfg.torqueTransferRate * excessFraction;
      transferDirection = 'right-to-left';
      lockEngaged = rightCondition.gripStatus === 'locked';
      state.torqueAllocations[ri] = BASE_TORQUE_PER_WHEEL * Math.max(cfg.maxTorqueRatio, 1 - cfg.torqueTransferRate * excessFraction);
      state.torqueAllocations[li] = BASE_TORQUE_PER_WHEEL + transferAmount;
    } else if (leftIsSpinning && rightIsSpinning) {
      lockEngaged = true;
      const avgSlip = (leftSlip + rightSlip) / 2;
      const reductionFactor = Math.max(0.3, 1 - avgSlip * 0.8);
      state.torqueAllocations[li] = BASE_TORQUE_PER_WHEEL * reductionFactor;
      state.torqueAllocations[ri] = BASE_TORQUE_PER_WHEEL * reductionFactor;
      transferAmount = 0;
    } else {
      const alpha = 0.15;
      state.torqueAllocations[li] = state.torqueAllocations[li] * (1 - alpha) + BASE_TORQUE_PER_WHEEL * alpha;
      state.torqueAllocations[ri] = state.torqueAllocations[ri] * (1 - alpha) + BASE_TORQUE_PER_WHEEL * alpha;
    }

    if (lockEngaged) activeLockCount++;
    totalRedistributed += transferAmount;

    axlePairs.push({
      leftIndex: li,
      rightIndex: ri,
      leftSlip,
      rightSlip,
      leftTorque: state.torqueAllocations[li],
      rightTorque: state.torqueAllocations[ri],
      torqueTransferAmount: transferAmount,
      torqueTransferDirection: transferDirection,
      lockEngaged,
    });
  }

  for (let i = 0; i < MAX_WHEELS; i++) {
    state.smoothedTorque[i] = state.smoothedTorque[i] * (1 - cfg.smoothingFactor) + state.torqueAllocations[i] * cfg.smoothingFactor;
    wheelConditions[i].torqueActual = state.smoothedTorque[i];
  }

  const prevInterventions = state.diffLockState.interventionCount;
  let newInterventions = prevInterventions;
  for (const pair of axlePairs) {
    if (pair.lockEngaged) {
      newInterventions = prevInterventions + 1;
      break;
    }
  }

  const result: DiffLockState = {
    enabled: cfg.enabled,
    slipThreshold: cfg.slipThreshold,
    consecutiveFramesToLock: cfg.consecutiveFramesToLock,
    torqueTransferRate: cfg.torqueTransferRate,
    wheelConditions,
    axlePairs,
    activeLockCount,
    totalTorqueRedistributed: totalRedistributed,
    interventionCount: newInterventions,
  };
  state.diffLockState = result;
  return result;
}

export function init(
  heightData: Float32Array,
  resolution: number,
  sharedBuffer?: SharedArrayBuffer
): { sharedMode: boolean } {
  state.resolution = resolution;
  state.heightData = new Float32Array(heightData);
  state.standaloneRut = new Float32Array(resolution * resolution);
  state.standaloneRutAccum = new Float32Array(resolution * resolution);
  state.frameCounter = 0;
  state.consecutiveExcess = new Array(MAX_WHEELS).fill(0);
  state.prevSlipRatios = new Array(MAX_WHEELS).fill(0);
  state.torqueAllocations = new Array(MAX_WHEELS).fill(BASE_TORQUE_PER_WHEEL);
  state.smoothedTorque = new Array(MAX_WHEELS).fill(BASE_TORQUE_PER_WHEEL);
  state.diffLockState = createEmptyDiffLockState();

  if (sharedBuffer && sharedBuffer.byteLength > 0) {
    try {
      state.sharedRutBuffer = sharedBuffer;
      state.sharedRutView = new Float32Array(sharedBuffer, SAB_RUT_BUFFER_BYTE_OFFSET, resolution * resolution);
      state.sharedMetaView = new Int32Array(sharedBuffer, SAB_RUT_BUFFER_BYTE_OFFSET + resolution * resolution * 4, 8);
      state.sharedMode = true;
      state.sharedRutView.fill(0);
      if (state.sharedMetaView) Atomics.store(state.sharedMetaView, 0, 0);
    } catch (e) {
      console.warn('[Terramechanics] SharedArrayBuffer init failed:', e);
      state.sharedMode = false;
      state.sharedRutBuffer = null;
      state.sharedRutView = null;
      state.sharedMetaView = null;
    }
  } else {
    state.sharedMode = false;
    state.sharedRutBuffer = null;
    state.sharedRutView = null;
    state.sharedMetaView = null;
  }

  for (let i = 0; i < MAX_WHEELS; i++) {
    state.wheelStates[i] = {
      sinkage: 0, drawbarPull: 0, slipRatio: 0, motionResistance: 0,
      contactPressure: 0, torqueAllocation: BASE_TORQUE_PER_WHEEL,
      angularVelocity: 0, groundSpeed: 0,
    };
  }
  resetDirty();
  return { sharedMode: state.sharedMode };
}

export function setSoilParams(params: SoilParams): void {
  state.soil = { ...params };
}

export function setWheelParams(index: number, params: WheelParams): void {
  if (index >= 0 && index < MAX_WHEELS) state.wheels[index] = { ...params };
}

export function setDiffLockConfig(config: Partial<DiffLockConfig>): void {
  state.diffLock = { ...state.diffLock, ...config };
}

export function step(
  dt: number,
  roverX: number,
  roverZ: number,
  roverHeading: number,
  roverSpeed: number,
  targetSpeed: number,
): {
  wheelStates: WheelState[];
  rutBuffer: Float32Array;
  dirtyRegion: DirtyRegion;
  sharedMode: boolean;
  counter: number;
  diffLockState: DiffLockState;
} {
  state.frameCounter++;
  state.roverSpeed = roverSpeed;
  state.targetSpeed = targetSpeed;

  if (state.sharedMode) {
    if (state.sharedRutView) state.sharedRutView.fill(0);
    resetDirty();
    if (state.sharedMetaView) {
      Atomics.store(state.sharedMetaView, 0, FLAG_WORKER_WRITING);
      Atomics.store(state.sharedMetaView, 1, state.resolution);
      Atomics.store(state.sharedMetaView, 2, 0);
      Atomics.store(state.sharedMetaView, 3, state.resolution);
      Atomics.store(state.sharedMetaView, 4, 0);
    }
  } else {
    state.standaloneRutAccum.fill(0);
    resetDirty();
  }

  const wheelOffsets: [number, number][] = [
    [-0.35, -0.30], [0.35, -0.30],
    [-0.40, 0.00], [0.40, 0.00],
    [-0.35, 0.30], [0.35, 0.30],
  ];

  const cosH = Math.cos(roverHeading);
  const sinH = Math.sin(roverHeading);

  const rawSlipRatios: number[] = new Array(MAX_WHEELS);
  const rawDrawbarPulls: number[] = new Array(MAX_WHEELS);

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

    const slipRatio = computeSlipRatio(i, z, r, roverSpeed);
    rawSlipRatios[i] = slipRatio;

    const tau_max = state.soil.c + p * Math.tan(state.soil.phi);
    const H_max = tau_max * A_contact;

    let drawbarPull = 0;
    if (Math.abs(roverSpeed) > 0.005) {
      const j = slipRatio * L;
      const tau = tau_max * (1 - Math.exp(-Math.max(1e-6, j) / state.soil.K));
      const H = tau * A_contact;
      drawbarPull = H - R_total;
    } else {
      drawbarPull = Math.max(0, H_max * 0.15 - R_total);
    }
    rawDrawbarPulls[i] = drawbarPull;

    const torqueFrac = state.smoothedTorque[i] / BASE_TORQUE_PER_WHEEL;
    const angularVelocity = (roverSpeed / Math.max(r, 0.01)) * torqueFrac;

    state.wheelStates[i] = {
      sinkage: z,
      drawbarPull: drawbarPull * torqueFrac,
      slipRatio,
      motionResistance: R_total,
      contactPressure: p,
      torqueAllocation: state.smoothedTorque[i],
      angularVelocity,
      groundSpeed: roverSpeed,
    };

    if (z > 0.0005) {
      applyRutAtPosition(wx, wz, z, effectiveB, roverHeading, L);
    }
  }

  const diffLockState = runDiffLockController(rawSlipRatios, rawDrawbarPulls);

  for (let i = 0; i < MAX_WHEELS; i++) {
    state.wheelStates[i].torqueAllocation = state.smoothedTorque[i];
  }

  let outRut: Float32Array;
  let dirtyRegion: DirtyRegion;

  if (state.sharedMode && state.sharedRutView && state.sharedMetaView) {
    if (state.hasDirty) {
      Atomics.store(state.sharedMetaView, 1, state.dirtyMinX);
      Atomics.store(state.sharedMetaView, 2, state.dirtyMaxX);
      Atomics.store(state.sharedMetaView, 3, state.dirtyMinZ);
      Atomics.store(state.sharedMetaView, 4, state.dirtyMaxZ);
    }
    Atomics.store(state.sharedMetaView, 6, state.frameCounter);
    Atomics.store(state.sharedMetaView, 0, FLAG_MAIN_PENDING);
    outRut = state.sharedRutView;
  } else {
    state.standaloneRut.set(state.standaloneRutAccum);
    outRut = new Float32Array(state.standaloneRut);
  }

  if (!state.hasDirty) {
    dirtyRegion = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  } else {
    dirtyRegion = {
      minX: Math.max(0, state.dirtyMinX - 1),
      maxX: Math.min(state.resolution - 1, state.dirtyMaxX + 1),
      minZ: Math.max(0, state.dirtyMinZ - 1),
      maxZ: Math.min(state.resolution - 1, state.dirtyMaxZ + 1),
    };
  }

  return {
    wheelStates: state.wheelStates.map(s => ({ ...s })),
    rutBuffer: outRut,
    dirtyRegion,
    sharedMode: state.sharedMode,
    counter: state.frameCounter,
    diffLockState,
  };
}

export function reset(): void {
  if (state.sharedMode && state.sharedRutView) {
    state.sharedRutView.fill(0);
    if (state.sharedMetaView) Atomics.store(state.sharedMetaView, 0, 0);
  }
  state.standaloneRut = new Float32Array(state.resolution * state.resolution);
  state.standaloneRutAccum = new Float32Array(state.resolution * state.resolution);
  state.consecutiveExcess = new Array(MAX_WHEELS).fill(0);
  state.prevSlipRatios = new Array(MAX_WHEELS).fill(0);
  state.torqueAllocations = new Array(MAX_WHEELS).fill(BASE_TORQUE_PER_WHEEL);
  state.smoothedTorque = new Array(MAX_WHEELS).fill(BASE_TORQUE_PER_WHEEL);
  state.diffLockState = createEmptyDiffLockState();
  for (let i = 0; i < MAX_WHEELS; i++) {
    state.wheelStates[i] = {
      sinkage: 0, drawbarPull: 0, slipRatio: 0, motionResistance: 0,
      contactPressure: 0, torqueAllocation: BASE_TORQUE_PER_WHEEL,
      angularVelocity: 0, groundSpeed: 0,
    };
  }
  resetDirty();
}
