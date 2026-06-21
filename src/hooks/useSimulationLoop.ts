import { useEffect, useRef, useCallback } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { useWasmWorker } from './useWasmWorker';
import { generateTerrainHeightmap } from '../utils/terrainGenerator';
import { TERRAIN_SIZE, TERRAIN_RESOLUTION } from '../utils/soilPresets';

export function useSimulationLoop() {
  const { initWorker, stepWorker, resetWorker, isInitialized } = useWasmWorker();
  const isRunning = useSimulationStore(s => s.isRunning);
  const setIsRunning = useSimulationStore(s => s.setIsRunning);
  const setWheelStates = useSimulationStore(s => s.setWheelStates);
  const frameRef = useRef<number>(0);
  const rutCallbackRef = useRef<((rutBuffer: Float32Array) => void) | null>(null);

  const onRutUpdate = useCallback((cb: (rutBuffer: Float32Array) => void) => {
    rutCallbackRef.current = cb;
  }, []);

  const startSimulation = useCallback(() => {
    const heightData = generateTerrainHeightmap(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_RESOLUTION, 42);
    initWorker(heightData, TERRAIN_RESOLUTION);
    setIsRunning(true);
  }, [initWorker, setIsRunning]);

  useEffect(() => {
    if (!isRunning || !isInitialized) return;

    let running = true;
    const loop = async () => {
      while (running) {
        const result = await stepWorker(0.016);
        if (!running) break;

        setWheelStates(result.wheelStates);
        if (rutCallbackRef.current && result.rutBuffer.length > 0) {
          rutCallbackRef.current(result.rutBuffer);
        }

        await new Promise(r => requestAnimationFrame(r));
      }
    };

    loop();
    return () => { running = false; };
  }, [isRunning, isInitialized, stepWorker, setWheelStates]);

  const stopSimulation = useCallback(() => {
    setIsRunning(false);
  }, [setIsRunning]);

  const resetSimulation = useCallback(() => {
    resetWorker();
    useSimulationStore.getState().resetSimulation();
  }, [resetWorker]);

  return { startSimulation, stopSimulation, resetSimulation, onRutUpdate, isInitialized };
}
