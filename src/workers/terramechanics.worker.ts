import { WorkerMessage, WorkerResult, WorkerStepResult } from '../store/types';
import {
  init,
  setSoilParams,
  setWheelParams,
  step,
  reset,
  loadWasmEngine,
  ENGINE_TYPE,
} from './wasmEngineLoader';
import { TERRAIN_RESOLUTION } from '../utils/soilPresets';

let initialized = false;

self.onmessage = async function (e: MessageEvent<WorkerMessage>) {
  const msg = e.data;

  switch (msg.type) {
    case 'init': {
      await loadWasmEngine();
      init(msg.heightData, msg.resolution);
      setSoilParams(msg.soilParams);
      if (msg.wheelParams) {
        msg.wheelParams.forEach((wp, i) => setWheelParams(i, wp));
      }
      initialized = true;
      const result: WorkerResult = { type: 'initResult', success: true };
      (self as any).postMessage({ ...result, engineType: ENGINE_TYPE.isWasm ? 'wasm' : 'typescript' });
      break;
    }

    case 'step': {
      if (!initialized) break;
      if (msg.soilParams) setSoilParams(msg.soilParams);
      if (msg.wheelParams) {
        msg.wheelParams.forEach((wp, i) => setWheelParams(i, wp));
      }

      const result = step(
        msg.dt,
        msg.roverX,
        msg.roverZ,
        msg.roverHeading,
        msg.roverSpeed,
        TERRAIN_RESOLUTION
      );

      const stepResult: WorkerStepResult = {
        type: 'stepResult',
        wheelStates: result.wheelStates,
        rutBuffer: result.rutBuffer,
        roverX: msg.roverX,
        roverZ: msg.roverZ,
        roverHeading: msg.roverHeading,
      };

      try {
        (self as any).postMessage(stepResult, [result.rutBuffer.buffer]);
      } catch {
        (self as any).postMessage(stepResult);
      }
      break;
    }

    case 'reset': {
      reset();
      break;
    }
  }
};
