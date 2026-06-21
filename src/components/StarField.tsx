import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function StarField() {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, colors } = useMemo(() => {
    const count = 2000;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 80 + Math.random() * 40;

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      const brightness = 0.3 + Math.random() * 0.7;
      const tint = Math.random();
      if (tint < 0.1) {
        col[i * 3] = brightness * 0.8;
        col[i * 3 + 1] = brightness * 0.9;
        col[i * 3 + 2] = brightness;
      } else if (tint < 0.2) {
        col[i * 3] = brightness;
        col[i * 3 + 1] = brightness * 0.85;
        col[i * 3 + 2] = brightness * 0.7;
      } else {
        col[i * 3] = brightness;
        col[i * 3 + 1] = brightness;
        col[i * 3 + 2] = brightness;
      }
    }

    return { positions: pos, colors: col };
  }, []);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.002;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        vertexColors
        transparent
        opacity={0.9}
        sizeAttenuation
      />
    </points>
  );
}
