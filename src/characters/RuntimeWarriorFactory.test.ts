import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getRuntimeWarriorMaterials } from './RuntimeWarriorMaterials';
import { mountRuntimeWarrior } from './RuntimeWarriorFactory';

const REQUIRED_BONE_NAMES = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  'LeftUpperArm',
  'LeftForeArm',
  'LeftHand',
  'RightUpperArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
] as const;

type BoneName = (typeof REQUIRED_BONE_NAMES)[number];

function makeSourceMesh(bones: readonly THREE.Bone[]): THREE.SkinnedMesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-0.1, 0, 0, 0.1, 0, 0, 0, 0.2, 0], 3)
  );
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = 'SourceBody';
  const skeleton = new THREE.Skeleton([...bones]);
  mesh.bind(skeleton, new THREE.Matrix4());
  return mesh;
}

function modelWithCompleteMixamoSkeleton(
  useArmAliases = false,
  useTransformedArmature = false
): THREE.Group {
  const model = new THREE.Group();
  model.name = 'CompleteMixamoModel';
  const bones = REQUIRED_BONE_NAMES.map((name) => {
    const bone = new THREE.Bone();
    const exportedName = useArmAliases && name === 'LeftUpperArm'
      ? 'LeftArm'
      : useArmAliases && name === 'RightUpperArm'
        ? 'RightArm'
        : name;
    bone.name = `mixamorig:${exportedName}`;
    return bone;
  });

  const byName = new Map<BoneName, THREE.Bone>(
    REQUIRED_BONE_NAMES.map((name, index) => [name, bones[index]])
  );
  byName.get('Hips')!.position.set(0, 0.885, 0);
  byName.get('Spine')!.position.set(0, 0.4, 0);
  byName.get('Spine1')!.position.set(0, 0.28, 0);
  byName.get('Spine2')!.position.set(0, 0.035, 0);
  byName.get('Neck')!.position.set(0, 0, 0);
  byName.get('Head')!.position.set(0, 0.24, 0);
  byName.get('LeftUpperArm')!.position.set(-0.31, -0.095, 0);
  byName.get('LeftForeArm')!.position.set(-0.126, -0.264, 0);
  byName.get('LeftHand')!.position.set(-0.059, -0.254, 0);
  byName.get('RightUpperArm')!.position.set(0.31, -0.095, 0);
  byName.get('RightForeArm')!.position.set(0.126, -0.264, 0);
  byName.get('RightHand')!.position.set(0.059, -0.254, 0);
  byName.get('LeftUpLeg')!.position.set(-0.12, -0.44, 0);
  byName.get('LeftLeg')!.position.set(-0.02, -0.42, 0);
  byName.get('LeftFoot')!.position.set(-0.01, -0.06, 0.08);
  byName.get('RightUpLeg')!.position.set(0.12, -0.44, 0);
  byName.get('RightLeg')!.position.set(0.02, -0.42, 0);
  byName.get('RightFoot')!.position.set(0.01, -0.06, 0.08);
  byName.get('Hips')!.add(byName.get('Spine')!);
  byName.get('Spine')!.add(byName.get('Spine1')!);
  byName.get('Spine1')!.add(byName.get('Spine2')!);
  byName.get('Spine2')!.add(byName.get('Neck')!);
  byName.get('Neck')!.add(byName.get('Head')!);
  byName.get('Spine2')!.add(byName.get('LeftUpperArm')!);
  byName.get('LeftUpperArm')!.add(byName.get('LeftForeArm')!);
  byName.get('LeftForeArm')!.add(byName.get('LeftHand')!);
  byName.get('Spine2')!.add(byName.get('RightUpperArm')!);
  byName.get('RightUpperArm')!.add(byName.get('RightForeArm')!);
  byName.get('RightForeArm')!.add(byName.get('RightHand')!);
  byName.get('Hips')!.add(byName.get('LeftUpLeg')!);
  byName.get('LeftUpLeg')!.add(byName.get('LeftLeg')!);
  byName.get('LeftLeg')!.add(byName.get('LeftFoot')!);
  byName.get('Hips')!.add(byName.get('RightUpLeg')!);
  byName.get('RightUpLeg')!.add(byName.get('RightLeg')!);
  byName.get('RightLeg')!.add(byName.get('RightFoot')!);

  const source = makeSourceMesh(bones);
  if (useTransformedArmature) {
    const armature = new THREE.Group();
    armature.name = 'SourceArmature';
    armature.position.set(2.1, -0.7, 1.4);
    armature.rotation.set(0.31, -0.27, 0.19);
    armature.scale.set(1.35, 0.8, 1.15);
    armature.add(source);
    armature.add(bones[0]);
    model.add(armature);
  } else {
    model.add(source);
  }
  // A second original mesh verifies that the transaction treats every source
  // SkinnedMesh consistently, rather than hiding only the rig source.
  const accessory = makeSourceMesh(bones);
  accessory.name = 'SourceAccessory';
  model.add(accessory);
  model.updateMatrixWorld(true);
  return model;
}

function modelWithMissingMixamoBone(): THREE.Group {
  const model = new THREE.Group();
  const bones = REQUIRED_BONE_NAMES
    .filter((name) => name !== 'RightForeArm')
    .map((name) => {
      const bone = new THREE.Bone();
      bone.name = `mixamorig:${name}`;
      return bone;
    });
  model.add(makeSourceMesh(bones));
  model.updateMatrixWorld(true);
  return model;
}

function originalSkinnedMeshes(model: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  model.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh === true) {
      meshes.push(object as THREE.SkinnedMesh);
    }
  });
  return meshes;
}

function runtimeSkinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh === true) {
      meshes.push(object as THREE.SkinnedMesh);
    }
  });
  return meshes;
}

describe('mountRuntimeWarrior', () => {
  it('binds generated skinned meshes to the source skeleton before hiding GLB meshes', () => {
    const model = modelWithCompleteMixamoSkeleton();
    const originals = originalSkinnedMeshes(model);
    const sourceSkeleton = originals[0].skeleton;
    const result = mountRuntimeWarrior(model);

    expect(result.kind).toBe('mounted');
    if (result.kind !== 'mounted') return;

    expect(result.visual.root.name).toBe('RuntimeWarrior');
    expect(result.visual.root.getObjectByName('RuntimeWarrior_Body')).toBeTruthy();
    expect(originals.every((mesh) => mesh.visible === false)).toBe(true);
    // The generated visual itself is exactly the seven material-role meshes.
    // Its cached budget reserves the single pre-existing trail call for the
    // fully equipped sword state, instead of falsely treating the body-only
    // count as the final in-game budget.
    expect(runtimeSkinnedMeshes(result.visual.root)).toHaveLength(7);
    expect(runtimeSkinnedMeshes(result.visual.root).every((mesh) => mesh.skeleton === sourceSkeleton)).toBe(true);
    expect(result.visual.drawCallCount).toBe(7);
    expect(result.visual.completeDrawCallCount).toBe(8);
    expect(result.visual.drawCallCount + 1).toBeLessThanOrEqual(8);
    expect(result.visual.triangleCount).toBeGreaterThanOrEqual(14_000);
    expect(result.visual.triangleCount).toBeLessThanOrEqual(18_000);
    expect(result.visual.budget).toEqual({
      triangles: result.visual.triangleCount,
      drawCalls: 8,
      materialRoles: 7,
      maxInfluences: 3,
    });
    expect(Object.isFrozen(result.visual.budget)).toBe(true);

    for (const mesh of runtimeSkinnedMeshes(result.visual.root)) {
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
      const position = mesh.geometry.getAttribute('position');
      const normal = mesh.geometry.getAttribute('normal');
      const uv = mesh.geometry.getAttribute('uv');
      const skinIndex = mesh.geometry.getAttribute('skinIndex');
      const skinWeight = mesh.geometry.getAttribute('skinWeight');
      expect(normal.count).toBe(position.count);
      expect(uv.count).toBe(position.count);
      expect(skinIndex.count).toBe(position.count);
      expect(skinWeight.count).toBe(position.count);
      expect(skinIndex.itemSize).toBe(4);
      expect(skinWeight.itemSize).toBe(4);
      expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(normal.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(uv.array).every(Number.isFinite)).toBe(true);
      expect(mesh.geometry.boundingBox).not.toBeNull();
      expect(mesh.geometry.boundingSphere).not.toBeNull();
    }
    result.visual.dispose();
  });

  it('accepts the LeftArm and RightArm aliases emitted by some Mixamo exports', () => {
    const model = modelWithCompleteMixamoSkeleton(true);
    const result = mountRuntimeWarrior(model);
    const source = originalSkinnedMeshes(model)[0];

    expect(result.kind).toBe('mounted');
    expect(source.skeleton.bones.some((bone) => bone.name === 'mixamorig:LeftArm')).toBe(true);
    expect(source.skeleton.bones.some((bone) => bone.name === 'mixamorig:RightArm')).toBe(true);
    if (result.kind === 'mounted') result.visual.dispose();
  });

  it('merges a right-hand sword segment into dark metal and toggles it without another mesh', () => {
    const model = modelWithCompleteMixamoSkeleton();
    const source = originalSkinnedMeshes(model)[0];
    const rightHandIndex = source.skeleton.bones.findIndex(
      (bone) => bone.name === 'mixamorig:RightHand'
    );
    const result = mountRuntimeWarrior(model);

    expect(rightHandIndex).toBeGreaterThanOrEqual(0);
    expect(result.kind).toBe('mounted');
    if (result.kind !== 'mounted') return;

    const generated = runtimeSkinnedMeshes(result.visual.root);
    const darkMetal = generated.find(
      (mesh) => mesh.userData.runtimeWarriorMaterialRole === 'darkMetal'
    );
    if (!darkMetal) throw new Error('Dark-metal role fixture is missing');
    const swordVisibility = darkMetal.geometry.getAttribute('runtimeWarriorSwordVisibility');
    const skinIndex = darkMetal.geometry.getAttribute('skinIndex');
    const skinWeight = darkMetal.geometry.getAttribute('skinWeight');

    expect(generated).toHaveLength(7);
    expect(swordVisibility).toBeDefined();
    if (!swordVisibility) throw new Error('Sword visibility fixture is missing');
    const swordVertices = Array.from({ length: swordVisibility.count }, (_, vertex) => vertex)
      .filter((vertex) => swordVisibility.getX(vertex) > 0.5);
    expect(swordVertices.length).toBeGreaterThan(0);
    expect(swordVertices.length).toBeLessThan(swordVisibility.count);
    for (const vertex of swordVertices) {
      expect(skinIndex.getX(vertex)).toBe(rightHandIndex);
      expect(skinIndex.getY(vertex)).toBe(0);
      expect(skinIndex.getZ(vertex)).toBe(0);
      expect(skinIndex.getW(vertex)).toBe(0);
      expect(skinWeight.getX(vertex)).toBe(1);
      expect(skinWeight.getY(vertex)).toBe(0);
      expect(skinWeight.getZ(vertex)).toBe(0);
      expect(skinWeight.getW(vertex)).toBe(0);
    }

    const visibilityBeforeToggle = Array.from(swordVisibility.array);
    const shader = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {},
    } as Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0];
    result.visual.materials.darkMetal.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    const uniform = shader.uniforms.runtimeWarriorSwordEquipped as { value: number };
    expect(uniform.value).toBe(0);
    expect(result.visual.swordTrailAnchor.parent).toBe(source.skeleton.bones[rightHandIndex]);
    expect(result.visual.swordBladeLength).toBeGreaterThan(0);
    let anchorMeshes = 0;
    result.visual.swordTrailAnchor.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) anchorMeshes += 1;
    });
    expect(anchorMeshes).toBe(0);

    result.visual.setRuntimeSwordEquipped(true);
    expect(uniform.value).toBe(1);
    expect(Array.from(swordVisibility.array)).toEqual(visibilityBeforeToggle);
    result.visual.setRuntimeSwordEquipped(false);
    expect(uniform.value).toBe(0);
    result.visual.dispose();
  });

  it('preserves the source local frame under a transformed armature parent', () => {
    const model = modelWithCompleteMixamoSkeleton(false, true);
    const source = originalSkinnedMeshes(model)[0];
    model.updateMatrixWorld(true);
    source.updateMatrixWorld(true);
    const expectedSourceFrame = new THREE.Matrix4()
      .copy(model.matrixWorld)
      .invert()
      .multiply(source.matrixWorld);

    const result = mountRuntimeWarrior(model);

    expect(result.kind).toBe('mounted');
    if (result.kind !== 'mounted') return;
    expect(result.visual.root.parent).toBe(model);
    expect(result.visual.root.matrixAutoUpdate).toBe(false);
    for (let element = 0; element < 16; element += 1) {
      expect(result.visual.root.matrix.elements[element]).toBeCloseTo(
        expectedSourceFrame.elements[element],
        6
      );
    }

    for (const mesh of runtimeSkinnedMeshes(result.visual.root)) {
      expect(mesh.skeleton).toBe(source.skeleton);
      const indices = mesh.geometry.getAttribute('skinIndex');
      const weights = mesh.geometry.getAttribute('skinWeight');
      for (let vertex = 0; vertex < weights.count; vertex += 1) {
        expect(
          weights.getX(vertex) +
            weights.getY(vertex) +
            weights.getZ(vertex) +
            weights.getW(vertex)
        ).toBeCloseTo(1, 5);
        for (let slot = 0; slot < 4; slot += 1) {
          expect(indices.getComponent(vertex, slot)).toBeGreaterThanOrEqual(0);
          expect(indices.getComponent(vertex, slot)).toBeLessThan(source.skeleton.bones.length);
        }
      }
    }
    result.visual.dispose();
  }, 15_000);

  it('keeps every original GLB mesh visible after a missing-bone factory failure', () => {
    const model = modelWithMissingMixamoBone();
    const originals = originalSkinnedMeshes(model);

    expect(mountRuntimeWarrior(model)).toEqual(expect.objectContaining({ kind: 'fallback' }));
    expect(originals.every((mesh) => mesh.visible)).toBe(true);
    expect(model.getObjectByName('RuntimeWarrior')).toBeUndefined();
  });

  it('disposes only instance geometry and restores the original visibility state', () => {
    const model = modelWithCompleteMixamoSkeleton();
    const originals = originalSkinnedMeshes(model);
    originals[0].visible = false;
    originals[1].visible = true;
    const before = originals.map((mesh) => mesh.visible);
    const result = mountRuntimeWarrior(model);

    expect(result.kind).toBe('mounted');
    if (result.kind !== 'mounted') return;
    const generated = runtimeSkinnedMeshes(result.visual.root);
    const geometryDisposals = generated.map((mesh) => {
      let count = 0;
      mesh.geometry.addEventListener('dispose', () => count++);
      return () => count;
    });
    const materialDisposals = generated.map((mesh) => {
      const material = mesh.material as THREE.Material;
      let count = 0;
      material.addEventListener('dispose', () => count++);
      return () => count;
    });
    const skeleton = originals[0].skeleton;
    const materials = getRuntimeWarriorMaterials();

    result.visual.dispose();

    expect(model.getObjectByName('RuntimeWarrior')).toBeUndefined();
    expect(originals.map((mesh) => mesh.visible)).toEqual(before);
    expect(geometryDisposals.every((getCount) => getCount() === 1)).toBe(true);
    expect(materialDisposals.every((getCount) => getCount() === 0)).toBe(true);
    expect(getRuntimeWarriorMaterials()).toBe(materials);
    expect(skeleton.bones.length).toBe(REQUIRED_BONE_NAMES.length);
  });
});
