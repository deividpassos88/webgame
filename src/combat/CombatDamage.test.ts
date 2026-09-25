import { describe, expect, it } from 'vitest';
import { applyArcherDamageVsPlayerClass, getTypedAttackBaseDamage, quantizeCombatDamage } from './CombatDamage';

describe('getTypedAttackBaseDamage', () => {
  it('applies Strength only to physical attacks', () => {
    expect(getTypedAttackBaseDamage(11, 1.5, false)).toBeCloseTo(16.5);
    expect(getTypedAttackBaseDamage(11, 1.5, true)).toBe(11);
  });

  it('clamps malformed damage and multipliers safely', () => {
    expect(getTypedAttackBaseDamage(-10, 2, false)).toBe(0);
    expect(getTypedAttackBaseDamage(10, Number.NaN, false)).toBe(10);
  });
});

describe('quantizeCombatDamage', () => {
  it('turns final combat damage into stable whole numbers', () => {
    expect(quantizeCombatDamage(7.000077777)).toBe(7);
    expect(quantizeCombatDamage(7.6)).toBe(8);
    expect(quantizeCombatDamage(0.51)).toBe(1);
  });

  it('rejects invalid and non-positive damage', () => {
    expect(quantizeCombatDamage(0)).toBe(0);
    expect(quantizeCombatDamage(-7.4)).toBe(0);
    expect(quantizeCombatDamage(Number.NaN)).toBe(0);
  });
});

describe('applyArcherDamageVsPlayerClass', () => {
  it('corta 40% do dano das flechas do monstro_arch contra a Maga', () => {
    expect(applyArcherDamageVsPlayerClass(100, true, 'mage')).toBeCloseTo(60);
    expect(applyArcherDamageVsPlayerClass(37, true, 'mage')).toBeCloseTo(22.2);
  });

  it('não altera o dano recebido pelo Guerreiro', () => {
    expect(applyArcherDamageVsPlayerClass(100, true, 'warrior')).toBe(100);
    expect(applyArcherDamageVsPlayerClass(37, true, 'warrior')).toBe(37);
  });

  it('não altera ataques corpo a corpo de nenhuma classe', () => {
    expect(applyArcherDamageVsPlayerClass(100, false, 'mage')).toBe(100);
    expect(applyArcherDamageVsPlayerClass(100, false, 'warrior')).toBe(100);
  });

  it('trata dano inválido como zero', () => {
    expect(applyArcherDamageVsPlayerClass(Number.NaN, true, 'mage')).toBe(0);
    expect(applyArcherDamageVsPlayerClass(-25, true, 'mage')).toBe(0);
  });
});
