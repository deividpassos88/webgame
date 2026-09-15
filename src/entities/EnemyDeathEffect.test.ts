import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Enemy } from './Enemy';

function meshMaterials(root: THREE.Object3D): THREE.Material[] {
  const materials: THREE.Material[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    materials.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
  });
  return materials;
}

function meshGeometries(root: THREE.Object3D): THREE.BufferGeometry[] {
  const geometries = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) geometries.add(mesh.geometry);
  });
  return [...geometries];
}

describe('Enemy death effect', () => {
  it('burns in place into rising particles instead of shrinking away', () => {
    const enemy = new Enemy({ position: new THREE.Vector3(3, 0, -2), hp: 1 });
    const originalPosition = enemy.root.position.clone();

    enemy.takeDamage(1);
    enemy.update(0.35, new THREE.Vector3(), () => undefined);

    expect(enemy.deathEffectStage).toBe('burn');
    expect(enemy.root.position.x).toBe(originalPosition.x);
    expect(enemy.root.position.z).toBe(originalPosition.z);
    expect(enemy.root.position.y).toBe(originalPosition.y);
    expect(enemy.root.scale).toEqual(new THREE.Vector3(1, 1, 1));
    const particles = enemy.root.children.find((child) => child instanceof THREE.Points);
    expect(particles).toBeInstanceOf(THREE.Points);
    expect((particles as THREE.Points).geometry.getAttribute('position').count).toBeGreaterThan(30);
    expect(enemy.markedForRemoval).toBe(false);

    enemy.update(0.4, new THREE.Vector3(), () => undefined);
    expect(enemy.deathEffectStage).toBe('ash');
    expect(enemy.root.scale).toEqual(new THREE.Vector3(1, 1, 1));
    expect(meshMaterials(enemy.root).some((material) => material.opacity < 1)).toBe(true);
    enemy.update(0.5, new THREE.Vector3(), () => undefined);
    expect(enemy.deathEffectStage).toBe('complete');
    expect(enemy.markedForRemoval).toBe(true);
  });

  it('uses emissive burn without adding a dynamic light for every simultaneous death', () => {
    const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0x7799bb });
    const model = new THREE.Group();
    model.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial));
    const enemy = new Enemy(
      { position: new THREE.Vector3(1, 0, 2), hp: 1 },
      { model, animations: [] }
    );
    const material = meshMaterials(enemy.root)[0];
    const parent = new THREE.Group();
    let disposeEvents = 0;
    material.addEventListener('dispose', () => disposeEvents++);
    parent.add(enemy.root);

    expect(enemy.root.children.some((child) => child instanceof THREE.PointLight)).toBe(false);
    expect(material).not.toBe(sourceMaterial);

    enemy.takeDamage(1);
    enemy.update(0.35, new THREE.Vector3(), () => undefined);

    expect(enemy.root.children.some((child) => child instanceof THREE.PointLight)).toBe(false);
    expect(() => enemy.dispose()).not.toThrow();
    expect(disposeEvents).toBe(1);
    expect(enemy.root.parent).toBeNull();
  });

  it('leaves boss illumination to the stable game lighting rig', () => {
    const boss = new Enemy({ position: new THREE.Vector3(), isBoss: true });
    let pointLightCount = 0;
    boss.root.traverse((object) => {
      if (object instanceof THREE.PointLight) pointLightCount++;
    });

    expect(pointLightCount).toBe(0);
  });

  it('disposes all procedural resources while leaving shared GLB resources intact', () => {
    const procedural = new Enemy({
      position: new THREE.Vector3(),
      isBoss: true,
      dropOnDeath: 'heal',
    });
    const proceduralGeometries = meshGeometries(procedural.root);
    const proceduralMaterials = [...new Set(meshMaterials(procedural.root))];
    let disposedProceduralGeometries = 0;
    let disposedProceduralMaterials = 0;
    proceduralGeometries.forEach((geometry) => {
      geometry.addEventListener('dispose', () => disposedProceduralGeometries++);
    });
    proceduralMaterials.forEach((material) => {
      material.addEventListener('dispose', () => disposedProceduralMaterials++);
    });

    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
    const sharedMaterial = new THREE.MeshStandardMaterial({ color: 0x7799bb });
    const model = new THREE.Group();
    model.add(new THREE.Mesh(sharedGeometry, sharedMaterial));
    const glbEnemy = new Enemy(
      { position: new THREE.Vector3() },
      { model, animations: [] }
    );
    let disposedSharedGeometry = 0;
    let disposedSharedMaterial = 0;
    sharedGeometry.addEventListener('dispose', () => disposedSharedGeometry++);
    sharedMaterial.addEventListener('dispose', () => disposedSharedMaterial++);

    procedural.dispose();
    glbEnemy.dispose();

    expect(disposedProceduralGeometries).toBe(proceduralGeometries.length);
    expect(disposedProceduralMaterials).toBe(proceduralMaterials.length);
    expect(disposedSharedGeometry).toBe(0);
    expect(disposedSharedMaterial).toBe(0);
  });

  it('disposes the unique GPU bone texture owned by an animated enemy exactly once', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const vertexCount = geometry.getAttribute('position').count;
    geometry.setAttribute(
      'skinIndex',
      new THREE.Uint16BufferAttribute(new Uint16Array(vertexCount * 4), 4)
    );
    const skinWeights = new Float32Array(vertexCount * 4);
    for (let index = 0; index < vertexCount; index++) skinWeights[index * 4] = 1;
    geometry.setAttribute(
      'skinWeight',
      new THREE.Float32BufferAttribute(skinWeights, 4)
    );
    const material = new THREE.MeshStandardMaterial();
    const rootBone = new THREE.Bone();
    const skeleton = new THREE.Skeleton([rootBone]);
    skeleton.computeBoneTexture();
    const boneTexture = skeleton.boneTexture!;
    const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
    skinnedMesh.add(rootBone);
    skinnedMesh.bind(skeleton);
    const model = new THREE.Group();
    model.add(skinnedMesh);
    const enemy = new Enemy(
      { position: new THREE.Vector3() },
      { model, animations: [] }
    );
    let boneTextureDisposeEvents = 0;
    boneTexture.addEventListener('dispose', () => boneTextureDisposeEvents++);

    enemy.dispose();
    enemy.dispose();

    expect(boneTextureDisposeEvents).toBe(1);
    expect(skeleton.boneTexture).toBeNull();
  });
});
