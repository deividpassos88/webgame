import { describe, expect, it } from 'vitest';
import { WARRIOR_SKILLS } from './WarriorSkillCatalog';
import { WarriorSkillController } from './WarriorSkillController';

describe('WarriorSkillController', () => {
  it('defines exactly five skills and keeps their animation speeds at or below 1.2x', () => {
    expect(WARRIOR_SKILLS.map(({ id }) => id)).toEqual([
      'ataque_giratorio',
      'ataque_giratorio_2',
      'pulo_atacando',
      'triplo_ataque',
      'corte_duplo',
    ]);
    expect(
      WARRIOR_SKILLS.every(
        ({ playbackRate }) => playbackRate >= 1 && playbackRate <= 1.2
      )
    ).toBe(true);
  });

  it('spends energy and starts cooldowns', () => {
    const skills = new WarriorSkillController();

    expect(skills.tryActivate('ataque_giratorio')).toEqual({
      kind: 'activated',
      attackId: 'ataque_giratorio',
    });
    expect(skills.snapshot().energy).toBe(42);
    expect(skills.snapshot().skills.ataque_giratorio.cooldownRemaining).toBe(6);

    skills.update(1, false, true);
    expect(skills.snapshot().skills.ataque_giratorio.cooldownRemaining).toBeCloseTo(5);
  });

  it('recovers mana only while standing still, 100% in four seconds', () => {
    const skills = new WarriorSkillController();

    expect(skills.spend(50)).toBe(true);
    expect(skills.snapshot().energy).toBe(0);

    // Andando não recupera nada (mesmo sinal de "parado" da fadiga).
    skills.update(4, false, true);
    expect(skills.snapshot().energy).toBe(0);

    // Parado recupera linear: metade em 2s, 100% em 4s — sem espera.
    skills.update(2, false, false);
    expect(skills.snapshot().energy).toBeCloseTo(25);
    skills.update(2, false, false);
    expect(skills.snapshot().energy).toBeCloseTo(50);
  });


  it('can skip cooldown without waiving the energy cost', () => {
    const skills = new WarriorSkillController();

    expect(skills.tryActivate('triplo_ataque', { waiveCooldown: true })).toEqual({
      kind: 'activated',
      attackId: 'triplo_ataque',
    });
    expect(skills.tryActivate('triplo_ataque', { waiveCooldown: true }).kind).toBe('activated');

    const snapshot = skills.snapshot();
    expect(snapshot.energy).toBe(snapshot.maxEnergy - 18 * 2);
    expect(snapshot.skills.triplo_ataque.cooldownRemaining).toBe(0);
  });

  it('activates free training skills without spending energy or starting cooldowns', () => {
    const skills = new WarriorSkillController();

    expect(skills.tryActivate('triplo_ataque', { free: true })).toEqual({
      kind: 'activated',
      attackId: 'triplo_ataque',
    });
    expect(skills.tryActivate('triplo_ataque', { free: true })).toEqual({
      kind: 'activated',
      attackId: 'triplo_ataque',
    });

    const snapshot = skills.snapshot();
    expect(snapshot.energy).toBe(snapshot.maxEnergy);
    expect(snapshot.skills.triplo_ataque.cooldownRemaining).toBe(0);
  });

  it('freezes regeneration and cooldowns while paused', () => {
    const skills = new WarriorSkillController();
    skills.tryActivate('corte_duplo');
    const before = skills.snapshot();

    skills.update(10, true);

    expect(skills.snapshot()).toEqual(before);
  });

  it('does not spend energy when a skill is blocked by combat state', () => {
    const skills = new WarriorSkillController();

    expect(skills.tryActivate('pulo_atacando', { busy: true })).toEqual({
      kind: 'rejected',
      reason: 'busy',
    });
    expect(skills.tryActivate('pulo_atacando', { paused: true })).toEqual({
      kind: 'rejected',
      reason: 'paused',
    });
    expect(skills.tryActivate('pulo_atacando', { dead: true })).toEqual({
      kind: 'rejected',
      reason: 'dead',
    });
    expect(skills.snapshot().energy).toBe(50);
  });

  it('rejects cooling-down and unaffordable skills without double spending', () => {
    const skills = new WarriorSkillController();
    expect(skills.tryActivate('triplo_ataque').kind).toBe('activated');
    expect(skills.tryActivate('triplo_ataque')).toEqual({
      kind: 'rejected',
      reason: 'cooldown',
    });
    expect(skills.snapshot().energy).toBe(32);

    skills.tryActivate('corte_duplo');
    skills.tryActivate('pulo_atacando');
    expect(skills.tryActivate('ataque_giratorio_2')).toEqual({
      kind: 'rejected',
      reason: 'insufficient-energy',
    });
    expect(skills.snapshot().energy).toBe(2);
  });

  it('can refund a just-accepted activation when the player rejects it', () => {
    const skills = new WarriorSkillController();
    skills.tryActivate('ataque_giratorio_2');

    expect(skills.refund('ataque_giratorio_2')).toBe(true);
    expect(skills.snapshot().energy).toBe(50);
    expect(skills.snapshot().skills.ataque_giratorio_2.cooldownRemaining).toBe(0);
    expect(skills.refund('ataque_giratorio_2')).toBe(false);
  });

  it('spends a generic mana cost and rejects spends beyond the current bar', () => {
    const skills = new WarriorSkillController();

    expect(skills.canSpend(5)).toBe(true);
    expect(skills.spend(5)).toBe(true);
    expect(skills.snapshot().energy).toBe(45);
    expect(skills.spend(46)).toBe(false);
    expect(skills.snapshot().energy).toBe(45);
  });

  it('restores full energy and clears cooldowns for a new run', () => {
    const skills = new WarriorSkillController();
    skills.tryActivate('triplo_ataque');

    skills.reset();

    const snapshot = skills.snapshot();
    expect(snapshot.energy).toBe(snapshot.maxEnergy);
    expect(
      Object.values(snapshot.skills).every(({ cooldownRemaining }) => cooldownRemaining === 0)
    ).toBe(true);
  });
});
