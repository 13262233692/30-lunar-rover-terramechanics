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
}

export interface RoverState {
  x: number;
  z: number;
  heading: number;
  speed: number;
  angularVelocity: number;
}

export interface SimulationFrame {
  wheelStates: WheelState[];
  roverState: RoverState;
  timestamp: number;
}

export type SceneType = 'lunar' | 'mars';

export interface WorkerInitMessage {
  type: 'init';
  terrainWidth: number;
  terrainDepth: number;
  resolution: number;
  heightData: Float32Array;
  soilParams: SoilParams;
  wheelParams: WheelParams[];
}

export interface WorkerStepMessage {
  type: 'step';
  dt: number;
  roverX: number;
  roverZ: number;
  roverHeading: number;
  roverSpeed: number;
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
}

export interface WorkerInitResult {
  type: 'initResult';
  success: boolean;
}

export type WorkerMessage = WorkerInitMessage | WorkerStepMessage | WorkerResetMessage;
export type WorkerResult = WorkerStepResult | WorkerInitResult;
