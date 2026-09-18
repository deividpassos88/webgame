import { describe, expect, it } from 'vitest';
import {
  DASH_FATIGUE_COST,
  FatigueMeter,
  MIN_FATIGUE_TO_RESUME_SKILLS,
} from './FatigueMeter';

describe('FatigueMeter', () => {
  it('drains only while the player is effectively moving', () => {
    const fatigue = new FatigueMeter();

    expect(fatigue.update(1, true)).toBe(498);
    expect(fatigue.update(1, false)).toBe(500);
  });

  it('keeps the same drain rate across a five-times-larger reserve', () => {
    const fatigue = new FatigueMeter();

    expect(fatigue.update(100, true)).toBe(260);
    expect(fatigue.update(109, true)).toBe(0);
  });

  it('charges the dash cost upfront: half the bar per dash', () => {
    const fatigue = new FatigueMeter();

    expect(DASH_FATIGUE_COST).toBe(250);
    expect(fatigue.consume(DASH_FATIGUE_COST)).toBe(250);
    expect(fatigue.canUseSkills).toBe(true);

    // Segundo dash seguido zera a barra e exaure as skills.
    expect(fatigue.consume(DASH_FATIGUE_COST)).toBe(0);
    expect(fatigue.isSkillExhausted).toBe(true);
    expect(fatigue.canUseSkills).toBe(false);
  });

  it('locks skills only after exhaustion and releases them after recovering seven percent', () => {
    const fatigue = new FatigueMeter();

    fatigue.update(210, true);
    expect(fatigue.isSkillExhausted).toBe(true);
    expect(fatigue.canUseSkills).toBe(false);

    fatigue.update((MIN_FATIGUE_TO_RESUME_SKILLS - 1) / 18, false);
    expect(fatigue.canUseSkills).toBe(false);
    fatigue.update(1 / 18, false);
    expect(fatigue.canUseSkills).toBe(true);
  });
});
