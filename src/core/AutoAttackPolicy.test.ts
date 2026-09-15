import { describe, expect, it } from 'vitest';
import {
  getMarkedTargetSurfaceDistance,
  isMarkedTargetInRange,
  resolveManualAttackTarget,
  shouldStartAutoAttack,
} from './AutoAttackPolicy';

const readyTarget = {
  hasTarget: true,
  targetAlive: true,
  distance: 1.5,
  attackRange: 2.2,
  isSwinging: false,
};

describe('shouldStartAutoAttack', () => {
  it('recognizes only a living marked target inside weapon range', () => {
    expect(isMarkedTargetInRange(readyTarget)).toBe(true);
    expect(isMarkedTargetInRange({ ...readyTarget, hasTarget: false })).toBe(false);
    expect(isMarkedTargetInRange({ ...readyTarget, targetAlive: false })).toBe(false);
    expect(isMarkedTargetInRange({ ...readyTarget, distance: 2.21, attackRange: 2.2 })).toBe(false);
  });

  it('authorizes only an enabled automatic basic attack against a living marked target in range', () => {
    expect(shouldStartAutoAttack({ ...readyTarget, automaticAttackEnabled: true })).toBe(true);
    expect(shouldStartAutoAttack(readyTarget)).toBe(false);
  });

  it('does not restart an attack while a swing is active', () => {
    expect(shouldStartAutoAttack({ ...readyTarget, isSwinging: true })).toBe(false);
  });

  it('uses the enemy surface distance for the focused target range check', () => {
    const distance = getMarkedTargetSurfaceDistance(5.6, 1);
    expect(distance).toBeCloseTo(5);
    expect(isMarkedTargetInRange({ ...readyTarget, distance, attackRange: 5 })).toBe(true);
  });

  it('routes an explicit ATK command to the living focused target only while in range', () => {
    const target = { id: 'mini-1' };
    expect(resolveManualAttackTarget(target, readyTarget)).toBe(target);
    expect(resolveManualAttackTarget(target, { ...readyTarget, targetAlive: false })).toBeNull();
    expect(resolveManualAttackTarget(target, { ...readyTarget, distance: 5.01, attackRange: 5 })).toBeNull();
    expect(resolveManualAttackTarget(null, readyTarget)).toBeNull();
  });
});
