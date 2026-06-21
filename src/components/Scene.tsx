import { useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { Terrain, pushRutBuffer } from './Terrain';
import { Rover } from './Rover';
import { useSimulationStore } from '../store/simulationStore';
import { useWasmWorker } from '../hooks/useWasmWorker';
import { useRoverControls } from '../hooks/useRoverControls';
import { generateTerrainHeightmap } from '../utils/terrainGenerator';
import {
  TERRAIN_SIZE,
  TERRAIN_RESOLUTION,
  SOIL_PRESETS,
  getSoilParams,
  WHEEL_PRESETS,
} from '../utils/soilPresets';

function SceneEnvironment() {
  const sceneType = useSimulationStore(s => s.sceneType);
  const preset = SOIL_PRESETS[sceneType];

  return (
    <>
      <color attach="background" args={[preset?.skyColor ?? '#02020a']} />
      <fog attach="fog" args={[preset?.fogColor ?? '#000008', 10, 36]} />
      <ambientLight intensity={0.22} color={preset?.ambientColor ?? '#0a1020'} />
      <directionalLight
        position={[5.2, 7.5, 3.8]}
        intensity={sceneType === 'lunar' ? 1.35 : 1.05}
        castShadow
        color={sceneType === 'lunar' ? '#fff4dd' : '#ffddaa'}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-bias={-0.0003}
      />
      {sceneType === 'lunar' && (
        <Stars radius={120} depth={60} count={6000} factor={7} fade speed={0.3} />
      )}
      {sceneType === 'mars' && (
        <>
          <hemisphereLight args={[preset?.skyColor ?? '#ff9966', '#662200', 0.35]} />
          <Stars radius={200} depth={80} count={1500} factor={3} fade speed={0.15} />
        </>
      )}
    </>
  );
}

function SimulationInner() {
  const isRunning = useSimulationStore(s => s.isRunning);
  const soilParams = useSimulationStore(s => s.soilParams);
  const wheelParams = useSimulationStore(s => s.wheelParams);
  const sceneType = useSimulationStore(s => s.sceneType);
  const setWheelStates = useSimulationStore(s => s.setWheelStates);
  const setIsInitialized = useSimulationStore(s => s.setIsInitialized);

  const { initWorker, stepWorker } = useWasmWorker();
  const { roverStateRef } = useRoverControls();
  const preset = SOIL_PRESETS[sceneType];

  const lastTimeRef = useRef(performance.now());
  const stepInProgressRef = useRef(false);
  const initTriggeredRef = useRef<number | null>(null);

  useEffect(() => {
    if (initTriggeredRef.current === preset.seed) return;
    initTriggeredRef.current = preset.seed;

    const heightData = generateTerrainHeightmap(
      TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_RESOLUTION, preset.seed);

    const state = useSimulationStore.getState();
    setIsInitialized(false);

    let retries = 0;
    const tryInit = () => {
      try {
        initWorker(heightData, TERRAIN_RESOLUTION);
      } catch (e) {
        console.warn('Init failed, retry', e);
        retries++;
        if (retries < 5) setTimeout(tryInit, 400);
      }
    };
    setTimeout(tryInit, 150);
  }, [initWorker, sceneType, preset.seed, setIsInitialized]);

  useFrame(() => {
    if (!isRunning) return;
    if (stepInProgressRef.current) return;

    const now = performance.now();
    const dtMs = now - lastTimeRef.current;
    lastTimeRef.current = now;
    const dt = Math.min(dtMs / 1000, 0.05);

    stepInProgressRef.current = true;
    stepWorker(dt).then((result: any) => {
      stepInProgressRef.current = false;
      if (result && result.rutBuffer && result.rutBuffer instanceof Float32Array) {
        pushRutBuffer(result.rutBuffer);
      }
      if (result && Array.isArray(result.wheelStates)) {
        setWheelStates(result.wheelStates);
      }
    }).catch(() => {
      stepInProgressRef.current = false;
    });
  });

  return null;
}

export function Scene() {
  const sceneType = useSimulationStore(s => s.sceneType);

  return (
    <Canvas
      shadows
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 7.5, 9.5], fov: 52 }}
      dpr={[1, 1.75]}
    >
      <Suspense fallback={null}>
        <SceneEnvironment />
        <Terrain />
        <Rover />
        <SimulationInner key={sceneType} />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={2.5}
          maxDistance={32}
          maxPolarAngle={Math.PI * 0.495}
          minPolarAngle={0.08}
          target={[0, 0.4, 0]}
        />
      </Suspense>
    </Canvas>
  );
}
