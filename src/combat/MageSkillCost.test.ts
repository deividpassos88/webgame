import { describe, expect, it } from 'vitest';
import {
  MAGE_BASIC_ATTACK_MP_PERCENT,
  MAGE_SKILL_FATIGUE_PERCENT,
  mageBasicAttackManaCost,
  mageSkillFatiguePercent,
} from './MageSkillCost';

describe('Mage resource costs', () => {
  it('spends 1% of Mana (MP) per basic-attack cast, not fatigue', () => {
    expect(MAGE_BASIC_ATTACK_MP_PERCENT).toBe(1);
    expect(mageBasicAttackManaCost(50)).toBeCloseTo(0.5);
    expect(mageBasicAttackManaCost(200)).toBeCloseTo(2);
    expect(mageBasicAttackManaCost(Number.NaN)).toBe(0);
  });

  it('keeps every Mage skill cost unchanged', () => {
    expect(MAGE_SKILL_FATIGUE_PERCENT).toEqual({
      ataque_giratorio: 8,
      ataque_giratorio_2: 10,
      pulo_atacando: 12,
      triplo_ataque: 15,
      corte_duplo: 12,
    });
    expect(mageSkillFatiguePercent('ataque_giratorio')).toBe(8);
  });
});
