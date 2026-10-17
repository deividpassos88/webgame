import { describe, expect, it } from 'vitest';
import {
  MAGE_WARD_DURATION_SECONDS,
  MAGE_WARD_RADIUS_METERS,
  projectOutsideMageWard,
} from './MageWardBarrier';

describe('Mage ward enemy collision', () => {
  it('keeps collision capsules outside exactly four metres plus enemy radius', () => {
    expect(MAGE_WARD_RADIUS_METERS).toBe(4);
    expect(MAGE_WARD_DURATION_SECONDS).toBe(3);
    const projected = projectOutsideMageWard(1, -2, 2.2, -2, 0.5);
    expect(projected?.x).toBeCloseTo(5.5, 6);
    expect(projected?.z).toBeCloseTo(-2, 6);
    expect(projectOutsideMageWard(1, -2, 5.5, -2, 0.5)).toBeNull();
  });
  it('projects interior enemies outward in 2D and handles the centre consistently', () => {
    expect(projectOutsideMageWard(0, 0, 0, 0, 0.4)).toEqual({ x: 4.4, z: 0 });
    const result = projectOutsideMageWard(2, 2, 0, 0, 1.0)!;
    expect(Math.hypot(result.x - 2, result.z - 2)).toBeCloseTo(5, 6);
    expect(projectOutsideMageWard(2, 2, 9, 2, 0.4)).toBeNull();
  });
});
