import { SoilParams, WheelParams, WheelState } from '../store/types';
import * as TS from './terramechanicsEngine';

declare global {
  interface WindowOrWorkerGlobalScope {
    TerramechanicsModule?: any;
  }
}

interface WasmAPI {
  init: Function;
  setSoilParams: Function;
  setWheelParams: Function;
  step: Function;
  reset: Function;
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;
  _malloc: (bytes: number) => number;
  _free: (ptr: number) => void;
}

let wasm: WasmAPI | null = null;
let wasmLoading: Promise<boolean> | null = null;
let ptrs: { sinkage: number; dp: number; slip: number; mr: number; cp: number; rut: number; heights: number } | null = null;

export const ENGINE_TYPE = {
  isWasm: false,
};

export async function loadWasmEngine(): Promise<boolean> {
  if (wasm) return true;
  if (wasmLoading) return wasmLoading;

  wasmLoading = (async (): Promise<boolean> => {
    try {
      let origin = '';
      if (typeof self !== 'undefined' && self.location) {
        origin = self.location.origin;
      } else if (typeof location !== 'undefined') {
        origin = location.origin;
      }
      const modFactory = await import(
        /* @vite-ignore */
        /* webpackIgnore: true */
        `${origin}/wasm/terramechanics.js`
      ).catch(() => null);
      if (!modFactory) return false;
      const Module = (modFactory as any).default || (modFactory as any);
      const instance = typeof Module === 'function' ? await Module() : Module;

      if (!instance || !instance.cwrap) {
        return false;
      }

      wasm = {
        init: instance.cwrap('init', 'void', ['number', 'number', 'number', 'number', 'number']),
        setSoilParams: instance.cwrap('setSoilParams', 'void', ['number', 'number', 'number', 'number', 'number', 'number', 'number']),
        setWheelParams: instance.cwrap('setWheelParams', 'void', ['number', 'number', 'number', 'number', 'number']),
        step: instance.cwrap('step', 'void', [
          'number', 'number', 'number', 'number', 'number',
          'number', 'number', 'number', 'number', 'number', 'number',
        ]),
        reset: instance.cwrap('reset', 'void', []),
        HEAPF32: instance.HEAPF32,
        HEAPF64: instance.HEAPF64,
        _malloc: instance._malloc,
        _free: instance._free,
      };

      const F64 = 8;
      const F32 = 4;
      ptrs = {
        sinkage: wasm._malloc(6 * F64),
        dp: wasm._malloc(6 * F64),
        slip: wasm._malloc(6 * F64),
        mr: wasm._malloc(6 * F64),
        cp: wasm._malloc(6 * F64),
        rut: wasm._malloc(256 * 256 * F32),
        heights: wasm._malloc(256 * 256 * F32),
      };

      ENGINE_TYPE.isWasm = true;
      return true;
    } catch (e) {
      console.warn('[WasmEngine] Failed to load WebAssembly module, using TypeScript fallback:', e);
      return false;
    }
  })();

  return wasmLoading;
}

export function init(heightData: Float32Array, resolution: number): void {
  if (wasm && ptrs) {
    wasm.HEAPF32.set(heightData, ptrs.heights / 4);
    wasm.init(20, 20, resolution, ptrs.heights, resolution * resolution);
    return;
  }
  TS.init(heightData, resolution);
}

export function setSoilParams(params: SoilParams): void {
  if (wasm) {
    wasm.setSoilParams(params.phi, params.c, params.k_c, params.k_phi, params.K, params.rho, params.n);
    return;
  }
  TS.setSoilParams(params);
}

export function setWheelParams(index: number, params: WheelParams): void {
  if (wasm) {
    wasm.setWheelParams(index, params.radius, params.width, params.openRatio, params.load);
    return;
  }
  TS.setWheelParams(index, params);
}

export function step(
  dt: number,
  roverX: number,
  roverZ: number,
  roverHeading: number,
  roverSpeed: number,
  resolution: number = 128
): { wheelStates: WheelState[]; rutBuffer: Float32Array } {
  if (wasm && ptrs) {
    wasm.step(
      dt, roverX, roverZ, roverHeading, roverSpeed,
      ptrs.sinkage, ptrs.dp, ptrs.slip, ptrs.mr, ptrs.cp, ptrs.rut
    );

    const F64 = 8;
    const F32 = 4;
    const H64 = wasm.HEAPF64;
    const H32 = wasm.HEAPF32;
    const states: WheelState[] = [];
    for (let i = 0; i < 6; i++) {
      states.push({
        sinkage: H64[ptrs.sinkage / F64 + i],
        drawbarPull: H64[ptrs.dp / F64 + i],
        slipRatio: H64[ptrs.slip / F64 + i],
        motionResistance: H64[ptrs.mr / F64 + i],
        contactPressure: H64[ptrs.cp / F64 + i],
      });
    }
    const rut = new Float32Array(H32.buffer, ptrs.rut, resolution * resolution).slice();
    return { wheelStates: states, rutBuffer: rut };
  }
  return TS.step(dt, roverX, roverZ, roverHeading, roverSpeed);
}

export function reset(): void {
  if (wasm) { wasm.reset(); return; }
  TS.reset();
}
