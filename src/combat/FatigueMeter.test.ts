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

  it('charges the dash cost upfront: twenty percent of the bar per dash', () => {
    const fatigue = new FatigueMeter();

    expect(DASH_FATIGUE_COST).toBe(100);
    expect(fatigue.consume(DASH_FATIGUE_COST)).toBe(400);
    expect(fatigue.canUseSkills).toBe(true);
    expect(fatigue.canDash).toBe(true);

    // Cinco dashes zeram a barra e exaurem skills e dash.
    fatigue.consume(DASH_FATIGUE_COST * 4);
    expect(fatigue.isSkillExhausted).toBe(true);
    expect(fatigue.canUseSkills).toBe(false);
    expect(fatigue.canDash).toBe(false);
  });

  it('locks skills and dash after exhaustion and rapidly recovers while stationary', () => {
    const fatigue = new FatigueMeter();

    fatigue.update(210, true);
    expect(fatigue.isSkillExhausted).toBe(true);
    expect(fatigue.canUseSkills).toBe(false);
    expect(fatigue.canDash).toBe(false);

    fatigue.update((MIN_FATIGUE_TO_RESUME_SKILLS - 1) / 125, false);
    expect(fatigue.canUseSkills).toBe(false);
    fatigue.update(1 / 125, false);
    expect(fatigue.canUseSkills).toBe(true);
  });

  it('charges a percentage of the current bar and holds that cost while a cast is locked', () => {
    const fatigue = new FatigueMeter();

    expect(fatigue.canAffordPercent(8)).toBe(true);
    expect(fatigue.consumePercent(8)).toBe(460);
    expect(fatigue.update(2, false, true)).toBe(460);
    expect(fatigue.update(1, false)).toBe(500);

    fatigue.consume(fatigue.currentMaxFatigue);
    expect(fatigue.canAffordPercent(8)).toBe(false);
  });

  it('supports expanded maximum fatigue reserve from agility', () => {
    const fatigue = new FatigueMeter();
    fatigue.setMaxFatigue(700);

    expect(fatigue.currentMaxFatigue).toBe(700);
    expect(fatigue.update(0, false)).toBe(700);
    expect(fatigue.consume(100)).toBe(600);
  });
});

