import { describe, expect, it } from 'vitest';
import {
  BASIC_ATTACK_AREA_DAMAGE_DIVISOR,
  BASIC_ATTACK_AREA_DAMAGE_MULTIPLIER,
  BASIC_ATTACK_AREA_RADIUS_METERS,
  basicAttackAreaDamage,
  isInsideBasicAttackArea,
} from './BasicAttackArea';

describe('BasicAttackArea (regra do dano em área dos ataques básicos)', () => {
  it('respinga 2 m ao redor do alvo', () => {
    expect(BASIC_ATTACK_AREA_RADIUS_METERS).toBe(2);
    expect(isInsideBasicAttackArea(0, 0, 1.99, 0)).toBe(true);
    expect(isInsideBasicAttackArea(0, 0, 0, -1.9)).toBe(true);
    expect(isInsideBasicAttackArea(0, 0, 2.01, 0)).toBe(false);
    // O raio é horizontal: a altura não conta.
    expect(isInsideBasicAttackArea(0, 0, 1.4, 1.4)).toBe(true);
    expect(isInsideBasicAttackArea(0, 0, 1.6, 1.6)).toBe(false);
  });

  it('paga 4x menos que o dano do alvo', () => {
    expect(BASIC_ATTACK_AREA_DAMAGE_DIVISOR).toBe(4);
    expect(BASIC_ATTACK_AREA_DAMAGE_MULTIPLIER).toBe(0.25);
    // Exemplo do usuário: arma com 5 de dano -> vizinho leva 1 (1,25 arredondado
    // para baixo na quantização do combate).
    expect(basicAttackAreaDamage(5)).toBeCloseTo(1.25, 5);
    expect(basicAttackAreaDamage(20)).toBe(5);
  });

  it('devolve 0 para dano inválido em vez de NaN', () => {
    expect(basicAttackAreaDamage(0)).toBe(0);
    expect(basicAttackAreaDamage(-3)).toBe(0);
    expect(basicAttackAreaDamage(Number.NaN)).toBe(0);
  });
});
