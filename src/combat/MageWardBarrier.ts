/** Campo protetor exclusivo da Maga, disparado no início de qualquer magia. */
export const MAGE_WARD_RADIUS_METERS = 4;
export const MAGE_WARD_DURATION_SECONDS = 3;

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
