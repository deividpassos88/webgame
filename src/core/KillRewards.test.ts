import { describe, expect, it } from 'vitest';
import * as killRewards from './KillRewards';

const { getKillReward } = killRewards;

describe('kill rewards', () => {
  it.each([
    ['sword', 'regular', 100, { healAmount: 3, damageBonus: 0.1, maxHpBonus: 0 }],
    ['sword', 'mini-boss', 100, { healAmount: 6, damageBonus: 0.4, maxHpBonus: 15 }],
    ['axe', 'regular', 100, { healAmount: 3.1, damageBonus: 0.1, maxHpBonus: 0 }],
    ['axe', 'mini-boss', 100, { healAmount: 6.2, damageBonus: 0.4, maxHpBonus: 15 }],
    ['sword', 'boss', 100, { healAmount: 0, damageBonus: 0, maxHpBonus: 0 }],
    ['axe', 'boss', 100, { healAmount: 0, damageBonus: 0, maxHpBonus: 0 }],
  ] as const)('applies %s reward for %s', (weapon, role, maxHP, expected) => {
    expect(getKillReward(role, maxHP, weapon)).toEqual(expected);
  });

  it('rounds percentage healing to one decimal place', () => {
    expect(getKillReward('regular', 125, 'axe').healAmount).toBe(3.9);
  });

  it('clamps invalid combat values', () => {
    expect(killRewards.roundCombatValue(Number.POSITIVE_INFINITY)).toBe(0);
    expect(getKillReward('regular', -100, 'sword').healAmount).toBe(0);
  });

  it('keeps accumulated fractional damage normalized to one decimal place', () => {
    const api = killRewards as typeof killRewards & {
      addDamageBonus?: (current: number, bonus: number) => number;
    };

    expect(api.addDamageBonus?.(8.3, 0.4)).toBe(8.7);
  });

  it('removes hit penalties only from accumulated damage bonuses', () => {
    expect(killRewards.getHitDamagePenalty('regular')).toBe(0.1);
    expect(killRewards.getHitDamagePenalty('mini-boss')).toBe(0.3);
    expect(killRewards.getHitDamagePenalty('boss')).toBe(0);
    expect(killRewards.removeDamageBonus(0.4, 0.3)).toBe(0.1);
    expect(killRewards.removeDamageBonus(0.1, 0.3)).toBe(0);
  });

  it('adds permanent maximum and current health after a mini-boss kill', () => {
    expect(killRewards.addMaxHealthBonus(100, 100, 15)).toEqual({
      hp: 115,
      maxHP: 115,
    });
    expect(killRewards.addMaxHealthBonus(40, 100, 15)).toEqual({
      hp: 55,
      maxHP: 115,
    });
  });
});
