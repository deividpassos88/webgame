import { describe, expect, it } from 'vitest';
import {
  applyDistanceFalloff,
  getEffectiveTargetDistance,
  getDistanceDamageMultiplier,
  getDistanceFalloffProfile,
  type DistanceFalloffProfile,
} from './DistanceDamage';

describe('DistanceDamage', () => {
  it('exposes the approved full and maximum ranges for each combatant profile', () => {
    expect(getDistanceFalloffProfile('warrior')).toEqual({
      fullDamageDistance: 2,
      maxDistance: 5,
      minimumMultiplier: 0.3,
    });
    expect(getDistanceFalloffProfile('mage')).toEqual({
      fullDamageDistance: 3,
      maxDistance: 7,
      minimumMultiplier: 0.35,
    });
    expect(getDistanceFalloffProfile('regular')).toEqual({
      fullDamageDistance: 1.25,
      maxDistance: 4,
      minimumMultiplier: 0.45,
    });
    expect(getDistanceFalloffProfile('mini-boss')).toEqual({
      fullDamageDistance: 1.5,
      maxDistance: 5,
      minimumMultiplier: 0.3,
    });
  });

  it.each([
    ['warrior', 2, 1],
    ['warrior', 3.5, 0.65],
    ['warrior', 5, 0.3],
    ['mage', 3, 1],
    ['mage', 5, 0.675],
    ['mage', 7, 0.35],
    ['regular', 1.25, 1],
    ['regular', 2.625, 0.725],
    ['regular', 4, 0.45],
    ['mini-boss', 1.5, 1],
    ['mini-boss', 3.25, 0.65],
    ['mini-boss', 5, 0.3],
  ] as const)('%s scales damage linearly at %sm to %s', (profile, distance, expected) => {
    expect(getDistanceDamageMultiplier(distance, profile)).toBeCloseTo(expected);
  });

  it('returns no damage beyond the profile range and full damage up to the inner range', () => {
    const profiles: readonly DistanceFalloffProfile[] = ['warrior', 'mage', 'regular', 'mini-boss'];
    for (const profile of profiles) {
      const definition = getDistanceFalloffProfile(profile);
      expect(getDistanceDamageMultiplier(-10, profile)).toBe(1);
      expect(getDistanceDamageMultiplier(definition.fullDamageDistance - 0.001, profile)).toBe(1);
      expect(getDistanceDamageMultiplier(definition.maxDistance + 0.001, profile)).toBe(0);
      expect(getDistanceDamageMultiplier(Number.NaN, profile)).toBe(0);
    }
  });

  it('applies the multiplier to finite non-negative base damage', () => {
    expect(applyDistanceFalloff(20, 3.5, 'warrior')).toBeCloseTo(13);
    expect(applyDistanceFalloff(-20, 1, 'warrior')).toBe(0);
    expect(applyDistanceFalloff(Number.NaN, 1, 'warrior')).toBe(0);
    expect(applyDistanceFalloff(20, 9, 'warrior')).toBe(0);
  });

  it('uses the same target-surface distance for range checks and falloff', () => {
    expect(getEffectiveTargetDistance(5.6, 0.6)).toBeCloseTo(5);
    expect(getEffectiveTargetDistance(0.2, 0.6)).toBe(0);
    expect(getEffectiveTargetDistance(Number.NaN, 0.6)).toBe(Number.POSITIVE_INFINITY);
  });
});
