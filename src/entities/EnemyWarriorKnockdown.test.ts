import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Enemy } from './Enemy';

describe('Warrior jump knockdown', () => {
  it('holds every nearby monster down for 1.2 seconds and then restores movement', () => {
    const enemy = new Enemy({
      position: new THREE.Vector3(),
      hp: 100,
      speed: 4,
      detectionRange: 20,
    });

    enemy.applyWarriorKnockdown(1.2);
    enemy.update(0.8, new THREE.Vector3(6, 0, 0), () => undefined);
    expect(enemy.isWarriorKnockedDown).toBe(true);
    expect(enemy.root.position.x).toBeCloseTo(0);
    expect(enemy.elementalSpeedMultiplier).toBe(0);

    enemy.update(0.5, new THREE.Vector3(6, 0, 0), () => undefined);
    expect(enemy.isWarriorKnockedDown).toBe(false);
    expect(enemy.elementalSpeedMultiplier).toBe(1);
    expect(enemy.root.position.x).toBeGreaterThan(0);
  });

  it('does not add another knockback displacement while already down', () => {
    const enemy = new Enemy({ position: new THREE.Vector3(), hp: 100 });
    enemy.applyWarriorKnockdown(1.2);
    enemy.receivePlayerHit(5, new THREE.Vector3(-4, 0, 0));
    expect(enemy.root.position.x).toBeCloseTo(0);
  });
});
