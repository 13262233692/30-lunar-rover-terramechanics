import { SoilParams, WheelParams, SceneType } from '../store/types';

export interface SoilPresetExtra {
  phi: number;
  c: number;
  k_c: number;
  k_phi: number;
  K: number;
  rho: number;
  n: number;
  label: string;
  seed: number;
  roughness: number;
  skyColor: string;
  ambientColor: string;
  fogColor: string;
}

export const SOIL_PRESETS: Record<SceneType, SoilPresetExtra> = {
  lunar: {
    phi: 0.63,
    c: 170,
    k_c: 1400,
    k_phi: 820000,
    K: 0.018,
    rho: 1550,
    n: 1.0,
    label: 'Lunar Regolith · 月壤',
    seed: 42,
    roughness: 0.98,
    skyColor: '#02020a',
    ambientColor: '#0a1020',
    fogColor: '#000008',
  },
  mars: {
    phi: 0.66,
    c: 250,
    k_c: 1900,
    k_phi: 1500000,
    K: 0.014,
    rho: 1300,
    n: 0.9,
    label: 'Martian Regolith · 火壤',
    seed: 137,
    roughness: 0.92,
    skyColor: '#2a0f08',
    ambientColor: '#3a1810',
    fogColor: '#1a0806',
  },
};

export function getSoilParams(preset: SceneType): SoilParams {
  const p = SOIL_PRESETS[preset];
  return {
    phi: p.phi,
    c: p.c,
    k_c: p.k_c,
    k_phi: p.k_phi,
    K: p.K,
    rho: p.rho,
    n: p.n,
  };
}

export const WHEEL_PRESETS: WheelParams[] = [
  { radius: 0.15, width: 0.12, openRatio: 0.3, load: 55 },
  { radius: 0.15, width: 0.12, openRatio: 0.3, load: 55 },
  { radius: 0.15, width: 0.12, openRatio: 0.3, load: 55 },
  { radius: 0.15, width: 0.12, openRatio: 0.3, load: 55 },
  { radius: 0.15, width: 0.12, openRatio: 0.3, load: 55 },
  { radius: 0.15, width: 0.12, openRatio: 0.3, load: 55 },
];

export const TERRAIN_SIZE = 20;
export const TERRAIN_RESOLUTION = 128;
