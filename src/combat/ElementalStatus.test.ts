import { describe, expect, it } from 'vitest';
import {
  applyElementalStatus,
  getElementalSlowMultiplier,
  tickElementalStatus,
  type ElementalStatusState,
} from './ElementalStatus';

describe('ElementalStatus', () => {
  it('creates a fire status for exactly three seconds with no slow', () => {
    const status = applyElementalStatus(null, 'fire', 4);

    expect(status).toEqual({
      element: 'fire',
      remainingSeconds: 3,
      damagePerSecond: 4,
      pendingDamage: 0,
    });
    expect(getElementalSlowMultiplier(status)).toBe(1);
  });

  it('ticks damage for elapsed time and expires after the three-second window', () => {
    const status = applyElementalStatus(null, 'fire', 4);

    const firstTick = tickElementalStatus(status, 1);
    expect(firstTick.damage).toBeCloseTo(4);
    expect(firstTick.status).toMatchObject({ element: 'fire', remainingSeconds: 2 });

    const finalTick = tickElementalStatus(firstTick.status, 2);
    expect(finalTick.damage).toBeCloseTo(8);
    expect(finalTick.status).toBeNull();
  });

  it('refreshes the same element without stacking another damage source', () => {
    const status = applyElementalStatus(null, 'fire', 4);
    const partlyElapsed = tickElementalStatus(status, 2).status as ElementalStatusState;
    const refreshed = applyElementalStatus(partlyElapsed, 'fire', 4);

    expect(refreshed.remainingSeconds).toBe(3);
    expect(refreshed.damagePerSecond).toBe(4);
    expect(tickElementalStatus(refreshed, 3).damage).toBeCloseTo(12);
  });

  it('replaces a different element and freezes movement with the approved ice lock', () => {
    const fire = applyElementalStatus(null, 'fire', 4);
    const ice = applyElementalStatus(fire, 'ice', 5);

    expect(ice).toEqual({
      element: 'ice',
      remainingSeconds: 3,
      damagePerSecond: 5,
      pendingDamage: 0,
    });
    expect(getElementalSlowMultiplier(ice)).toBe(0);
  });

  it('does not advance or deal damage for invalid or non-positive elapsed time', () => {
    const status = applyElementalStatus(null, 'ice', 5);
    expect(tickElementalStatus(status, 0)).toEqual({ damage: 0, status });
    expect(tickElementalStatus(status, -1)).toEqual({ damage: 0, status });
    expect(tickElementalStatus(status, Number.NaN)).toEqual({ damage: 0, status });
  });

  it('clamps invalid damage-per-second values instead of producing NaN damage', () => {
    const status = applyElementalStatus(null, 'fire', Number.NaN);
    expect(status.damagePerSecond).toBe(0);
    expect(tickElementalStatus(status, 3).damage).toBe(0);
  });

  it('accumulates sub-point frame damage and only emits whole-number ticks', () => {
    let status: ElementalStatusState | null = applyElementalStatus(null, 'fire', 2.28);
    const emitted: number[] = [];
    for (let frame = 0; frame < 30 && status; frame += 1) {
      const tick = tickElementalStatus(status, 0.1);
      status = tick.status;
      emitted.push(tick.damage);
    }

    expect(emitted.every(Number.isInteger)).toBe(true);
    expect(emitted.reduce((total, damage) => total + damage, 0)).toBe(7);
    expect(status).toBeNull();
  });
});
