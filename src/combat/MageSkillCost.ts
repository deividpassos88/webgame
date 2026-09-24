import type { WarriorSkillId } from './WarriorSkillCatalog';

/**
 * Percent of the Mage's current fatigue bar (fadiga) spent when a skill is
 * committed. Skills spend fadiga; the basic attack spends MP (mana) instead
 * — see MAGE_BASIC_ATTACK_MP_PERCENT.
 */
export const MAGE_SKILL_FATIGUE_PERCENT: Record<WarriorSkillId, number> = {
  ataque_giratorio: 8,
  ataque_giratorio_2: 10,
  pulo_atacando: 12,
  triplo_ataque: 15,
  corte_duplo: 12,
};

/** Percent of the Mage's MP (mana) bar spent per basic-attack cast. */
export const MAGE_BASIC_ATTACK_MP_PERCENT = 1;

/** MP (mana) cost of one Mage basic attack: 1% of the mana bar. */
export function mageBasicAttackManaCost(maxMana: number): number {
  const safe = Number.isFinite(maxMana) ? Math.max(0, maxMana) : 0;
  return safe * MAGE_BASIC_ATTACK_MP_PERCENT / 100;
}

export function mageSkillFatiguePercent(id: WarriorSkillId): number {
  return MAGE_SKILL_FATIGUE_PERCENT[id];
}
