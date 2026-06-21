export interface SoilParams {
  phi: number;
  c: number;
  k_c: number;
  k_phi: number;
  K: number;
  rho: number;
  n: number;
}

export interface WheelParams {
  radius: number;
  width: number;
  openRatio: number;
  load: number;
}

export interface WheelState {
  sinkage: number;
  drawbarPull: number;
  slipRatio: number;
  motionResistance: number;
  contactPressure: number;
  torqueAllocation: number;
  angularVelocity: number;
  groundSpeed: number;
}

export interface RoverState {
  x: number;
  z: number;
  heading: number;
  speed: number;
  angularVelocity: number;
  targetSpeed: number;
}

export interface SimulationFrame {
  wheelStates: WheelState[];
  roverState: RoverState;
  timestamp: number;
}

export type SceneType = 'lunar' | 'mars';

export interface DirtyRegion {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WheelCondition {
  wheelIndex: number;
  slipRatio: number;
  gripStatus: 'healthy' | 'warning' | 'critical' | 'locked';
  tractionAvailable: number;
  torqueRequested: number;
  torqueActual: number;
  excessConsecutiveFrames: number;
}

export interface AxlePair {
  leftIndex: number;
  rightIndex: number;
  leftSlip: number;
  rightSlip: number;
  leftTorque: number;
  rightTorque: number;
  torqueTransferAmount: number;
  torqueTransferDirection: 'left-to-right' | 'right-to-left' | 'none';
  lockEngaged: boolean;
}

export interface DiffLockState {
  enabled: boolean;
  slipThreshold: number;
  consecutiveFramesToLock: number;
  torqueTransferRate: number;
  wheelConditions: WheelCondition[];
  axlePairs: AxlePair[];
  activeLockCount: number;
  totalTorqueRedistributed: number;
  interventionCount: number;
}

export interface WorkerInitMessage {
  type: 'init';
  terrainWidth: number;
  terrainDepth: number;
  resolution: number;
  heightData: Float32Array;
  soilParams: SoilParams;
  wheelParams: WheelParams[];
  sharedRutBuffer?: SharedArrayBuffer;
}

export interface WorkerStepMessage {
  type: 'step';
  dt: number;
  roverX: number;
  roverZ: number;
  roverHeading: number;
  roverSpeed: number;
  targetSpeed: number;
  soilParams?: SoilParams;
  wheelParams?: WheelParams[];
}

export interface WorkerResetMessage {
  type: 'reset';
}

export interface WorkerStepResult {
  type: 'stepResult';
  wheelStates: WheelState[];
  rutBuffer: Float32Array;
  roverX: number;
  roverZ: number;
  roverHeading: number;
  sharedMode?: boolean;
  dirtyRegion?: DirtyRegion;
  counter?: number;
  diffLockState?: DiffLockState;
}

export interface WorkerInitResult {
  type: 'initResult';
  success: boolean;
  sharedMode?: boolean;
  engineType?: 'wasm' | 'typescript';
}

export type WorkerMessage = WorkerInitMessage | WorkerStepMessage | WorkerResetMessage;
export type WorkerResult = WorkerStepResult | WorkerInitResult;
