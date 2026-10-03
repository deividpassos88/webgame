import { describe, expect, it } from 'vitest';
import {
  COMBO_EMPOWER_DAMAGE_MULTIPLIER,
  COMBO_EMPOWER_MAX_PLAYBACK_MULTIPLIER,
  COMBO_EMPOWER_PLAYBACK_MULTIPLIER,
  clampSkillPlaybackScale,
  comboDamageMultiplier,
  comboPlaybackMultiplier,
} from './ComboEmpowerment';

describe('ComboEmpowerment', () => {
  it('keeps the first skill of a combo at normal speed and damage', () => {
    expect(comboDamageMultiplier(false)).toBe(1);
    expect(comboPlaybackMultiplier(false)).toBe(1);
  });

  it('doubles the damage and speeds the skill up from the first green hit', () => {
    expect(comboDamageMultiplier(true)).toBe(2);
    expect(comboDamageMultiplier(true)).toBe(COMBO_EMPOWER_DAMAGE_MULTIPLIER);
    expect(comboPlaybackMultiplier(true)).toBeGreaterThan(1);
    expect(comboPlaybackMultiplier(true)).toBe(COMBO_EMPOWER_PLAYBACK_MULTIPLIER);
  });

  it('never lets the playback scale go below 1 or above the safety cap', () => {
    expect(clampSkillPlaybackScale(0)).toBe(1);
    expect(clampSkillPlaybackScale(-2)).toBe(1);
    expect(clampSkillPlaybackScale(Number.NaN)).toBe(1);
    expect(clampSkillPlaybackScale(0.5)).toBe(1);
    expect(clampSkillPlaybackScale(1.3)).toBeCloseTo(1.3, 5);
    expect(clampSkillPlaybackScale(9)).toBe(COMBO_EMPOWER_MAX_PLAYBACK_MULTIPLIER);
    expect(COMBO_EMPOWER_PLAYBACK_MULTIPLIER).toBeLessThanOrEqual(
      COMBO_EMPOWER_MAX_PLAYBACK_MULTIPLIER
    );
  });
});
