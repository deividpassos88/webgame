import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Enemy } from './Enemy';

describe('regular enemy combat distance', () => {
  it('closes into short range before beginning a normal attack', () => {
    const enemy = new Enemy({
      position: new THREE.Vector3(0, 0, 0),
      detectionRange: 8,
      attackRange: 4,
      speed: 4,
    });
    const player = new THREE.Vector3(2, 0, 0);
    const hits: number[] = [];

    enemy.update(0.1, player, (damage) => hits.push(damage));

    expect(enemy.root.position.distanceTo(player)).toBeLessThan(2);
    expect(hits).toEqual([]);
  });

  it('lets an archer fire from long range and increases only its close-range damage', () => {
    const longRangeArcher = new Enemy({
      position: new THREE.Vector3(),
      damage: 7,
      detectionRange: 18,
      attackRange: 10.5,
      attackMode: 'ranged',
    });
    const closeRangeArcher = new Enemy({
      position: new THREE.Vector3(),
      damage: 7,
      detectionRange: 18,
      attackRange: 10.5,
      attackMode: 'ranged',
    });
    const longShots: number[] = [];
    const closeShots: number[] = [];

    longRangeArcher.update(0.1, new THREE.Vector3(9, 0, 0), () => undefined, undefined, undefined, (attack) => {
      longShots.push(attack.damage);
    });
    closeRangeArcher.update(0.1, new THREE.Vector3(2, 0, 0), () => undefined, undefined, undefined, (attack) => {
      closeShots.push(attack.damage);
    });

    expect(longRangeArcher.root.position.x).toBeCloseTo(0, 5);
    expect(longShots).toEqual([7]);
    expect(closeShots[0]).toBeGreaterThan(longShots[0]);
    expect(closeShots[0]).toBeLessThan(11);
  });
});
