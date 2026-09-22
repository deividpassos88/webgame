import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Enemy } from './Enemy';

describe('Mage skill impact on enemies', () => {
  it('freezes a monster for 0.5s and then lets it run again', () => {
    const enemy = new Enemy({ position: new THREE.Vector3(), hp: 100, speed: 4, detectionRange: 20 });
    enemy.applyMageFreeze(0.5);
    enemy.update(0.4, new THREE.Vector3(6, 0, 0), () => undefined);
    expect(enemy.root.position.x).toBeCloseTo(0);
    expect(enemy.elementalSpeedMultiplier).toBe(0);
    expect(enemy.root.getObjectByName('EnemyIceFreezeShell')?.visible).toBe(true);

    enemy.update(0.2, new THREE.Vector3(6, 0, 0), () => undefined);
    expect(enemy.elementalSpeedMultiplier).toBe(1);
    expect(enemy.root.position.x).toBeGreaterThan(0.2);
  });

  it('stops running for 1.5s without blocking an attack already in range', () => {
    const rooted = new Enemy({ position: new THREE.Vector3(), hp: 100, speed: 4, detectionRange: 20 });
    rooted.applyMageRoot(1.5);
    rooted.update(1.4, new THREE.Vector3(6, 0, 0), () => undefined);
    expect(rooted.root.position.x).toBeCloseTo(0);
    expect(rooted.root.getObjectByName('EnemyRunLockRing')?.visible).toBe(true);

    rooted.update(0.2, new THREE.Vector3(6, 0, 0), () => undefined);
    expect(rooted.root.position.x).toBeGreaterThan(0.2);

    const inRange = new Enemy({ position: new THREE.Vector3(), hp: 100, speed: 4, attackRange: 2 });
    const hits: number[] = [];
    const previousFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = () => 0;
    inRange.applyMageRoot(1.5);
    inRange.update(0.05, new THREE.Vector3(1, 0, 0), (damage) => hits.push(damage));
    globalThis.requestAnimationFrame = previousFrame;
    expect(inRange.root.position.x).toBeCloseTo(0);
    expect(hits.length).toBe(1);
  });

  it('lifts every shocked monster into a lying pose and holds them still for 1s', () => {
    const enemy = new Enemy({ position: new THREE.Vector3(1, 0, 0), hp: 100, speed: 4, detectionRange: 20 });
    enemy.applyMageShockLevitate(1);
    enemy.update(0.2, new THREE.Vector3(12, 0, 0), () => undefined);

    expect(enemy.root.position.x).toBeCloseTo(1);
    expect(enemy.root.position.y).toBeGreaterThan(2.4);
    expect(enemy.shockBodyRoll).toBeCloseTo(Math.PI / 2);
    expect(enemy.root.getObjectByName('EnemyShockAura')?.visible).toBe(true);

    enemy.update(0.9, new THREE.Vector3(12, 0, 0), () => undefined);
    expect(enemy.root.position.y).toBeCloseTo(0);
    expect(enemy.root.position.x).toBeGreaterThan(1.2);
    expect(enemy.root.getObjectByName('EnemyShockAura')?.visible).toBe(false);
  });
});
