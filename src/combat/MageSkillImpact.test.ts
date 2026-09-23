import { describe, expect, it } from 'vitest';
import {
  MAGE_FIRE_BURN_DAMAGE_PER_SECOND,
  MAGE_FIRE_BURN_SECONDS,
  MAGE_FIRE_RADIUS_METERS,
  MAGE_ICE_FREEZE_SECONDS,
  MAGE_SHOCK_LEVITATE_SECONDS,
  MAGE_SHOCK_RADIUS_METERS,
  MAGE_WATER_SLOW_MULTIPLIER,
  MAGE_WATER_SLOW_SECONDS,
  isInsideMageSkillRadius,
  mageSkillImpactEffect,
} from './MageSkillImpact';

describe('Mage skill impact control', () => {
  it('paralyzes with ice, slows with water, lifts with lightning and burns with lava', () => {
    expect(mageSkillImpactEffect('ice')).toEqual({
      kind: 'freeze',
      seconds: MAGE_ICE_FREEZE_SECONDS,
    });
    expect(mageSkillImpactEffect('water')).toEqual({
      kind: 'slow',
      seconds: MAGE_WATER_SLOW_SECONDS,
    });
    expect(mageSkillImpactEffect('lightning')).toEqual({
      kind: 'shock',
      seconds: MAGE_SHOCK_LEVITATE_SECONDS,
      radius: MAGE_SHOCK_RADIUS_METERS,
    });
    expect(mageSkillImpactEffect('lava')).toEqual({
      kind: 'burn',
      seconds: MAGE_FIRE_BURN_SECONDS,
      damagePerSecond: MAGE_FIRE_BURN_DAMAGE_PER_SECOND,
      radius: MAGE_FIRE_RADIUS_METERS,
    });
    expect(MAGE_ICE_FREEZE_SECONDS).toBe(3);
    expect(MAGE_WATER_SLOW_SECONDS).toBe(3);
    expect(MAGE_WATER_SLOW_MULTIPLIER).toBe(0.5);
    expect(MAGE_SHOCK_LEVITATE_SECONDS).toBe(2.1);
    expect(MAGE_SHOCK_RADIUS_METERS).toBe(2);
    expect(MAGE_FIRE_BURN_SECONDS).toBe(4);
    expect(MAGE_FIRE_BURN_DAMAGE_PER_SECOND).toBe(2);
    expect(MAGE_FIRE_RADIUS_METERS).toBe(2);
  });

  it('does not invent control effects for the basic attack or laser', () => {
    expect(mageSkillImpactEffect('basic')).toBeNull();
    expect(mageSkillImpactEffect('laser')).toBeNull();
  });

  it('includes a monster on the 2m edge and excludes one just outside', () => {
    expect(isInsideMageSkillRadius(0, 0, 2, 0)).toBe(true);
    expect(isInsideMageSkillRadius(1, 1, 1, 1)).toBe(true);
    expect(isInsideMageSkillRadius(0, 0, 2.05, 0)).toBe(false);
    expect(isInsideMageSkillRadius(0, 0, 0, 0, 2)).toBe(true);
  });
});
