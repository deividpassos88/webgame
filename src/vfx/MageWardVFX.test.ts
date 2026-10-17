import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MageWardVFX } from './MageWardVFX';

describe('Mage skill-4 invisible collision ward (4 m / 3 s)', () => {
  it('keeps protection active without rendering, follows the Mage and expires in 3 s', () => {
    const ward = new MageWardVFX();
    try {
      ward.activate(new THREE.Vector3(1, 0, 2));
      expect(ward.active).toBe(true);
      expect(ward.group.visible).toBe(false);
      expect(ward.group.children).toHaveLength(0);
      expect(ward.timeRemaining).toBe(3);
      const player = new THREE.Vector3(5, 0, -1);
      ward.update(2.4, player);
      expect(ward.group.position.x).toBe(5);
      expect(ward.group.position.z).toBe(-1);
      expect(ward.timeRemaining).toBeCloseTo(0.6, 5);
      // A repeated skill-4 cast renews the timer without ever creating geometry.
      ward.activate(player);
      expect(ward.group.children).toHaveLength(0);
      expect(ward.group.visible).toBe(false);
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
