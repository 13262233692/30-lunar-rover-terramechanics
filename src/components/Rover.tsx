import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../store/simulationStore';
import { getHeightAtPosition, generateTerrainHeightmap } from '../utils/terrainGenerator';
import { TERRAIN_SIZE, TERRAIN_RESOLUTION } from '../utils/soilPresets';

const WHEEL_POSITIONS: [number, number, number][] = [
  [-0.35, 0, -0.30],
  [0.35, 0, -0.30],
  [-0.40, 0, 0.00],
  [0.40, 0, 0.00],
  [-0.35, 0, 0.30],
  [0.35, 0, 0.30],
];

function SinkageIndicator({ wheelIndex, sinkage }: { wheelIndex: number; sinkage: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial | null>(null);
  const baseColor = new THREE.Color(0x00e5ff);
  const dangerColor = new THREE.Color(0xff4444);
  const warnColor = new THREE.Color(0xffaa00);

  useFrame(() => {
    if (!material.current) return;
    const ratio = Math.min(sinkage / 0.05, 1.0);
    const color = new THREE.Color();
    if (ratio < 0.5) {
      color.copy(baseColor).lerp(warnColor, ratio * 2);
    } else {
      color.copy(warnColor).lerp(dangerColor, (ratio - 0.5) * 2);
    }
    material.current.color.copy(color);
    material.current.opacity = 0.3 + ratio * 0.6;
  });

  const geometry = useMemo(() => new THREE.TorusGeometry(0.05, 0.003, 8, 16), []);

  return (
    <mesh
      ref={ref}
      geometry={geometry}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, -sinkage - 0.001, 0]}
    >
      <meshBasicMaterial ref={material} color="#00e5ff" transparent opacity={0.4} />
    </mesh>
  );
}

function MeshWheel({ wheelIndex }: { wheelIndex: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const tireMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const wheelStates = useSimulationStore(s => s.wheelStates);
  const roverState = useSimulationStore(s => s.roverState);
  const sinkage = wheelStates[wheelIndex]?.sinkage ?? 0;
  const slip = wheelStates[wheelIndex]?.slipRatio ?? 0;

  const wheelGeometry = useMemo(() => {
    const geo = new THREE.TorusGeometry(0.15, 0.018, 10, 48);
    return geo;
  }, []);

  const hubGeometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.06, 0.06, 0.13, 16);
    geo.rotateX(Math.PI / 2);
    return geo;
  }, []);

  const spokeGeometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(0.008, 0.22, 0.03);
    return geo;
  }, []);

  const sideRingGeometry = useMemo(() => {
    const geo = new THREE.TorusGeometry(0.145, 0.004, 8, 48);
    geo.rotateY(Math.PI / 2);
    return geo;
  }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const speed = Math.abs(roverState.speed);
    const factor = 1 + slip * 0.5;
    groupRef.current.rotation.z += delta * 3 * speed * factor;

    if (tireMaterial.current) {
      const tension = slip;
      tireMaterial.current.roughness = 0.5 + tension * 0.4;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={wheelGeometry} castShadow>
        <meshStandardMaterial
          ref={tireMaterial}
          color="#7a7a80"
          metalness={0.25}
          roughness={0.55}
        />
      </mesh>

      <mesh geometry={sideRingGeometry} position={[-0.056, 0, 0]} castShadow>
        <meshStandardMaterial color="#5a5a60" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh geometry={sideRingGeometry} position={[0.056, 0, 0]} castShadow>
        <meshStandardMaterial color="#5a5a60" metalness={0.8} roughness={0.3} />
      </mesh>

      <mesh geometry={hubGeometry} castShadow>
        <meshStandardMaterial color="#4a4a55" metalness={0.75} roughness={0.25} />
      </mesh>

      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
        <mesh
          key={i}
          geometry={spokeGeometry}
          position={[0, Math.cos(i * Math.PI / 4) * 0.11, Math.sin(i * Math.PI / 4) * 0.11]}
          rotation={[0, 0, i * Math.PI / 4]}
          castShadow
        >
          <meshStandardMaterial color="#6a6a75" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}

      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => (
        <mesh
          key={`lug-${i}`}
          rotation={[0, 0, i * Math.PI / 6]}
          castShadow
        >
          <mesh position={[0, 0.14, 0]}>
            <boxGeometry args={[0.045, 0.014, 0.028]} />
            <meshStandardMaterial color="#8a8a90" metalness={0.3} roughness={0.6} />
          </mesh>
        </mesh>
      ))}

      <SinkageIndicator wheelIndex={wheelIndex} sinkage={sinkage} />
    </group>
  );
}

function SuspensionArm({ wheelIndex }: { wheelIndex: number }) {
  const wheelStates = useSimulationStore(s => s.wheelStates);
  const sinkage = wheelStates[wheelIndex]?.sinkage ?? 0;
  const pos = WHEEL_POSITIONS[wheelIndex];

  return (
    <group position={[pos[0] * 0.3, 0.05, pos[2] * 0.5]}>
      <mesh
        position={[pos[0] * 0.5, -sinkage * 0.3, pos[2] * 0.3]}
        rotation={[0, 0, pos[0] > 0 ? 0.1 + sinkage * 1.5 : -0.1 - sinkage * 1.5]}
      >
        <boxGeometry args={[0.03, 0.22, 0.018]} />
        <meshStandardMaterial color="#666" metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
}

export function Rover() {
  const groupRef = useRef<THREE.Group>(null);
  const chassisRef = useRef<THREE.Group>(null);
  const roverState = useSimulationStore(s => s.roverState);
  const wheelStates = useSimulationStore(s => s.wheelStates);
  const heightDataRef = useRef<Float32Array | null>(null);

  useFrame((_, delta) => {
    if (!groupRef.current || !chassisRef.current) return;
    const { x, z, heading } = roverState;

    if (!heightDataRef.current) {
      heightDataRef.current = generateTerrainHeightmap(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_RESOLUTION, 42);
    }

    const baseY = getHeightAtPosition(heightDataRef.current, TERRAIN_RESOLUTION, TERRAIN_SIZE, TERRAIN_SIZE, x, z);
    const maxSinkage = Math.max(...wheelStates.map(s => s.sinkage), 0);

    groupRef.current.position.set(x, baseY + 0.34 - maxSinkage * 0.4, z);
    groupRef.current.rotation.y = heading;

    const pitch = maxSinkage * 2;
    chassisRef.current.rotation.x = Math.sin(heading) * pitch;
    chassisRef.current.rotation.z = -Math.cos(heading) * pitch;
  });

  return (
    <group ref={groupRef}>
      <group ref={chassisRef}>
        <mesh position={[0, 0.15, 0]} castShadow>
          <boxGeometry args={[0.70, 0.16, 0.82]} />
          <meshStandardMaterial color="#3a4048" metalness={0.55} roughness={0.55} />
        </mesh>

        <mesh position={[0, 0.25, -0.05]} castShadow>
          <boxGeometry args={[0.55, 0.10, 0.36]} />
          <meshStandardMaterial color="#4a5058" metalness={0.45} roughness={0.6} />
        </mesh>

        <mesh position={[-0.13, 0.33, -0.18]} castShadow>
          <cylinderGeometry args={[0.018, 0.018, 0.12, 8]} />
          <meshStandardMaterial color="#777" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0.13, 0.33, -0.18]} castShadow>
          <cylinderGeometry args={[0.018, 0.018, 0.12, 8]} />
          <meshStandardMaterial color="#777" metalness={0.7} roughness={0.3} />
        </mesh>

        <group position={[0, 0.39, -0.18]}>
          <mesh rotation={[0, Math.PI / 2, Math.PI / 2]}>
            <cylinderGeometry args={[0.09, 0.09, 0.006, 20]} />
            <meshStandardMaterial color="#1a1a22" metalness={0.1} roughness={0.1} />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, Math.PI / 2]}>
            <cylinderGeometry args={[0.08, 0.08, 0.010, 20]} />
            <meshStandardMaterial color="#8899ff" metalness={0.2} roughness={0.05} emissive="#4466ff" emissiveIntensity={0.15} />
          </mesh>
        </group>

        <mesh position={[0, 0.32, 0.28]} castShadow>
          <boxGeometry args={[0.42, 0.08, 0.26]} />
          <meshStandardMaterial color="#2a3a2a" metalness={0.3} roughness={0.7} />
        </mesh>

        <mesh position={[0, 0.42, 0.28]} rotation={[-0.35, 0, 0]}>
          <boxGeometry args={[0.36, 0.02, 0.22]} />
          <meshStandardMaterial
            color="#1a2a3a"
            metalness={0.1}
            roughness={0.9}
            emissive="#1a2a1a"
            emissiveIntensity={0.3}
          />
        </mesh>

        <mesh position={[-0.25, 0.26, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.26, 6]} />
          <meshStandardMaterial color="#888" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0.25, 0.26, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.26, 6]} />
          <meshStandardMaterial color="#888" metalness={0.6} roughness={0.4} />
        </mesh>

        {WHEEL_POSITIONS.map((pos, i) => {
          const sinkage = wheelStates[i]?.sinkage ?? 0;
          return (
            <group key={i} position={[pos[0], pos[1] - sinkage, pos[2]]}>
              <SuspensionArm wheelIndex={i} />
              <MeshWheel wheelIndex={i} />
            </group>
          );
        })}

        <pointLight position={[0, 0.5, -0.2]} intensity={0.4} color="#aaddff" distance={2.5} />
        <pointLight position={[0, 0.4, 0.3]} intensity={0.3} color="#00e5ff" distance={2} />
      </group>
    </group>
  );
}
