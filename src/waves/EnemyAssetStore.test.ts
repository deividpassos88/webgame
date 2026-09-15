import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

function monsterAsset(): GLTF {
  const scene = new THREE.Group();
  scene.name = 'monster-source';
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  const vertexCount = geometry.getAttribute('position').count;
  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index++) skinWeights[index * 4] = 1;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  const material = new THREE.MeshStandardMaterial({ color: 0x477ca8 });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'monster-skin';
  const hips = new THREE.Bone();
  hips.name = 'Hips';
  const spine = new THREE.Bone();
  spine.name = 'Spine';
  spine.position.y = 1;
  hips.add(spine);
  mesh.add(hips);
  mesh.bind(new THREE.Skeleton([hips, spine]));
  scene.add(mesh);
  return {
    scene,
    scenes: [scene],
    animations: [new THREE.AnimationClip('Running', 1, [])],
    cameras: [],
    asset: {},
  } as unknown as GLTF;
}

function skinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh {
  let result: THREE.SkinnedMesh | null = null;
  root.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh) result = mesh;
  });
  if (!result) throw new Error('Expected a skinned monster mesh.');
  return result;
}

describe('EnemyAssetStore', () => {
  it('loads every phase-one monster model and clones their visuals', async () => {
    const modulePath = './EnemyAssetStore';
    const { EnemyAssetStore } = await import(/* @vite-ignore */ modulePath);
    const requested: string[] = [];
    const store = new EnemyAssetStore({
      async loadAsync(path: string) {
        requested.push(path);
        return monsterAsset();
      },
    });

    await store.load();
    const first = store.createRegularEnemyVisual();
    const second = store.createRegularEnemyVisual();
    const archer = store.createArcherEnemyVisual();
    const guardian = store.createGuardianEnemyVisual();

    expect(requested).toEqual([
      '/models/Monstros/fase%201-1/monstro_normal.glb',
      '/models/Monstros/fase%201-1/monster_arch.glb',
      '/models/Monstros/fase%201-1/monstro_guardiao.glb',
    ]);
    expect(store.hasRegularEnemy()).toBe(true);
    expect(store.hasArcherEnemy()).toBe(true);
    expect(store.hasGuardianEnemy()).toBe(true);
    expect(first.model).not.toBe(second.model);
    const firstMesh = skinnedMesh(first.model);
    const secondMesh = skinnedMesh(second.model);
    expect(firstMesh).not.toBe(secondMesh);
    expect(firstMesh.skeleton).not.toBe(secondMesh.skeleton);
    expect(firstMesh.skeleton.bones[0]).not.toBe(secondMesh.skeleton.bones[0]);
    expect(firstMesh.material).toBe(secondMesh.material);
    expect((firstMesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x477ca8);
    firstMesh.skeleton.bones[0].position.x = 7;
    expect(secondMesh.skeleton.bones[0].position.x).toBe(0);
    expect(first.animations[0]).not.toBe(second.animations[0]);
    expect(first.animations.map((clip: THREE.AnimationClip) => clip.name)).toEqual(['Running']);
    expect(archer.model).not.toBe(first.model);
    expect(guardian.model).not.toBe(first.model);
  });

  it('records a loading failure so the procedural fallback remains available', async () => {
    const modulePath = './EnemyAssetStore';
    const { EnemyAssetStore } = await import(/* @vite-ignore */ modulePath);
    const failure = new Error('monster missing');
    const store = new EnemyAssetStore({
      async loadAsync() {
        throw failure;
      },
    });

    await store.load();

    expect(store.hasRegularEnemy()).toBe(false);
    expect(store.getError()).toBe(failure);
    expect(() => store.createRegularEnemyVisual()).toThrow('Modelo do monstro normal não carregado.');
  });
});
