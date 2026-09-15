import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ArcherProjectileSystem } from './ArcherProjectileSystem';

describe('ArcherProjectileSystem', () => {
  it('keeps an arrow visible until it reaches the player, then reports its damage once', () => {
    const scene = new THREE.Scene();
    const projectiles = new ArcherProjectileSystem(scene);
    const hits: number[] = [];

    projectiles.fire({
      origin: new THREE.Vector3(0, 1, 0),
      target: new THREE.Vector3(6, 1, 0),
      damage: 8,
      distance: 6,
    });
    projectiles.update(0.1, (hit) => hits.push(hit.damage));

    expect(projectiles.count).toBe(1);
    expect(hits).toEqual([]);
    projectiles.update(1, (hit) => hits.push(hit.damage));

    expect(projectiles.count).toBe(0);
    expect(hits).toEqual([8]);
    expect(scene.children).toHaveLength(0);
  });
});
