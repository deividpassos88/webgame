import { describe, expect, it } from 'vitest';
import { planSurroundFormation } from './SurroundFormation';

describe('planSurroundFormation', () => {
  it('fills every direction around the player before creating an outer ring', () => {
    const slots = planSurroundFormation(12, 1.15, 1);
    const inner = slots.filter((slot) => slot.ring === 0);

    expect(inner.length).toBeGreaterThanOrEqual(7);
    expect(inner.some((slot) => Math.cos(slot.angle) > 0.9)).toBe(true);
    expect(inner.some((slot) => Math.cos(slot.angle) < -0.9)).toBe(true);
    expect(inner.some((slot) => Math.sin(slot.angle) > 0.9)).toBe(true);
    expect(inner.some((slot) => Math.sin(slot.angle) < -0.9)).toBe(true);
    expect(slots.some((slot) => slot.ring === 1)).toBe(true);
  });

  it('keeps neighboring slots at least the requested spacing apart', () => {
    const slots = planSurroundFormation(25, 1.15, 1);

    for (let first = 0; first < slots.length; first++) {
      for (let second = first + 1; second < slots.length; second++) {
        const a = slots[first];
        const b = slots[second];
        const distance = Math.hypot(
          Math.cos(a.angle) * a.radius - Math.cos(b.angle) * b.radius,
          Math.sin(a.angle) * a.radius - Math.sin(b.angle) * b.radius
        );
        expect(distance).toBeGreaterThanOrEqual(1 - 1e-6);
      }
    }
  });

  it('reserves enough space when one enemy has a much larger collision radius', () => {
    const radii = [0.28, 1, 0.28, 0.28];
    const gap = 0.12;
    const slots = planSurroundFormation(radii, 1.15, gap);

    expect(slots).toHaveLength(radii.length);
    for (let first = 0; first < slots.length; first++) {
      for (let second = first + 1; second < slots.length; second++) {
        const a = slots[first];
        const b = slots[second];
        const distance = Math.hypot(
          Math.cos(a.angle) * a.radius - Math.cos(b.angle) * b.radius,
          Math.sin(a.angle) * a.radius - Math.sin(b.angle) * b.radius
        );
        expect(distance).toBeGreaterThanOrEqual(
          radii[first] + radii[second] + gap - 1e-6
        );
      }
    }
  });
});
