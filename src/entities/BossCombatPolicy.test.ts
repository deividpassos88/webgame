import { describe, expect, it } from 'vitest';
import { bossMeleeRange, decideBossCombatMode } from './BossCombatPolicy';

describe('Boss combat policy', () => {
  it('keeps the claw range exactly one meter below the player range', () => {
    expect(bossMeleeRange(2.2)).toBeCloseTo(1.2, 5);
    expect(bossMeleeRange(1.5)).toBeCloseTo(0.5, 5);
  });

  it('walks only beyond fifteen meters and uses ranged skills inside that leash', () => {
    expect(decideBossCombatMode(15.01, 2.2, false)).toBe('follow');
    expect(decideBossCombatMode(15, 2.2, false)).toBe('ranged');
    expect(decideBossCombatMode(5, 2.2, false)).toBe('ranged');
  });

  it('uses claws in melee and lets a started cast finish without moving', () => {
    expect(decideBossCombatMode(1.2, 2.2, false)).toBe('melee');
    expect(decideBossCombatMode(0.5, 2.2, true)).toBe('casting');
    expect(decideBossCombatMode(15, 2.2, true)).toBe('casting');
  });
});
