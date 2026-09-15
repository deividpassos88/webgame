import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BossDashMotion } from './BossDashMotion';

describe('BossDashMotion', () => {
  it('moves quickly to the endpoint and completes only at the end', () => {
    const motion = new BossDashMotion(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
      0.2
    );

    expect(motion.update(0.1)).toMatchObject({ completed: false });
    expect(motion.position.x).toBeCloseTo(5);
    expect(motion.update(0.1)).toMatchObject({ completed: true });
    expect(motion.position.x).toBeCloseTo(10);
  });
});
