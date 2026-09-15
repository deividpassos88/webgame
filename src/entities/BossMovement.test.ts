import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Enemy } from './Enemy';

function stationaryBoss(): Enemy {
  return new Enemy({
    position: new THREE.Vector3(),
    isBoss: true,
    speed: 0.8,
    attackRange: 1,
    detectionRange: 45,
  });
}

describe('Boss movement leash', () => {
  it('walks slowly toward a distant player and stops exactly fifteen meters away', () => {
    const boss = stationaryBoss();
    const player = new THREE.Vector3(0, 0, 40);
    boss.setBossMovementLocked(false);

    for (let second = 0; second < 20; second++) {
      boss.update(1, player, () => undefined);
    }

    expect(boss.root.position.z).toBeCloseTo(16, 5);
    expect(boss.root.position.distanceTo(player)).toBeCloseTo(24, 5);
    for (let second = 0; second < 20; second++) {
      boss.update(1, player, () => undefined);
    }
    expect(boss.root.position.z).toBeCloseTo(25, 5);
    expect(boss.root.position.distanceTo(player)).toBeCloseTo(15, 5);
  });

  it('does not move while a ground skill is being cast', () => {
    const boss = stationaryBoss();
    boss.setBossMovementLocked(true);

    boss.update(2, new THREE.Vector3(0, 0, 15), () => undefined);

    expect(boss.root.position.toArray()).toEqual([0, 0, 0]);
  });

  it('does not follow a player who is already within fifteen meters', () => {
    const boss = stationaryBoss();
    boss.setBossMovementLocked(false);

    boss.update(2, new THREE.Vector3(0, 0, 14.9), () => undefined);

    expect(boss.root.position.toArray()).toEqual([0, 0, 0]);
  });
});
