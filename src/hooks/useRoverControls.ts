import { useEffect, useRef } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { RoverState } from '../store/types';

const MOVE_SPEED = 1.5;
const TURN_SPEED = 1.2;

export function useRoverControls() {
  const keysRef = useRef<Set<string>>(new Set());
  const setRoverState = useSimulationStore(s => s.setRoverState);
  const isRunning = useSimulationStore(s => s.isRunning);
  const roverStateRef = useRef<RoverState>({
    x: 0, z: 0, heading: 0, speed: 0, angularVelocity: 0,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    roverStateRef.current = { ...useSimulationStore.getState().roverState };
  }, []);

  useEffect(() => {
    if (!isRunning) return;

    let animId: number;
    const tick = () => {
      const keys = keysRef.current;
      let { x, z, heading, speed, angularVelocity } = roverStateRef.current;

      const forward = keys.has('w') || keys.has('arrowup');
      const backward = keys.has('s') || keys.has('arrowdown');
      const left = keys.has('a') || keys.has('arrowleft');
      const right = keys.has('d') || keys.has('arrowright');

      if (forward) speed = MOVE_SPEED;
      else if (backward) speed = -MOVE_SPEED * 0.5;
      else speed *= 0.9;

      if (left) angularVelocity = TURN_SPEED;
      else if (right) angularVelocity = -TURN_SPEED;
      else angularVelocity *= 0.85;

      if (Math.abs(speed) < 0.01) speed = 0;
      if (Math.abs(angularVelocity) < 0.01) angularVelocity = 0;

      heading += angularVelocity * 0.016;
      x += Math.sin(heading) * speed * 0.016;
      z += Math.cos(heading) * speed * 0.016;

      const bound = 9;
      x = Math.max(-bound, Math.min(bound, x));
      z = Math.max(-bound, Math.min(bound, z));

      roverStateRef.current = { x, z, heading, speed, angularVelocity };
      setRoverState({ x, z, heading, speed, angularVelocity });
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isRunning, setRoverState]);

  return { roverStateRef };
}
