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
import { DirtyRegion } from '../store/types';
import {
  mainTryConsume,
  getSharedMetaView,
  getSharedRutView,
} from '../utils/sharedMemory';

interface PendingRutUpdate {
  buffer: Float32Array;
  sharedMode: boolean;
  dirtyRegion?: DirtyRegion;
  sab?: SharedArrayBuffer | null;
  meta?: Int32Array | null;
  rutView?: Float32Array | null;
}

const rutState: {
  pending: PendingRutUpdate | null;
  lastCounter: number;
} = {
  pending: null,
  lastCounter: -1,
};

export function pushRutBuffer(
  buffer: Float32Array,
  sharedMode: boolean = false,
  dirtyRegion?: DirtyRegion,
  sab?: SharedArrayBuffer | null,
  meta?: Int32Array | null,
  rutView?: Float32Array | null,
  counter: number = 0,
) {
  if (sharedMode && counter === rutState.lastCounter) {
    return;
  }
  rutState.lastCounter = counter;
  rutState.pending = { buffer, sharedMode, dirtyRegion, sab, meta, rutView };
}

function recomputeNormalsInRegion(
  geo: THREE.BufferGeometry,
  pos: THREE.BufferAttribute,
  normals: THREE.BufferAttribute,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  resolution: number,
): void {
  const safeMinX = Math.max(1, minX);
  const safeMaxX = Math.min(resolution - 2, maxX);
  const safeMinZ = Math.max(1, minZ);
  const safeMaxZ = Math.min(resolution - 2, maxZ);
  if (safeMinX > safeMaxX || safeMinZ > safeMaxZ) return;

  const v = new THREE.Vector3();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();

  const getPos = (ix: number, iz: number, out: THREE.Vector3): THREE.Vector3 => {
    const i = iz * resolution + ix;
    out.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    return out;
  };

  for (let iz = safeMinZ; iz <= safeMaxZ; iz++) {
    for (let ix = safeMinX; ix <= safeMaxX; ix++) {
      n.set(0, 0, 0);
      let count = 0;

      if (ix > 0 && iz > 0) {
        getPos(ix, iz, va);
        getPos(ix + 1, iz, vb);
        getPos(ix, iz + 1, vc);
        ab.subVectors(vb, va);
        ac.subVectors(vc, va);
        v.crossVectors(ab, ac);
        if (v.lengthSq() > 1e-10) {
          n.add(v.normalize());
          count++;
        }
      }
      if (ix < resolution - 1 && iz < resolution - 1) {
        getPos(ix, iz, va);
        getPos(ix, iz + 1, vb);
        getPos(ix + 1, iz + 1, vc);
        ab.subVectors(vb, va);
        ac.subVectors(vc, va);
        v.crossVectors(ab, ac);
        if (v.lengthSq() > 1e-10) {
          n.add(v.normalize());
          count++;
        }
      }
      if (ix > 0 && iz < resolution - 1) {
        getPos(ix, iz, va);
        getPos(ix + 1, iz + 1, vb);
        getPos(ix, iz + 1, vc);
        ab.subVectors(vb, va);
        ac.subVectors(vc, va);
        v.crossVectors(ab, ac);
        if (v.lengthSq() > 1e-10) {
          n.add(v.normalize());
          count++;
        }
      }
      if (ix < resolution - 1 && iz > 0) {
        getPos(ix, iz, va);
        getPos(ix + 1, iz, vb);
        getPos(ix + 1, iz + 1, vc);
        ab.subVectors(vb, va);
        ac.subVectors(vc, va);
        v.crossVectors(ab, ac);
        if (v.lengthSq() > 1e-10) {
          n.add(v.normalize());
          count++;
        }
      }

      if (count > 0) {
        n.divideScalar(count).normalize();
      } else {
        n.set(0, 1, 0);
      }
      normals.setXYZ(iz * resolution + ix, n.x, n.y, n.z);
    }
  }
  normals.needsUpdate = true;
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
    const normAttr = geo.attributes.normal as THREE.BufferAttribute;
    const len = pos.count;
    const baseH = baseHeightRef.current!;
    const baseC = baseColorRef.current!;
    const rutAcc = rutAccumulatedRef.current!;
    const res = TERRAIN_RESOLUTION;

    let srcBuffer: Float32Array;
    let dirtyRegion: DirtyRegion | undefined;
    let consumedFromShared = false;

    if (pending.sharedMode && pending.sab && pending.meta && pending.rutView) {
      const meta = pending.meta;
      const res2 = mainTryConsume(pending.sab, meta, pending.rutView);
      if (!res2.consumed) {
        return;
      }
      consumedFromShared = true;
      srcBuffer = pending.rutView;
      if (res2.dirtyMinX < res2.dirtyMaxX && res2.dirtyMinZ < res2.dirtyMaxZ) {
        dirtyRegion = {
          minX: Math.max(0, res2.dirtyMinX),
          maxX: Math.min(res - 1, res2.dirtyMaxX),
          minZ: Math.max(0, res2.dirtyMinZ),
          maxZ: Math.min(res - 1, res2.dirtyMaxZ),
        };
      }
    } else {
      srcBuffer = pending.buffer;
      dirtyRegion = pending.dirtyRegion;
    }

    if (!dirtyRegion) {
      dirtyRegion = { minX: 0, maxX: res - 1, minZ: 0, maxZ: res - 1 };
    }

    if (dirtyRegion.minX > dirtyRegion.maxX || dirtyRegion.minZ > dirtyRegion.maxZ) {
      rutState.pending = null;
      return;
    }

    const { minX, maxX, minZ, maxZ } = dirtyRegion;
    let modified = false;

    for (let iz = minZ; iz <= maxZ; iz++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const idx = iz * res + ix;
        const rutDepth = srcBuffer[idx];
        if (rutDepth > 0.0001) {
          baseH[idx] -= rutDepth * 0.8;
          pos.setY(idx, baseH[idx]);
          rutAcc[idx] += rutDepth;
          modified = true;
        }
      }
    }

    if (modified) {
      const cx0 = Math.max(1, minX);
      const cx1 = Math.min(res - 2, maxX);
      const cz0 = Math.max(1, minZ);
      const cz1 = Math.min(res - 2, maxZ);

      if (cx0 <= cx1 && cz0 <= cz1) {
        for (let iz = cz0; iz <= cz1; iz++) {
          for (let ix = cx0; ix <= cx1; ix++) {
            const idx = iz * res + ix;
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
      }

      pos.needsUpdate = true;
      colors.needsUpdate = true;

      const nx0 = Math.max(1, minX - 1);
      const nx1 = Math.min(res - 2, maxX + 1);
      const nz0 = Math.max(1, minZ - 1);
      const nz1 = Math.min(res - 2, maxZ + 1);
      recomputeNormalsInRegion(geo, pos, normAttr, nx0, nx1, nz0, nz1, res);
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
