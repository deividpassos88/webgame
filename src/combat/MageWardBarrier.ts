import type { MageSpellId } from '../vfx/VFXTypes';

/** Campo de colisão invisível exclusivo do laser da Maga (tecla 4). */
export const MAGE_WARD_RADIUS_METERS = 4;
export const MAGE_WARD_DURATION_SECONDS = 3;

/** Apenas o Raio Prismático (tecla 4) ativa esta proteção invisível. */
export function shouldActivateMageWard(playerClass: string, spellId: MageSpellId): boolean {
  return playerClass === 'mage' && spellId === 'laser';
}

/** O raio é a borda livre: o centro do inimigo fica além do seu próprio corpo. */
export function projectOutsideMageWard(
  centerX: number,
  centerZ: number,
  enemyX: number,
  enemyZ: number,
  enemyCollisionRadius: number
): { readonly x: number; readonly z: number } | null {
  const minDistance = MAGE_WARD_RADIUS_METERS + Math.max(0, enemyCollisionRadius);
  const dx = enemyX - centerX;
  const dz = enemyZ - centerZ;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq >= minDistance * minDistance) return null;
  const distance = Math.sqrt(distanceSq);
  const x = distance > 1e-6 ? dx / distance : 1;
  const z = distance > 1e-6 ? dz / distance : 0;
  return { x: centerX + x * minDistance, z: centerZ + z * minDistance };
}
