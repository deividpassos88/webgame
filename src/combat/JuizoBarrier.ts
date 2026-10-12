import { JUIZO_BARRIER_RADIUS_METERS } from './MageLightningTiming';

/**
 * Barreira do Juízo do Trovão (Maga): cúpula em volta da Maga durante a
 * conjuração. Monstros que encostam na cúpula são empurrados para fora dela e
 * não conseguem atravessá-la. Este módulo é só geometria (sem Three.js), para
 * poder ser testado isoladamente.
 */

/** Distância mínima do centro da Maga até o centro de um monstro com este raio de corpo. */
export function juizoBarrierMinDistance(bodyRadius: number): number {
  return JUIZO_BARRIER_RADIUS_METERS + Math.max(0, bodyRadius);
}

/**
 * Se o ponto (x, z) estiver dentro da barreira, devolve a posição empurrada
 * para a borda (na mesma direção a partir do centro). Se já estiver fora,
 * devolve `null`.
 */
export function pushOutOfJuizoBarrier(
  centerX: number,
  centerZ: number,
  x: number,
  z: number,
  minDistance: number
): { readonly x: number; readonly z: number } | null {
  const dx = x - centerX;
  const dz = z - centerZ;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq >= minDistance * minDistance) return null;
  const distance = Math.sqrt(distanceSq);
  // Monstro exatamente no centro: empurra para a direita (direção estável).
  const nx = distance > 1e-6 ? dx / distance : 1;
  const nz = distance > 1e-6 ? dz / distance : 0;
  return { x: centerX + nx * minDistance, z: centerZ + nz * minDistance };
}
