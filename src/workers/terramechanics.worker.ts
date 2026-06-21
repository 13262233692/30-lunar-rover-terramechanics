import { WorkerMessage, WorkerResult, WorkerStepResult, WorkerInitResult } from '../store/types';
import { init, setSoilParams, setWheelParams, step, reset, loadWasmEngine, ENGINE_TYPE } from './wasmEngineLoader';
import { TERRAIN_RESOLUTION } from '../utils/soilPresets';

let initialized = false;
let sharedMode = false;

self.onmessage = async function (e: MessageEvent<WorkerMessage>) {
  const msg = e.data;
  switch (msg.type) {
    case 'init': {
      await loadWasmEngine();
      const initResult = init(msg.heightData, msg.resolution, msg.sharedRutBuffer);
      setSoilParams(msg.soilParams);
      if (msg.wheelParams) msg.wheelParams.forEach((wp, i) => setWheelParams(i, wp));
      initialized = true;
      sharedMode = initResult.sharedMode;
      const result: WorkerInitResult = {
        type: 'initResult', success: true, sharedMode: initResult.sharedMode,
        engineType: ENGINE_TYPE.isWasm ? 'wasm' : 'typescript',
      };
      (self as any).postMessage(result);
      break;
    }
    case 'step': {
      if (!initialized) break;
      if (msg.soilParams) setSoilParams(msg.soilParams);
      if (msg.wheelParams) msg.wheelParams.forEach((wp, i) => setWheelParams(i, wp));
      const result = step(msg.dt, msg.roverX, msg.roverZ, msg.roverHeading, msg.roverSpeed, msg.targetSpeed ?? 0, TERRAIN_RESOLUTION);
      const stepResult: WorkerStepResult = {
        type: 'stepResult',
        wheelStates: result.wheelStates,
        rutBuffer: result.rutBuffer,
        roverX: msg.roverX, roverZ: msg.roverZ, roverHeading: msg.roverHeading,
        sharedMode: result.sharedMode,
        dirtyRegion: result.dirtyRegion,
        counter: result.counter,
        diffLockState: result.diffLockState,
      };
      if (!result.sharedMode) {
        try { (self as any).postMessage(stepResult, [result.rutBuffer.buffer]); }
        catch { (self as any).postMessage(stepResult); }
      } else {
        (self as any).postMessage(stepResult);
      }
      break;
    }
    case 'reset': { reset(); break; }
  }
};
