import { useRef, useCallback, useEffect, useState } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { WorkerStepResult, WorkerInitResult } from '../store/types';
import {
  createSharedRutBuffer,
  getSharedRutView,
  getSharedMetaView,
  isSharedArrayBufferSupported,
} from '../utils/sharedMemory';
import { TERRAIN_RESOLUTION } from '../utils/soilPresets';

export function useWasmWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingResolve = useRef<((result: WorkerStepResult) => void) | null>(null);
  const sharedRutBufferRef = useRef<SharedArrayBuffer | null>(null);
  const sharedRutViewRef = useRef<Float32Array | null>(null);
  const sharedMetaViewRef = useRef<Int32Array | null>(null);
  const isInitialized = useSimulationStore(s => s.isInitialized);
  const setIsInitialized = useSimulationStore(s => s.setIsInitialized);
  const setEngineType = useSimulationStore(s => s.setEngineType);
  const setSharedModeActive = useSimulationStore(s => s.setSharedModeActive);
  const sharedModeActive = useSimulationStore(s => s.sharedModeActive);
  const engineType = useSimulationStore(s => s.engineType);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/terramechanics.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (e: MessageEvent<WorkerInitResult | WorkerStepResult>) => {
      const msg = e.data;
      if (msg.type === 'initResult') {
        setIsInitialized(msg.success);
        setSharedModeActive(!!msg.sharedMode);
        if (msg.engineType) setEngineType(msg.engineType);
      } else if (msg.type === 'stepResult') {
        if (pendingResolve.current) {
          pendingResolve.current(msg as WorkerStepResult);
          pendingResolve.current = null;
        }
      }
    };

    return () => {
      workerRef.current?.terminate();
      sharedRutBufferRef.current = null;
      sharedRutViewRef.current = null;
      sharedMetaViewRef.current = null;
    };
  }, [setIsInitialized]);

  const initWorker = useCallback((heightData: Float32Array, resolution: number) => {
    if (!workerRef.current) return;

    let sharedBuffer: SharedArrayBuffer | undefined;
    if (isSharedArrayBufferSupported()) {
      try {
        sharedBuffer = createSharedRutBuffer(resolution || TERRAIN_RESOLUTION);
        sharedRutBufferRef.current = sharedBuffer;
        sharedRutViewRef.current = getSharedRutView(sharedBuffer);
        sharedMetaViewRef.current = getSharedMetaView(sharedBuffer);
      } catch (err) {
        console.warn('[useWasmWorker] Failed to create SAB, falling back:', err);
        sharedRutBufferRef.current = null;
        sharedRutViewRef.current = null;
        sharedMetaViewRef.current = null;
      }
    }

    const state = useSimulationStore.getState();
    workerRef.current.postMessage({
      type: 'init',
      terrainWidth: 20,
      terrainDepth: 20,
      resolution,
      heightData,
      soilParams: state.soilParams,
      wheelParams: state.wheelParams,
      sharedRutBuffer: sharedBuffer,
    });
  }, []);

  const stepWorker = useCallback((dt: number): Promise<WorkerStepResult> => {
    return new Promise((resolve) => {
      if (!workerRef.current) {
        resolve({
          type: 'stepResult',
          wheelStates: [],
          rutBuffer: new Float32Array(0),
          roverX: 0,
          roverZ: 0,
          roverHeading: 0,
          sharedMode: false,
          dirtyRegion: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
          counter: 0,
        });
        return;
      }
      pendingResolve.current = resolve;
      const state = useSimulationStore.getState();
      workerRef.current.postMessage({
        type: 'step',
        dt,
        roverX: state.roverState.x,
        roverZ: state.roverState.z,
        roverHeading: state.roverState.heading,
        roverSpeed: state.roverState.speed,
        targetSpeed: state.roverState.targetSpeed ?? 0,
        soilParams: state.soilParams,
        wheelParams: state.wheelParams,
      });
    });
  }, []);

  const resetWorker = useCallback(() => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type: 'reset' });
  }, []);

  return {
    initWorker,
    stepWorker,
    resetWorker,
    isInitialized,
    sharedModeActive,
    engineType,
    sharedRutBuffer: sharedRutBufferRef,
    sharedRutView: sharedRutViewRef,
    sharedMetaView: sharedMetaViewRef,
  };
}
