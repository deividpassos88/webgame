import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { firstColumnHit } from './MageSpellFlight';

describe('Mage spell flight', () => {
  it('hits the highest body first when water descends vertically from above', () => {
    const hit = firstColumnHit(new THREE.Vector3(1, 8.5, 7), new THREE.Vector3(1, 0, 7), [
      { target: 'ground', x: 1, z: 7, minY: 0, maxY: 1.8, radius: 0.6 },
      { target: 'raised', x: 1, z: 7, minY: 2, maxY: 3.8, radius: 0.6 },
    ]);
    expect(hit?.target).toBe('raised');
    expect(hit?.t).toBeCloseTo((8.5 - 4.15) / 8.5);
  });

  it('ignores an offset body and a vertical segment that ends before reaching the body', () => {
    const body = { target: 'enemy', x: 0, z: 7, minY: 0, maxY: 1.8, radius: 0.6 };
    expect(firstColumnHit(new THREE.Vector3(2, 8.5, 7), new THREE.Vector3(2, 0, 7), [body])).toBeNull();
    expect(firstColumnHit(new THREE.Vector3(0, 8.5, 7), new THREE.Vector3(0, 4, 7), [body])).toBeNull();
    expect(firstColumnHit(new THREE.Vector3(0, 8.5, 7), new THREE.Vector3(0, 9, 7), [body])).toBeNull();
  });

  it('keeps start-inside and stationary-segment collision behavior', () => {
    const body = { target: 'enemy', x: 0, z: 7, minY: 0, maxY: 1.8, radius: 0.6 };
    const inside = new THREE.Vector3(0, 1, 7);
    expect(firstColumnHit(inside, inside, [body])).toEqual({ target: 'enemy', t: 0 });
    const above = new THREE.Vector3(0, 8, 7);
    expect(firstColumnHit(above, above, [body])).toBeNull();
  });

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
