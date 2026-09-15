import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Enemy } from './Enemy';

describe('Enemy elemental status integration', () => {
  it('applies fire damage for exactly three seconds and refreshes without stacking', () => {
    const enemy = new Enemy({ position: new THREE.Vector3(), hp: 100, speed: 0 });
    enemy.applyElementalHit('fire', 2);
    enemy.update(1, new THREE.Vector3(100, 0, 0), () => undefined);
    expect(enemy.hp).toBe(98);
    enemy.applyElementalHit('fire', 2);
    enemy.update(3, new THREE.Vector3(100, 0, 0), () => undefined);
    expect(enemy.hp).toBe(92);
    enemy.update(1, new THREE.Vector3(100, 0, 0), () => undefined);
    expect(enemy.hp).toBe(92);
  });

  it('slows an iced enemy by twenty percent for the status duration', () => {
    const enemy = new Enemy({ position: new THREE.Vector3(), hp: 100, speed: 4 });
    enemy.applyElementalHit('ice', 1);
    expect(enemy.elementalSpeedMultiplier).toBe(0.8);
    enemy.update(3, new THREE.Vector3(100, 0, 0), () => undefined);
    expect(enemy.elementalSpeedMultiplier).toBe(1);
  });

  it('reports whole elemental ticks while preserving accumulated damage', () => {
    const enemy = new Enemy({ position: new THREE.Vector3(), hp: 100, speed: 0 });
    const reported: number[] = [];
    enemy.applyElementalHit('fire', 3);
    enemy.update(0.5, new THREE.Vector3(100, 0, 0), () => undefined, undefined, (damage) => {
      reported.push(damage);
    });
    enemy.update(0.5, new THREE.Vector3(100, 0, 0), () => undefined, undefined, (damage) => {
      reported.push(damage);
    });

    expect(reported).toEqual([1, 2]);
    expect(reported.every(Number.isInteger)).toBe(true);
    expect(enemy.hp).toBe(97);
  });
});
