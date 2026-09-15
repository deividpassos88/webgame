import { describe, expect, it } from 'vitest';
import {
  awardExperience,
  createInitialProgression,
  experienceRequiredForLevel,
  experienceForEncounter,
} from './CharacterProgression';
import { WARRIOR_SKILLS, isWarriorSkillUnlocked } from '../combat/WarriorSkillCatalog';

describe('CharacterProgression', () => {
  it('uses a lighter early reward curve that grows through the sixth wave and the final boss', () => {
    expect([1, 2, 3, 4, 5, 6].map((wave) => experienceForEncounter('regular', wave))).toEqual([2, 3, 4, 5, 6, 7]);
    expect([1, 2, 3, 4, 5, 6].map((wave) => experienceForEncounter('mini-boss', wave))).toEqual([5, 6, 7, 8, 9, 10]);
    expect([1, 2, 3, 4, 5, 6].every((wave) => (
      experienceForEncounter('mini-boss', wave) > experienceForEncounter('regular', wave)
    ))).toBe(true);
    expect(experienceForEncounter('boss', 6)).toBe(155);
  });

  it('makes the next level progressively more expensive after the early waves', () => {
    expect(experienceRequiredForLevel(1)).toBe(60);
    expect(experienceRequiredForLevel(9)).toBe(220);
    expect(experienceRequiredForLevel(20)).toBe(440);
  });

  it('unlocks the five Warrior skills by the sixth normal wave before the final boss', () => {
    let progression = createInitialProgression();
    let pointsGranted = 0;

    for (let wave = 1; wave <= 6; wave += 1) {
      for (let index = 0; index < 25; index += 1) {
        const award = awardExperience(progression, 'regular', wave);
        progression = award.progression;
        pointsGranted += award.pointsGranted;
      }
      for (let index = 0; index < 2; index += 1) {
        const award = awardExperience(progression, 'mini-boss', wave);
        progression = award.progression;
        pointsGranted += award.pointsGranted;
      }
      const unlocked = WARRIOR_SKILLS.filter((skill) => isWarriorSkillUnlocked(skill.id, progression.level));
      expect(unlocked).toHaveLength(wave === 6 ? 5 : Math.min(4, wave));
    }
    expect(progression).toEqual({ level: 7, experience: 765 });
    const bossAward = awardExperience(progression, 'boss', 6);
    progression = bossAward.progression;
    pointsGranted += bossAward.pointsGranted;

    expect(progression).toEqual({ level: 8, experience: 920 });
    expect(pointsGranted).toBe(35);
  });

  it('caps repeat final-battle awards without granting more points', () => {
    const capped = { level: 21, experience: 5000 };

    expect(awardExperience(capped, 'boss', 6)).toEqual({
      progression: capped,
      experienceGranted: 0,
      levelsGained: 0,
      pointsGranted: 0,
    });
  });
});
