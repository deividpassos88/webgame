import { describe, expect, it } from 'vitest';
import { WARRIOR_SKILLS, getWarriorSkill } from './WarriorSkillCatalog';

describe('WarriorSkillCatalog', () => {
  it('keeps fire and ice assigned to the approved warrior skills', () => {
    expect(getWarriorSkill('triplo_ataque')).toMatchObject({
      label: 'Golpe Flamejante',
      element: 'fire',
    });
    expect(getWarriorSkill('ataque_giratorio_2')).toMatchObject({
      label: 'Giro Glacial',
      element: 'ice',
    });
    expect(WARRIOR_SKILLS.filter(({ element }) => element === null)).toHaveLength(3);
  });

  it('keeps the two spins at ten meters while other skills stay inside five meters', () => {
    expect(WARRIOR_SKILLS.filter(({ id }) => id === 'ataque_giratorio' || id === 'ataque_giratorio_2')
      .every(({ area }) => area.radius === 10)).toBe(true);
    expect(WARRIOR_SKILLS.filter(({ id }) => id !== 'ataque_giratorio' && id !== 'ataque_giratorio_2')
      .every(({ area }) => area.radius + (area.forwardOffset ?? 0) <= 5)).toBe(true);
    expect(WARRIOR_SKILLS.every(({ playbackRate }) => playbackRate >= 1 && playbackRate <= 1.2)).toBe(true);
  });

  it('scales cooldown upward for stronger skills', () => {
    expect(WARRIOR_SKILLS.map(({ cooldown }) => cooldown)).toEqual([6, 8, 10, 12, 14]);
  });

  it('unlocks skills every three levels with the approved progressive damage bonus', () => {
    expect(WARRIOR_SKILLS.map((skill) => ({
      id: skill.id,
      unlockLevel: skill.unlockLevel,
      damageMultiplier: skill.damageMultiplier,
    }))).toEqual([
      { id: 'ataque_giratorio', unlockLevel: 3, damageMultiplier: 1.1 },
      { id: 'ataque_giratorio_2', unlockLevel: 6, damageMultiplier: 1.14 },
      { id: 'pulo_atacando', unlockLevel: 9, damageMultiplier: 1.18 },
      { id: 'triplo_ataque', unlockLevel: 12, damageMultiplier: 1.22 },
      { id: 'corte_duplo', unlockLevel: 15, damageMultiplier: 1.26 },
    ]);
  });
});
