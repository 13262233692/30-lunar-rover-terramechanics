import { create } from 'zustand';
import { SoilParams, WheelParams, WheelState, SceneType, RoverState, DiffLockState } from './types';
import { SOIL_PRESETS, WHEEL_PRESETS, getSoilParams } from '../utils/soilPresets';

const defaultDiffLockState: DiffLockState = {
  enabled: true,
  slipThreshold: 0.40,
  consecutiveFramesToLock: 3,
  torqueTransferRate: 0.85,
  wheelConditions: Array.from({ length: 6 }, (_, i) => ({
    wheelIndex: i, slipRatio: 0, gripStatus: 'healthy' as const,
    tractionAvailable: 2.5, torqueRequested: 2.5, torqueActual: 2.5, excessConsecutiveFrames: 0,
  })),
  axlePairs: [
    { leftIndex: 0, rightIndex: 1, leftSlip: 0, rightSlip: 0, leftTorque: 2.5, rightTorque: 2.5, torqueTransferAmount: 0, torqueTransferDirection: 'none' as const, lockEngaged: false },
    { leftIndex: 2, rightIndex: 3, leftSlip: 0, rightSlip: 0, leftTorque: 2.5, rightTorque: 2.5, torqueTransferAmount: 0, torqueTransferDirection: 'none' as const, lockEngaged: false },
    { leftIndex: 4, rightIndex: 5, leftSlip: 0, rightSlip: 0, leftTorque: 2.5, rightTorque: 2.5, torqueTransferAmount: 0, torqueTransferDirection: 'none' as const, lockEngaged: false },
  ],
  activeLockCount: 0,
  totalTorqueRedistributed: 0,
  interventionCount: 0,
};

interface SimulationStore {
  sceneType: SceneType;
  soilParams: SoilParams;
  wheelParams: WheelParams[];
  wheelStates: WheelState[];
  roverState: RoverState;
  isRunning: boolean;
  isInitialized: boolean;
  showPanel: boolean;
  showDashboard: boolean;
  totalDrawbarPull: number;
  totalMotionResistance: number;
  avgSinkage: number;
  maxSinkage: number;
  engineType: 'wasm' | 'typescript';
  sharedModeActive: boolean;
  diffLockState: DiffLockState;
  diffLockEnabled: boolean;

  setSceneType: (type: SceneType) => void;
  setSoilParams: (params: Partial<SoilParams>) => void;
  setWheelParams: (index: number, params: Partial<WheelParams>) => void;
  setAllWheelParams: (params: Partial<WheelParams>) => void;
  setWheelStates: (states: WheelState[]) => void;
  setRoverState: (state: Partial<RoverState>) => void;
  setIsRunning: (running: boolean) => void;
  setIsInitialized: (initialized: boolean) => void;
  setEngineType: (t: 'wasm' | 'typescript') => void;
  setSharedModeActive: (v: boolean) => void;
  setDiffLockState: (s: DiffLockState) => void;
  setDiffLockEnabled: (v: boolean) => void;
  togglePanel: () => void;
  toggleDashboard: () => void;
  resetSimulation: () => void;
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  sceneType: 'lunar',
  soilParams: getSoilParams('lunar'),
  wheelParams: WHEEL_PRESETS.map(w => ({ ...w })),
  wheelStates: Array.from({ length: 6 }, () => ({
    sinkage: 0, drawbarPull: 0, slipRatio: 0, motionResistance: 0,
    contactPressure: 0, torqueAllocation: 2.5, angularVelocity: 0, groundSpeed: 0,
  })),
  roverState: { x: 0, z: 0, heading: 0, speed: 0, angularVelocity: 0, targetSpeed: 0 },
  isRunning: false,
  isInitialized: false,
  showPanel: true,
  showDashboard: true,
  totalDrawbarPull: 0,
  totalMotionResistance: 0,
  avgSinkage: 0,
  maxSinkage: 0,
  engineType: 'typescript',
  sharedModeActive: false,
  diffLockState: defaultDiffLockState,
  diffLockEnabled: true,

  setSceneType: (type) => set({ sceneType: type, soilParams: getSoilParams(type) }),
  setSoilParams: (params) => set((s) => ({ soilParams: { ...s.soilParams, ...params } })),
  setWheelParams: (index, params) => set((s) => ({ wheelParams: s.wheelParams.map((w, i) => i === index ? { ...w, ...params } : w) })),
  setAllWheelParams: (params) => set((s) => ({ wheelParams: s.wheelParams.map(w => ({ ...w, ...params })) })),
  setWheelStates: (states) => {
    if (!states || states.length === 0) return;
    const totalDP = states.reduce((sum, s) => sum + (s.drawbarPull || 0), 0);
    const totalMR = states.reduce((sum, s) => sum + (s.motionResistance || 0), 0);
    const avgS = states.reduce((sum, s) => sum + (s.sinkage || 0), 0) / Math.max(1, states.length);
    const maxS = states.length > 0 ? Math.max(...states.map(s => s.sinkage || 0)) : 0;
    set({ wheelStates: states, totalDrawbarPull: totalDP, totalMotionResistance: totalMR, avgSinkage: avgS, maxSinkage: maxS });
  },
  setRoverState: (rs) => set((s) => ({ roverState: { ...s.roverState, ...rs } })),
  setIsRunning: (running) => set({ isRunning: running }),
  setIsInitialized: (initialized) => set({ isInitialized: initialized }),
  setEngineType: (t) => set({ engineType: t }),
  setSharedModeActive: (v) => set({ sharedModeActive: v }),
  setDiffLockState: (s) => set({ diffLockState: s }),
  setDiffLockEnabled: (v) => set({ diffLockEnabled: v }),
  togglePanel: () => set((s) => ({ showPanel: !s.showPanel })),
  toggleDashboard: () => set((s) => ({ showDashboard: !s.showDashboard })),
  resetSimulation: () => set({
    roverState: { x: 0, z: 0, heading: 0, speed: 0, angularVelocity: 0, targetSpeed: 0 },
    wheelStates: Array.from({ length: 6 }, () => ({
      sinkage: 0, drawbarPull: 0, slipRatio: 0, motionResistance: 0,
      contactPressure: 0, torqueAllocation: 2.5, angularVelocity: 0, groundSpeed: 0,
    })),
    totalDrawbarPull: 0, totalMotionResistance: 0, avgSinkage: 0, maxSinkage: 0,
    diffLockState: defaultDiffLockState,
  }),
}));

if (typeof window !== 'undefined') {
  (window as any).__simulationStore = useSimulationStore;
}
