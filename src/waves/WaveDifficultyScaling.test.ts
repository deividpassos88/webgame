import { describe, expect, it } from 'vitest';
import {
  BASE_BOSS_DAMAGE,
  BASE_BOSS_SCALE,
  BASE_BOSS_SPEED,
  BOSS_BASE_HP,
  countEquippedArmorPieces,
  equipmentHpMultiplier,
  FINAL_BOSS_HP_BARS,
  finalBossTotalHp,
  getBossEnrageStats,
  getBossMinionComposition,
  getBossMinionTier,
  miniBossHpMultiplier,
  regularEnemyHpMultiplier,
} from './WaveDifficultyScaling';
import { createDefaultPlayerProfile } from '../profile/PlayerProfile';

describe('equipmentHpMultiplier', () => {
  it('aplica 0% para 0 pecas de armadura (apenas espada)', () => {
    expect(equipmentHpMultiplier(0)).toBe(1.0);
    expect(equipmentHpMultiplier(-1)).toBe(1.0);
  });

  it('aplica 10% para 1 peca de armadura', () => {
    expect(equipmentHpMultiplier(1)).toBeCloseTo(1.10, 5);
  });

  it('aplica 15% para 2 pecas de armadura', () => {
    expect(equipmentHpMultiplier(2)).toBeCloseTo(1.15, 5);
  });

  it('aplica 20% para 3 pecas de armadura', () => {
    expect(equipmentHpMultiplier(3)).toBeCloseTo(1.20, 5);
  });

  it('aplica 24% para 4 pecas de armadura', () => {
    expect(equipmentHpMultiplier(4)).toBeCloseTo(1.24, 5);
  });

  it('aplica 30% para 5 pecas de armadura (set completo)', () => {
    expect(equipmentHpMultiplier(5)).toBeCloseTo(1.30, 5);
    expect(equipmentHpMultiplier(6)).toBeCloseTo(1.30, 5);
  });
});

describe('countEquippedArmorPieces', () => {
  it('conta apenas pecas de armadura ignorando armas', () => {
    const profile = createDefaultPlayerProfile();
    profile.equipment.weapon = 'starter-sword';
    profile.equipment.primaryWeapon = 'starter-sword';
    expect(countEquippedArmorPieces(profile.equipment)).toBe(0);

    profile.equipment.helmet = 'common-forged-helmet';
    expect(countEquippedArmorPieces(profile.equipment)).toBe(1);

    profile.equipment.chest = 'common-forged-chest';
    expect(countEquippedArmorPieces(profile.equipment)).toBe(2);

    profile.equipment.pants = 'common-forged-pants';
    expect(countEquippedArmorPieces(profile.equipment)).toBe(3);

    profile.equipment.gloves = 'common-forged-gloves';
    expect(countEquippedArmorPieces(profile.equipment)).toBe(4);

    profile.equipment.boots = 'common-forged-boots';
    expect(countEquippedArmorPieces(profile.equipment)).toBe(5);
  });

  it('retorna 0 para equipment nulo ou indefinido', () => {
    expect(countEquippedArmorPieces(null)).toBe(0);
    expect(countEquippedArmorPieces(undefined)).toBe(0);
  });
});

describe('regularEnemyHpMultiplier', () => {
  it('aplica escala por wave: wave 1 = +0%, wave 2 = +30%, wave 3 = +40%, wave 4 = +45%, wave 5+ = +50%', () => {
    expect(regularEnemyHpMultiplier(1)).toBeCloseTo(1.0, 10);
    expect(regularEnemyHpMultiplier(2)).toBeCloseTo(1.30, 10);
    expect(regularEnemyHpMultiplier(3)).toBeCloseTo(1.40, 10);
    expect(regularEnemyHpMultiplier(4)).toBeCloseTo(1.45, 10);
    expect(regularEnemyHpMultiplier(5)).toBeCloseTo(1.50, 10);
    expect(regularEnemyHpMultiplier(6)).toBeCloseTo(1.50, 10);
  });

  it('trata waves invalidas como wave 1', () => {
    expect(regularEnemyHpMultiplier(0)).toBeCloseTo(1.0, 10);
    expect(regularEnemyHpMultiplier(Number.NaN)).toBeCloseTo(1.0, 10);
  });
});

describe('miniBossHpMultiplier', () => {
  it('aplica escala por wave: wave 1 = +0%, wave 2 = +35%, wave 3 = +40%, wave 4 = +45%, wave 5+ = +50%', () => {
    expect(miniBossHpMultiplier(1)).toBeCloseTo(1.0, 10);
    expect(miniBossHpMultiplier(2)).toBeCloseTo(1.35, 10);
    expect(miniBossHpMultiplier(3)).toBeCloseTo(1.40, 10);
    expect(miniBossHpMultiplier(4)).toBeCloseTo(1.45, 10);
    expect(miniBossHpMultiplier(5)).toBeCloseTo(1.50, 10);
  });

  it('nao passa de 50% depois da wave 5', () => {
    expect(miniBossHpMultiplier(6)).toBeCloseTo(1.50, 10);
    expect(miniBossHpMultiplier(7)).toBeCloseTo(1.50, 10);
    expect(miniBossHpMultiplier(99)).toBeCloseTo(1.50, 10);
  });
});

describe('finalBossTotalHp', () => {
  it('vale 5 barras (base aumentada em 4x)', () => {
    expect(FINAL_BOSS_HP_BARS).toBe(5);
    expect(finalBossTotalHp()).toBe(BOSS_BASE_HP * 5);
    expect(finalBossTotalHp()).toBe(7000);
    expect(BASE_BOSS_DAMAGE).toBe(11);
    expect(BASE_BOSS_SPEED).toBe(0.8);
    expect(BASE_BOSS_SCALE).toBe(3.2);
  });
});

describe('getBossEnrageStats', () => {
  it('aplica dano normal em 5x, dano aumentado em 3x e dano maximo em 1x com aumento de velocidade', () => {
    const stats5x = getBossEnrageStats(5);
    expect(stats5x.damageMultiplier).toBe(1.0);
    expect(stats5x.speedMultiplier).toBe(1.0);
    expect(stats5x.skillCooldownSeconds).toBe(5.0);

    const stats4x = getBossEnrageStats(4);
    expect(stats4x.damageMultiplier).toBe(1.2);
    expect(stats4x.speedMultiplier).toBe(1.1);
    expect(stats4x.skillCooldownSeconds).toBe(4.4);

    const stats3x = getBossEnrageStats(3);
    expect(stats3x.damageMultiplier).toBe(1.45);
    expect(stats3x.speedMultiplier).toBe(1.25);
    expect(stats3x.skillCooldownSeconds).toBe(3.7);

    const stats2x = getBossEnrageStats(2);
    expect(stats2x.damageMultiplier).toBe(1.7);
    expect(stats2x.speedMultiplier).toBe(1.4);
    expect(stats2x.skillCooldownSeconds).toBe(3.0);

    const stats1x = getBossEnrageStats(1);
    expect(stats1x.damageMultiplier).toBe(2.0);
    expect(stats1x.speedMultiplier).toBe(1.6);
    expect(stats1x.skillCooldownSeconds).toBe(2.2);
  });

  it('faz clamp seguro para valores fora do intervalo [1, 5]', () => {
    expect(getBossEnrageStats(99)).toEqual(getBossEnrageStats(5));
    expect(getBossEnrageStats(0)).toEqual(getBossEnrageStats(1));
    expect(getBossEnrageStats(-5)).toEqual(getBossEnrageStats(1));
  });
});

describe('getBossMinionComposition', () => {
  it('define monstros normais para barra 5x', () => {
    const comp5x = getBossMinionComposition(5);
    expect(comp5x.tier).toBe(1);
    expect(comp5x.normalCount).toBe(5);
    expect(comp5x.archerCount).toBe(0);
    expect(comp5x.guardianCount).toBe(0);
    expect(comp5x.totalCount).toBe(5);
    expect(comp5x.roster).toEqual(['normal', 'normal', 'normal', 'normal', 'normal']);
    expect(getBossMinionTier(5)).toBe(1);
  });

  it('define monstros arqueiros para barras 4x e 3x', () => {
    const comp4x = getBossMinionComposition(4);
    expect(comp4x.tier).toBe(2);
    expect(comp4x.normalCount).toBe(0);
    expect(comp4x.archerCount).toBe(5);
    expect(comp4x.guardianCount).toBe(0);
    expect(comp4x.totalCount).toBe(5);
    expect(comp4x.roster).toEqual(['archer', 'archer', 'archer', 'archer', 'archer']);
    expect(getBossMinionTier(4)).toBe(2);

    const comp3x = getBossMinionComposition(3);
    expect(comp3x.tier).toBe(2);
    expect(comp3x.archerCount).toBe(5);
    expect(getBossMinionTier(3)).toBe(2);
  });

  it('define 5 monstros arqueiros junto com 5 monstros guardiao para barras 2x e 1x', () => {
    const comp2x = getBossMinionComposition(2);
    expect(comp2x.tier).toBe(3);
    expect(comp2x.normalCount).toBe(0);
    expect(comp2x.archerCount).toBe(5);
    expect(comp2x.guardianCount).toBe(5);
    expect(comp2x.totalCount).toBe(10);
    expect(comp2x.roster).toEqual([
      'archer', 'archer', 'archer', 'archer', 'archer',
      'guardian', 'guardian', 'guardian', 'guardian', 'guardian',
    ]);
    expect(getBossMinionTier(2)).toBe(3);

    const comp1x = getBossMinionComposition(1);
    expect(comp1x.tier).toBe(3);
    expect(comp1x.archerCount).toBe(5);
    expect(comp1x.guardianCount).toBe(5);
    expect(comp1x.totalCount).toBe(10);
    expect(getBossMinionTier(1)).toBe(3);
  });
});
