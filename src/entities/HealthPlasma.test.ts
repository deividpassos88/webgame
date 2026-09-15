import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HealthPlasma } from './HealthPlasma';

describe('HealthPlasma', () => {
  it('creates a smaller light-blue droplet with a thin tail without a dynamic light', () => {
    const source = new THREE.Vector3(2, 1.2, -3);
    const plasma = new HealthPlasma(source, 5);

    expect(plasma.root.position).toEqual(source);
    expect(plasma.healAmount).toBe(5);
    const head = plasma.root.getObjectByName('health-plasma-head') as THREE.Mesh;
    const tail = plasma.root.getObjectByName('health-plasma-tail') as THREE.Mesh;
    expect(head).toBeInstanceOf(THREE.Mesh);
    expect(head.scale.z).toBeGreaterThan(head.scale.x);
    expect(tail).toBeInstanceOf(THREE.Mesh);
    expect(tail.geometry).toBeInstanceOf(THREE.ConeGeometry);
    expect((head.material as THREE.MeshBasicMaterial).blending).toBe(
      THREE.NormalBlending
    );
    expect((head.material as THREE.MeshBasicMaterial).color.getHex()).toBe(
      0x55d7ff
    );
    expect(plasma.root.getObjectByName('health-plasma-light')).toBeUndefined();
    const bounds = new THREE.Box3().setFromObject(plasma.root);
    expect(bounds.getSize(new THREE.Vector3()).length()).toBeLessThan(0.7);
  });

  it('homes into a moving player and reports arrival only at the body', () => {
    const plasma = new HealthPlasma(new THREE.Vector3(0, 1, 0), 10);
    const playerBody = new THREE.Vector3(4, 1, 0);
    const initialDistance = plasma.root.position.distanceTo(playerBody);

    expect(plasma.update(0.1, playerBody)).toBe(false);
    expect(plasma.root.position.distanceTo(playerBody)).toBeLessThan(initialDistance);

    let arrived = false;
    for (let frame = 0; frame < 120 && !arrived; frame += 1) {
      playerBody.x += 0.002;
      arrived = plasma.update(1 / 60, playerBody);
    }

    expect(arrived).toBe(true);
    expect(plasma.arrived).toBe(true);
  });
});
