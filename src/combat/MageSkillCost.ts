import type { WarriorSkillId } from './WarriorSkillCatalog';

/**
 * Percent of the Mage's current fatigue bar spent when a skill is committed.
 * MP is the existing skill energy cost. Basic attacks stay free.
 */
export const MAGE_SKILL_FATIGUE_PERCENT: Record<WarriorSkillId, number> = {
  ataque_giratorio: 8,
  ataque_giratorio_2: 10,
  pulo_atacando: 12,
  triplo_ataque: 15,
  corte_duplo: 12,
};

export function mageSkillFatiguePercent(id: WarriorSkillId): number {
  return MAGE_SKILL_FATIGUE_PERCENT[id];
}
