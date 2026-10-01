import { describe, expect, it } from 'vitest';
import { formatSkillCooldown } from './SkillCooldownText';

describe('formatSkillCooldown', () => {
  it('keeps short skill recharges in seconds', () => {
    expect(formatSkillCooldown(6)).toBe('6.0s');
    expect(formatSkillCooldown(1.24)).toBe('1.2s');
  });

  it('shows the special three-minute recharge as minutes and seconds', () => {
    expect(formatSkillCooldown(180)).toBe('3 min');
    expect(formatSkillCooldown(179)).toBe('2 min 59 s');
    expect(formatSkillCooldown(65)).toBe('1 min 05 s');
  });

  it('clamps invalid and negative values safely', () => {
    expect(formatSkillCooldown(Number.NaN)).toBe('0.0s');
    expect(formatSkillCooldown(-5)).toBe('0.0s');
  });
});
