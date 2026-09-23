import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Enemy } from './Enemy';

function standardMaterials(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (material instanceof THREE.MeshStandardMaterial) materials.push(material);
    }
  });
  return materials;
}

describe('Mage skill impact on enemies', () => {
  it('freezes a monster for 0.5s and then lets it run again', () => {
    const enemy = new Enemy({ position: new THREE.Vector3(), hp: 100, speed: 4, detectionRange: 20 });
    enemy.applyMageFreeze(0.5);
    enemy.update(0.4, new THREE.Vector3(6, 0, 0), () => undefined);
    expect(enemy.root.position.x).toBeCloseTo(0);
    expect(enemy.elementalSpeedMultiplier).toBe(0);
    expect(enemy.root.getObjectByName('EnemyIceFreezeShell')).toBeUndefined();
    expect(enemy.root.getObjectByName('EnemyIceMist')?.visible).toBe(true);

    enemy.update(0.2, new THREE.Vector3(6, 0, 0), () => undefined);
    expect(enemy.elementalSpeedMultiplier).toBe(1);
    expect(enemy.root.position.x).toBeGreaterThan(0.2);
  });

  it('tints the frozen body blue and wraps it in white mist and smoke', () => {
    const enemy = new Enemy({ position: new THREE.Vector3(), hp: 100, speed: 4, detectionRange: 20 });
    enemy.applyMageFreeze(1);
    enemy.update(0.4, new THREE.Vector3(6, 0, 0), () => undefined);

    const frozen = standardMaterials(enemy.root);
    expect(frozen.length).toBeGreaterThan(0);
    for (const material of frozen) {
      expect(material.emissive.getHex()).toBe(0x2a7fff);
    }
    expect(enemy.root.getObjectByName('EnemyIceMist')?.visible).toBe(true);
    expect(enemy.root.getObjectByName('EnemyIceSmoke')?.visible).toBe(true);

    enemy.update(0.7, new THREE.Vector3(6, 0, 0), () => undefined);
    for (const material of standardMaterials(enemy.root)) {
      expect(material.emissive.getHex()).not.toBe(0x2a7fff);
    }
    expect(enemy.root.getObjectByName('EnemyIceMist')?.visible).toBe(false);
    expect(enemy.root.getObjectByName('EnemyIceSmoke')?.visible).toBe(false);
  });

  it('slows running to half speed for 3s without blocking an attack in range', () => {
    const slowed = new Enemy({ position: new THREE.Vector3(), hp: 100, speed: 4, detectionRange: 20 });
    slowed.applyMageSlow(3);
    expect(slowed.elementalSpeedMultiplier).toBe(0.5);
    slowed.update(1, new THREE.Vector3(6, 0, 0), () => undefined);
    // Half speed: 4 * 0.5 * 1s = 2m toward the player.
    expect(slowed.root.position.x).toBeCloseTo(2);
    expect(slowed.elementalSpeedMultiplier).toBe(0.5);

    slowed.update(2.1, new THREE.Vector3(6, 0, 0), () => undefined);
    expect(slowed.elementalSpeedMultiplier).toBe(1);

    const inRange = new Enemy({ position: new THREE.Vector3(), hp: 100, speed: 4, attackRange: 2 });
    const hits: number[] = [];
    const previousFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = () => 0;
    inRange.applyMageSlow(3);
    inRange.update(0.05, new THREE.Vector3(1, 0, 0), (damage) => hits.push(damage));
    globalThis.requestAnimationFrame = previousFrame;
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
