import { describe, expect, it } from 'vitest';
import {
  MAGE_ICE_FREEZE_SECONDS,
  MAGE_SHOCK_RADIUS_METERS,
  MAGE_WATER_ROOT_SECONDS,
  isInsideMageShockRadius,
  mageSkillImpactEffect,
} from './MageSkillImpact';

describe('Mage skill impact control', () => {
  it('freezes with ice, roots running with water, and shocks in a 2m radius', () => {
    expect(mageSkillImpactEffect('ice')).toEqual({
      kind: 'freeze',
      seconds: MAGE_ICE_FREEZE_SECONDS,
    });
    expect(mageSkillImpactEffect('water')).toEqual({
      kind: 'root',
      seconds: MAGE_WATER_ROOT_SECONDS,
    });
    expect(mageSkillImpactEffect('lightning')).toEqual({
      kind: 'shock',
      seconds: 1,
      radius: MAGE_SHOCK_RADIUS_METERS,
    });
    expect(MAGE_ICE_FREEZE_SECONDS).toBe(0.5);
    expect(MAGE_WATER_ROOT_SECONDS).toBe(1.5);
    expect(MAGE_SHOCK_RADIUS_METERS).toBe(2);
  });

  it('does not invent control effects for the basic attack, lava or laser', () => {
    expect(mageSkillImpactEffect('basic')).toBeNull();
    expect(mageSkillImpactEffect('lava')).toBeNull();
    expect(mageSkillImpactEffect('laser')).toBeNull();
  });

  it('includes a monster on the 2m edge and excludes one just outside', () => {
    expect(isInsideMageShockRadius(0, 0, 2, 0)).toBe(true);
    expect(isInsideMageShockRadius(1, 1, 1, 1)).toBe(true);
    expect(isInsideMageShockRadius(0, 0, 2.05, 0)).toBe(false);
    expect(isInsideMageShockRadius(0, 0, 0, 0, 2)).toBe(true);
  });
});
