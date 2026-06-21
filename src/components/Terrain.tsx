import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  generateTerrainHeightmap,
  terrainColorAtHeight,
} from '../utils/terrainGenerator';
import {
  TERRAIN_SIZE,
  TERRAIN_RESOLUTION,
  SOIL_PRESETS,
} from '../utils/soilPresets';
import { useSimulationStore } from '../store/simulationStore';

const rutState = { pending: null as Float32Array | null };

export function pushRutBuffer(buffer: Float32Array) {
  rutState.pending = buffer;
}

export function Terrain() {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const baseHeightRef = useRef<Float32Array | null>(null);
  const baseColorRef = useRef<Float32Array | null>(null);
  const rutAccumulatedRef = useRef<Float32Array | null>(null);
  const activePresetId = useSimulationStore(s => s.sceneType);
  const preset = SOIL_PRESETS[activePresetId];

  const terrainSeed = useMemo(() => preset?.seed ?? 42, [preset]);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      TERRAIN_SIZE,
      TERRAIN_SIZE,
      TERRAIN_RESOLUTION - 1,
      TERRAIN_RESOLUTION - 1
    );
    geo.rotateX(-Math.PI / 2);

    const heights = generateTerrainHeightmap(
      TERRAIN_SIZE,
      TERRAIN_SIZE,
      TERRAIN_RESOLUTION,
      terrainSeed
    );

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const len = pos.count;
    for (let i = 0; i < len; i++) {
      pos.setY(i, heights[i]);
    }

    const colors = new Float32Array(len * 3);
    const maxH = 1.6, minH = -0.3;
    for (let i = 0; i < len; i++) {
      const h = pos.getY(i);
      const t = THREE.MathUtils.clamp((h - minH) / (maxH - minH), 0, 1);
      const c = terrainColorAtHeight(t, terrainSeed);
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    geo.computeVertexNormals();
    geometryRef.current = geo;
    baseHeightRef.current = new Float32Array(pos.count);
    baseColorRef.current = new Float32Array(colors);
    rutAccumulatedRef.current = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      baseHeightRef.current[i] = pos.getY(i);
    }

    return geo;
  }, [terrainSeed]);

  useEffect(() => {
    const heights = generateTerrainHeightmap(
      TERRAIN_SIZE,
      TERRAIN_SIZE,
      TERRAIN_RESOLUTION,
      terrainSeed
    );
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const colors = geometry.attributes.color as THREE.BufferAttribute;
    const len = pos.count;
    const maxH = 1.6, minH = -0.3;

    for (let i = 0; i < len; i++) {
      pos.setY(i, heights[i]);
      const h = heights[i];
      const t = THREE.MathUtils.clamp((h - minH) / (maxH - minH), 0, 1);
      const c = terrainColorAtHeight(t, terrainSeed);
      colors.setXYZ(i, c[0], c[1], c[2]);
      baseHeightRef.current![i] = h;
      baseColorRef.current![i * 3] = c[0];
      baseColorRef.current![i * 3 + 1] = c[1];
      baseColorRef.current![i * 3 + 2] = c[2];
      rutAccumulatedRef.current![i] = 0;
    }
    pos.needsUpdate = true;
    colors.needsUpdate = true;
    geometry.computeVertexNormals();
    geometryRef.current = geometry;
  }, [geometry, terrainSeed]);

  useFrame(() => {
    const pending = rutState.pending;
    if (!pending || !geometryRef.current) return;

    const geo = geometryRef.current;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = geo.attributes.color as THREE.BufferAttribute;
    const len = pos.count;
    const baseH = baseHeightRef.current!;
    const baseC = baseColorRef.current!;
    const rutAcc = rutAccumulatedRef.current!;
    const res = TERRAIN_RESOLUTION;

    let modified = false;
    const halfGrid = TERRAIN_SIZE / 2;
    const cellSize = TERRAIN_SIZE / (res - 1);

    for (let i = 0; i < len; i++) {
      const rutDepth = pending[i];
      if (rutDepth > 0.0001) {
        baseH[i] -= rutDepth * 0.8;
        pos.setY(i, baseH[i]);
        rutAcc[i] += rutDepth;
        modified = true;
      }
    }

    if (modified) {
      for (let iy = 2; iy < res - 2; iy++) {
        for (let ix = 2; ix < res - 2; ix++) {
          const idx = iy * res + ix;
          const totalRut = rutAcc[idx];
          if (totalRut > 0.0005) {
            const shadow = Math.min(totalRut * 2.2, 0.65);
            const r0 = baseC[idx * 3];
            const g0 = baseC[idx * 3 + 1];
            const b0 = baseC[idx * 3 + 2];

            const leftR = rutAcc[idx - 1];
            const rightR = rutAcc[idx + 1];
            const upR = rutAcc[idx - res];
            const dnR = rutAcc[idx + res];

            const sideHighlight = Math.max(0, (leftR - rightR + upR - dnR) * 0.15);

            colors.setXYZ(
              idx,
              Math.max(0, r0 * (1 - shadow * 0.85) - shadow * 0.08 + sideHighlight),
              Math.max(0, g0 * (1 - shadow * 0.75) - shadow * 0.12),
              Math.max(0, b0 * (1 - shadow * 0.6) - shadow * 0.15 + sideHighlight * 0.5)
            );
          }
        }
      }

      pos.needsUpdate = true;
      colors.needsUpdate = true;
      geo.computeVertexNormals();
      const norm = geo.attributes.normal as THREE.BufferAttribute;
      norm.needsUpdate = true;
    }

    rutState.pending = null;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} receiveShadow>
      <meshStandardMaterial
        vertexColors
        flatShading
        metalness={0.05}
        roughness={preset?.roughness ?? 0.95}
      />
    </mesh>
  );
}
