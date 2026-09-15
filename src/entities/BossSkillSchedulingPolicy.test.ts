import { describe, expect, it } from 'vitest';
import {
  shouldClearBossTelegraph,
  shouldUpdateBossSkills,
} from './BossSkillSchedulingPolicy';

describe('boss skill scheduling policy', () => {
  it('keeps the skill clock active during melee and ranged combat', () => {
    expect(shouldUpdateBossSkills('melee')).toBe(true);
    expect(shouldUpdateBossSkills('ranged')).toBe(true);
    expect(shouldUpdateBossSkills('casting')).toBe(true);
  });

  it('pauses new skills only while following and never clears an active cast', () => {
    expect(shouldUpdateBossSkills('follow')).toBe(false);
    expect(shouldClearBossTelegraph('follow', false)).toBe(true);
    expect(shouldClearBossTelegraph('follow', true)).toBe(false);
    expect(shouldClearBossTelegraph('melee', false)).toBe(false);
  });
});
