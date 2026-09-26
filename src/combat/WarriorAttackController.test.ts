import { describe, expect, it } from 'vitest';
import { WarriorAttackController } from './WarriorAttackController';

describe('WarriorAttackController', () => {
  it('emits the basic attack hit and end once at normalized timing', () => {
    const attacks = new WarriorAttackController();
    expect(attacks.start('ataque_basico', 1)).toBe(true);

    expect(attacks.update(0.47)).toEqual([
      { type: 'trail-start', attackId: 'ataque_basico' },
    ]);
    expect(attacks.update(0.02)).toEqual([
      { type: 'hit', attackId: 'ataque_basico', hitIndex: 0 },
    ]);
    expect(attacks.update(0.51)).toEqual([
      { type: 'trail-end', attackId: 'ataque_basico' },
      { type: 'attack-ended', attackId: 'ataque_basico' },
    ]);
    expect(attacks.active).toBe(false);
  });

  it('emits every triple-attack hit even when one frame crosses all thresholds', () => {
    const attacks = new WarriorAttackController();
    attacks.start('triplo_ataque', 2);

    expect(attacks.update(2).filter(({ type }) => type === 'hit')).toEqual([
      { type: 'hit', attackId: 'triplo_ataque', hitIndex: 0 },
      { type: 'hit', attackId: 'triplo_ataque', hitIndex: 1 },
      { type: 'hit', attackId: 'triplo_ataque', hitIndex: 2 },
    ]);
  });

  it('emits the jump impact with its matching hit', () => {
    const attacks = new WarriorAttackController();
    attacks.start('pulo_atacando', 1);

    expect(attacks.update(0.83)).toContainEqual({
      type: 'impact',
      attackId: 'pulo_atacando',
    });
  });

  it('rejects overlap and can be cancelled without completion events', () => {
    const attacks = new WarriorAttackController();
    expect(attacks.start('corte_duplo', 1.5)).toBe(true);
    expect(attacks.start('ataque_giratorio', 1)).toBe(false);
    attacks.cancel();

    expect(attacks.update(10)).toEqual([]);
    expect(attacks.active).toBe(false);
  });
});
