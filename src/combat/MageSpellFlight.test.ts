import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { firstColumnHit } from './MageSpellFlight';

describe('Mage spell flight', () => {
  it('stops on the first monster column instead of the one behind it', () => {
    const from = new THREE.Vector3(0, 1.1, 0);
    const to = new THREE.Vector3(0, 1.1, 8);
    const hit = firstColumnHit(from, to, [
      { target: 'far', x: 0, z: 6, minY: 0.2, maxY: 1.8, radius: 0.6 },
      { target: 'near', x: 0, z: 3, minY: 0.2, maxY: 1.8, radius: 0.6 },
    ]);

    expect(hit?.target).toBe('near');
    expect(hit?.t).toBeGreaterThan(0);
    expect(hit?.t).toBeLessThan(0.5);
  });

  it('does not hit a monster the bolt has not reached', () => {
    const hit = firstColumnHit(
      new THREE.Vector3(0, 1.1, 0),
      new THREE.Vector3(0, 1.1, 1.2),
      [{ target: 'ahead', x: 0, z: 4, minY: 0.2, maxY: 1.8, radius: 0.5 }]
    );
    expect(hit).toBeNull();
  });
});
