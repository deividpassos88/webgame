import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RewardChest } from './RewardChest';

function chestModel() {
  const root = new THREE.Group();
  root.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0x654321 })
    )
  );
  return root;
}

describe('RewardChest', () => {
  it('marks the raycast root and rests the static model on the ground', () => {
    const chest = new RewardChest(chestModel());

    expect(chest.root.userData.isRewardChestRoot).toBe(true);
    expect(chest.root.name).toBe('initial-equipment-chest');
    const bounds = new THREE.Box3().setFromObject(chest.root);
    expect(bounds.min.y).toBeCloseTo(0, 5);
    expect(bounds.getSize(new THREE.Vector3()).y).toBeCloseTo(1.3, 5);
    expect(chest.collisionRadius).toBeCloseTo(0.65, 5);
    let pointLightCount = 0;
    chest.root.traverse((object) => {
      if (object instanceof THREE.PointLight) pointLightCount++;
    });
    expect(pointLightCount).toBe(0);
  });

  it('opens once with a procedural lift and golden glow', () => {
    const model = chestModel();
    const chest = new RewardChest(model);
    const material = (model.children[0] as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    const beforeOpening = material.emissiveIntensity;

    expect(chest.beginOpening()).toBe(true);
    expect(chest.beginOpening()).toBe(false);
    chest.update(0.4);
    expect(chest.root.scale.y).toBeGreaterThan(1);
    expect(chest.glowIntensity).toBeGreaterThan(0);
    expect(material.emissiveIntensity).toBeGreaterThan(beforeOpening);
    chest.update(0.4);
    expect(chest.openingComplete).toBe(true);
  });

  it('completes opening exactly at 0.7 seconds', () => {
    const chest = new RewardChest(chestModel());

    chest.beginOpening();
    chest.update(0.7 - 0.000001);
    expect(chest.openingComplete).toBe(false);
    expect(chest.root.scale.y).toBeGreaterThan(1);

    chest.update(0.000001);
    expect(chest.openingComplete).toBe(true);
    expect(chest.root.scale.x).toBeCloseTo(1, 6);
    expect(chest.root.scale.y).toBeCloseTo(1, 6);
  });

  it('fades and becomes removable after the reward is claimed', () => {
    const chest = new RewardChest(chestModel());
    chest.beginOpening();
    chest.update(0.8);

    chest.claim();
    chest.update(0.5);

    expect(chest.removable).toBe(true);
  });

  it('completes collapse exactly at 0.45 seconds with hidden materials', () => {
    const model = chestModel();
    const chest = new RewardChest(model);
    const mesh = model.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.Material & { opacity: number };

    chest.beginOpening();
    chest.update(0.7);
    chest.claim();
    chest.update(0.45 - 0.000001);

    expect(chest.removable).toBe(false);
    expect(chest.root.scale.x).toBeGreaterThanOrEqual(0.01);
    expect(material.opacity).toBeGreaterThan(0);

    chest.update(0.000001);

    expect(chest.removable).toBe(true);
    expect(chest.root.scale.x).toBeCloseTo(0.01, 6);
    expect(material.opacity).toBe(0);
  });
});
