import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RewardAssetStore, type RewardModelLoader } from './RewardAssetStore';

function asset(name: string): GLTF {
  const scene = new THREE.Group();
  scene.name = name;
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  return {
    scene,
    scenes: [scene],
    animations: [],
    cameras: [],
    asset: {},
  } as unknown as GLTF;
}

describe('RewardAssetStore', () => {
  it('loads chest and the GLB axe while treating the sword as a runtime asset', async () => {
    const requested: string[] = [];
    const loadAsync = vi.fn(async (path: string) => {
      requested.push(path);
      return asset(path);
    });
    const loader: RewardModelLoader = { loadAsync };
    const store = new RewardAssetStore(loader);
    const progress: Array<[number, number]> = [];

    await store.loadAll((completed, total) => progress.push([completed, total]));

    expect(requested).toEqual([
      '/models/chest.glb',
      '/models/axe.glb',
    ]);
    expect(loadAsync).not.toHaveBeenCalledWith('/models/sword.glb');
    expect(progress).toHaveLength(3);
    expect(progress.every(([, total]) => total === 3)).toBe(true);
    expect(progress.map(([completed]) => completed).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(store.hasChest()).toBe(true);
    expect(store.hasWeapon('sword')).toBe(true);
    expect(store.createWeapon('sword').getObjectByName('RuntimeWarrior_SwordBlade')).toBeTruthy();
    expect(store.createWeapon('sword')).not.toBe(store.createWeapon('sword'));
    expect(store.hasWeapon('axe')).toBe(true);
    expect(store.createWeapon('axe')).not.toBe(store.createWeapon('axe'));
  });

  it('keeps successful rewards available when one model fails', async () => {
    const failure = new Error('axe missing');
    const loader: RewardModelLoader = {
      async loadAsync(path) {
        if (path.endsWith('axe.glb')) throw failure;
        return asset(path);
      },
    };
    const store = new RewardAssetStore(loader);
    const progress: Array<[number, number]> = [];

    await store.loadAll((completed, total) => progress.push([completed, total]));

    expect(store.hasChest()).toBe(true);
    expect(store.hasWeapon('sword')).toBe(true);
    expect(store.hasWeapon('axe')).toBe(false);
    expect(store.getWeaponError('axe')).toBe(failure);
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('reports a failed chest as the third logical job while preserving weapon results', async () => {
    const failure = new Error('chest missing');
    const loader: RewardModelLoader = {
      async loadAsync(path) {
        if (path.endsWith('chest.glb')) throw failure;
        return asset(path);
      },
    };
    const store = new RewardAssetStore(loader);
    const progress: Array<[number, number]> = [];

    await store.loadAll((completed, total) => progress.push([completed, total]));

    expect(store.hasChest()).toBe(false);
    expect(store.getChestError()).toBe(failure);
    expect(store.hasWeapon('sword')).toBe(true);
    expect(store.hasWeapon('axe')).toBe(true);
    expect(store.getWeaponError('axe')).toBeUndefined();
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });
});
