import { getWeaponDefinition, type EquipmentId } from '../equipment/EquipmentCatalog';
import type { WaveEntityRole } from '../waves/WaveManager';

export function isAttackBlocked(
  role: WaveEntityRole,
  weaponId: EquipmentId,
  roll: number
): boolean {
  if (role !== 'regular') return false;
  const chance = getWeaponDefinition(weaponId)?.regularDefenseChance ?? 0;
  const normalizedRoll = Math.max(0, Math.min(1, Number.isFinite(roll) ? roll : 1));
  return normalizedRoll < chance;
}
