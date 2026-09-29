import { describe, expect, it } from 'vitest';
import { WARRIOR_SKILLS } from './WarriorSkillCatalog';
import {
  BLADE_STORM_ARC_COUNT,
  BLADE_STORM_DAMAGE_RATIO,
  getWarriorSkillEffect,
  warriorSkillEffectIsBladeStorm,
  warriorSkillEffectLocksTarget,
  warriorSkillEffectSlowsTarget,
} from './WarriorSkillEffects';

describe('Efeito de controle de cada skill do guerreiro', () => {
  it('cobre as cinco skills na ordem das teclas 1 a 5', () => {
    const byInput = [...WARRIOR_SKILLS].sort((a, b) => a.input.localeCompare(b.input));
    expect(byInput.map((skill) => skill.id)).toEqual([
      'ataque_giratorio',
      'ataque_giratorio_2',
      'pulo_atacando',
      'triplo_ataque',
      'corte_duplo',
    ]);
    expect(byInput.map((skill) => getWarriorSkillEffect(skill.id).kind)).toEqual([
      'stun',
      'freeze',
      'slow',
      'knockdown',
      'blade-storm',
    ]);
  });

  it('usa exatamente as durações pedidas', () => {
    expect(getWarriorSkillEffect('ataque_giratorio').durationSeconds).toBe(1.2);
    expect(getWarriorSkillEffect('ataque_giratorio_2').durationSeconds).toBe(1.2);
    expect(getWarriorSkillEffect('pulo_atacando').durationSeconds).toBe(1.5);
    expect(getWarriorSkillEffect('triplo_ataque').durationSeconds).toBe(1.3);
  });

  it('classifica quem trava o monstro e quem só deixa lento', () => {
    expect(warriorSkillEffectLocksTarget('stun')).toBe(true);
    expect(warriorSkillEffectLocksTarget('freeze')).toBe(true);
    expect(warriorSkillEffectLocksTarget('knockdown')).toBe(true);
    expect(warriorSkillEffectLocksTarget('slow')).toBe(false);
    expect(warriorSkillEffectLocksTarget('blade-storm')).toBe(false);

    expect(warriorSkillEffectSlowsTarget('slow')).toBe(true);
    expect(warriorSkillEffectSlowsTarget('stun')).toBe(false);

    expect(warriorSkillEffectIsBladeStorm(getWarriorSkillEffect('corte_duplo').kind)).toBe(true);
    expect(warriorSkillEffectIsBladeStorm(getWarriorSkillEffect('ataque_giratorio').kind)).toBe(false);
  });

  it('a tempestade de arcos tem vários arcos com dano parcial', () => {
    expect(BLADE_STORM_ARC_COUNT).toBeGreaterThanOrEqual(3);
    expect(BLADE_STORM_DAMAGE_RATIO).toBeGreaterThan(0);
    expect(BLADE_STORM_DAMAGE_RATIO).toBeLessThan(1);
  });
});
