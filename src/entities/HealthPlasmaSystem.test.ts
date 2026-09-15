import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HealthPlasmaSystem } from './HealthPlasmaSystem';

describe('HealthPlasmaSystem', () => {
  it('delivers healing only after the plasma reaches the player', () => {
    const scene = new THREE.Scene();
    const system = new HealthPlasmaSystem(scene);
    const playerBody = new THREE.Vector3(5, 1, 0);
    const received: number[] = [];

    system.spawn(new THREE.Vector3(0, 1, 0), 5);
    expect(system.activeCount).toBe(1);
    expect(scene.getObjectByName('health-plasma')).toBeDefined();

    system.update(0.05, playerBody, (amount) => received.push(amount));
    expect(received).toEqual([]);

    for (let frame = 0; frame < 180 && system.activeCount > 0; frame += 1) {
      system.update(1 / 60, playerBody, (amount) => received.push(amount));
    }

    expect(received).toEqual([5]);
    expect(system.activeCount).toBe(0);
    expect(scene.getObjectByName('health-plasma')).toBeUndefined();
  });

  it('clears every plasma without delivering healing', () => {
    const scene = new THREE.Scene();
    const system = new HealthPlasmaSystem(scene);
    system.spawn(new THREE.Vector3(), 5);
    system.spawn(new THREE.Vector3(1, 0, 0), 10);

    system.clear();

    expect(system.activeCount).toBe(0);
    expect(scene.children).toEqual([]);
  });

  it('reuses the same GPU geometry and material for simultaneous plasma drops', () => {
    const scene = new THREE.Scene();
    const system = new HealthPlasmaSystem(scene);
    system.spawn(new THREE.Vector3(), 5);
    system.spawn(new THREE.Vector3(1, 0, 0), 10);

    const heads = scene.children.map((root) => root.getObjectByName('health-plasma-head') as THREE.Mesh);
    expect(heads[0].geometry).toBe(heads[1].geometry);
    expect(heads[0].material).toBe(heads[1].material);
  });
});
