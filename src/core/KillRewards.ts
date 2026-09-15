import type { WaveEntityRole } from '../waves/WaveManager';
import { getWeaponDefinition, type EquipmentId } from '../equipment/EquipmentCatalog';

export interface KillReward {
  readonly healAmount: number;
  readonly damageBonus: number;
  readonly maxHpBonus: number;
}

export function getKillReward(
  role: WaveEntityRole,
  maxHP: number,
  weaponId: EquipmentId
): KillReward {
  if (role === 'boss') {
    return { healAmount: 0, damageBonus: 0, maxHpBonus: 0 };
  }

  const weapon = getWeaponDefinition(weaponId);
  const healFraction = role === 'mini-boss'
    ? weapon?.killHealFraction.miniBoss ?? 0
    : weapon?.killHealFraction.regular ?? 0;
  return {
    healAmount: roundCombatValue(Math.max(0, maxHP) * healFraction),
    damageBonus: role === 'mini-boss' ? 0.4 : 0.1,
    maxHpBonus: role === 'mini-boss' ? 15 : 0,
  };
}

export function addMaxHealthBonus(
  hp: number,
  maxHP: number,
  bonus: number
): { hp: number; maxHP: number } {
  const normalizedBonus = Math.max(0, Number.isFinite(bonus) ? bonus : 0);
  return {
    hp: Math.max(0, hp) + normalizedBonus,
    maxHP: Math.max(0, maxHP) + normalizedBonus,
  };
}

export function roundCombatValue(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
}

export function addDamageBonus(current: number, bonus: number): number {
  return roundCombatValue(current + bonus);
}

export function getHitDamagePenalty(role: WaveEntityRole): number {
  if (role === 'regular') return 0.1;
  if (role === 'mini-boss') return 0.3;
  return 0;
}

export function removeDamageBonus(current: number, penalty: number): number {
  const safeCurrent = Math.max(0, Number.isFinite(current) ? current : 0);
  const safePenalty = Math.max(0, Number.isFinite(penalty) ? penalty : 0);
  return roundCombatValue(Math.max(0, safeCurrent - safePenalty));
}
