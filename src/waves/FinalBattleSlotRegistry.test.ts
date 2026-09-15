import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FinalBattleSlotRegistry } from './FinalBattleSlotRegistry';

describe('FinalBattleSlotRegistry', () => {
  it('retries only the unregistered mini-boss slot after an acknowledged root moves', () => {
    const slots = new FinalBattleSlotRegistry();
    const movedRecognizedRoot = new THREE.Object3D();

    expect(slots.availableMiniBossSlots(42, 4)).toEqual([0, 1, 2, 3]);
    expect(slots.registerMiniBossSlot(42, 0)).toBe(true);
    expect(slots.registerMiniBossSlot(42, 1)).toBe(true);
    expect(slots.registerMiniBossSlot(42, 2)).toBe(true);

    // A root can move during combat; slot ownership must not be inferred from it.
    movedRecognizedRoot.position.set(99, 0, 99);
    expect(movedRecognizedRoot.position.x).toBe(99);
    expect(slots.availableMiniBossSlots(42, 1)).toEqual([3]);
  });

  it('clears slot occupancy on reset and when a new phase begins', () => {
    const slots = new FinalBattleSlotRegistry();
    slots.registerMiniBossSlot(7, 0);

    expect(slots.availableMiniBossSlots(8, 4)).toEqual([0, 1, 2, 3]);
    slots.registerMiniBossSlot(8, 1);
    slots.reset();
    expect(slots.availableMiniBossSlots(8, 4)).toEqual([0, 1, 2, 3]);
  });
});
