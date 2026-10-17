import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MageWardVFX } from './MageWardVFX';

describe('Mage Ward 4 m / 3 s', () => {
  it('starts instantly on Mage cast, follows the character and expires in 3 s', () => {
    const ward = new MageWardVFX();
    try {
      ward.activate(new THREE.Vector3(1, 0, 2));
      expect(ward.active).toBe(true);
      expect(ward.group.visible).toBe(true);
      expect(ward.timeRemaining).toBe(3);
      const player = new THREE.Vector3(5, 0, -1);
      ward.update(2.4, player);
      expect(ward.group.position.x).toBe(5);
      expect(ward.group.position.z).toBe(-1);
      expect(ward.timeRemaining).toBeCloseTo(0.6, 5);
      // A second cast refreshes the timer without spawning an extra mesh.
      ward.activate(player);
      expect(ward.group.children).toHaveLength(2);
      ward.update(2.99, player);
      expect(ward.active).toBe(true);
      ward.update(0.02, player);
      expect(ward.active).toBe(false);
      expect(ward.group.visible).toBe(false);
    } finally {
      ward.dispose();
    }
  });
});
