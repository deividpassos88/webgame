import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BossAssetStore } from './BossAssetStore';

const CLIPS = [
  'idle',
  'walking',
  'running',
  'attack_meteors',
  'attack_dash',
  'death',
  'jump_circle',
  'jump_rectangle',
];

function bossAsset(): GLTF {
  const scene = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = 'mixamorig:Hips';
  const geometry = new THREE.BoxGeometry();
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let index = 0; index < count; index++) weights[index * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  scene.add(mesh);
  return {
    scene,
    scenes: [scene],
    animations: CLIPS.map((name) => new THREE.AnimationClip(name, 1, [])),
    cameras: [],
    asset: {},
  } as unknown as GLTF;
}

describe('BossAssetStore', () => {
  it('loads Boss.glb and creates independent skinned instances and clips', async () => {
    const requested: string[] = [];
    const store = new BossAssetStore({
      async loadAsync(path) {
        requested.push(path);
        return bossAsset();
      },
    });

    await store.load();
    const first = store.createBossVisual();
    const second = store.createBossVisual();

    expect(requested).toEqual(['/models/Boss/Boss.glb?v=20260828-walking']);
    expect(store.hasBoss()).toBe(true);
    expect(first.model).not.toBe(second.model);
    expect(first.animations.map(({ name }) => name)).toEqual(CLIPS);
    expect(first.animations[0]).not.toBe(second.animations[0]);
  });

  it('retains the load error and keeps procedural fallback available', async () => {
    const failure = new Error('boss missing');
    const store = new BossAssetStore({
      async loadAsync() {
        throw failure;
      },
    });

    await store.load();

    expect(store.hasBoss()).toBe(false);
    expect(store.getError()).toBe(failure);
    expect(() => store.createBossVisual()).toThrow('Modelo do boss não carregado.');
  });
});
