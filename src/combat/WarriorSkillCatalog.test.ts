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

  it('keeps every skill inside five meters from the warrior and playback no faster than 1.2x', () => {
    expect(WARRIOR_SKILLS.every(({ area }) => area.radius + (area.forwardOffset ?? 0) <= 5)).toBe(true);
    expect(WARRIOR_SKILLS.every(({ playbackRate }) => playbackRate >= 1 && playbackRate <= 1.2)).toBe(true);
  });

  it('uses an exactly four-second cooldown for every skill', () => {
    expect(WARRIOR_SKILLS.map(({ cooldown }) => cooldown)).toEqual([4, 4, 4, 4, 4]);
  });

  it('unlocks one skill per level with the approved progressive damage bonus', () => {
    expect(WARRIOR_SKILLS.map((skill) => ({
      id: skill.id,
      unlockLevel: skill.unlockLevel,
      damageMultiplier: skill.damageMultiplier,
    }))).toEqual([
      { id: 'ataque_giratorio', unlockLevel: 2, damageMultiplier: 1.1 },
      { id: 'ataque_giratorio_2', unlockLevel: 3, damageMultiplier: 1.14 },
      { id: 'pulo_atacando', unlockLevel: 4, damageMultiplier: 1.18 },
      { id: 'triplo_ataque', unlockLevel: 5, damageMultiplier: 1.22 },
      { id: 'corte_duplo', unlockLevel: 7, damageMultiplier: 1.26 },
    ]);
  });
});
