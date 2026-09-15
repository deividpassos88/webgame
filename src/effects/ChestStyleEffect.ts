import * as THREE from 'three';

export interface ChestPulseFrame {
  rotationZ: number;
  scaleXZ: number;
  scaleY: number;
  lift: number;
  lightIntensity: number;
}

export interface CollapseFrame {
  opacity: number;
  scale: number;
  complete: boolean;
}

export function getChestPulseFrame(progress: number): ChestPulseFrame {
  const value = THREE.MathUtils.clamp(progress, 0, 1);
  const pulse = Math.sin(value * Math.PI);
  return {
    rotationZ: Math.sin(value * Math.PI * 6) * 0.04 * (1 - value) || 0,
    scaleXZ: 1 + pulse * 0.06,
    scaleY: 1 + pulse * 0.12,
    lift: THREE.MathUtils.smoothstep(value, 0.25, 1) * 0.45,
    lightIntensity: 4 + value * 24,
  };
}

export function getCollapseFrame(progress: number): CollapseFrame {
  const value = THREE.MathUtils.clamp(progress, 0, 1);
  return {
    opacity: 1 - value,
    scale: Math.max(0.01, 1 - value),
    complete: value >= 1,
  };
}
