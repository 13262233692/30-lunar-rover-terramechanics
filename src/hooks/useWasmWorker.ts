import { useRef, useCallback, useEffect } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { WorkerStepResult, WorkerInitResult } from '../store/types';

export function useWasmWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingResolve = useRef<((result: WorkerStepResult) => void) | null>(null);
  const isInitialized = useSimulationStore(s => s.isInitialized);
  const setIsInitialized = useSimulationStore(s => s.setIsInitialized);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/terramechanics.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (e: MessageEvent<WorkerInitResult | WorkerStepResult>) => {
      const msg = e.data;
      if (msg.type === 'initResult') {
        setIsInitialized(msg.success);
      } else if (msg.type === 'stepResult') {
        if (pendingResolve.current) {
          pendingResolve.current(msg as WorkerStepResult);
          pendingResolve.current = null;
        }
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, [setIsInitialized]);

  const initWorker = useCallback((heightData: Float32Array, resolution: number) => {
    if (!workerRef.current) return;
    const state = useSimulationStore.getState();
    workerRef.current.postMessage({
      type: 'init',
      terrainWidth: 20,
      terrainDepth: 20,
      resolution,
      heightData,
      soilParams: state.soilParams,
      wheelParams: state.wheelParams,
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
        soilParams: state.soilParams,
        wheelParams: state.wheelParams,
      });
    });
  }, []);

  const resetWorker = useCallback(() => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type: 'reset' });
  }, []);

  return { initWorker, stepWorker, resetWorker, isInitialized };
}
