import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyProximitySkinning,
  normalizeRigBoneName,
  resolveRuntimeWarriorRig,
  validateSkinAttributes,
  type RuntimeRigBoneId,
  type RuntimeWarriorRig,
} from './RuntimeWarriorSkinning';

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

const BONE_ID_BY_NAME: Readonly<Record<BoneName, RuntimeRigBoneId>> = {
  Hips: 'hips',
  Spine: 'spine',
  Spine1: 'spine1',
  Spine2: 'spine2',
  Neck: 'neck',
  Head: 'head',
  LeftUpperArm: 'leftUpperArm',
  LeftForeArm: 'leftForeArm',
  LeftHand: 'leftHand',
  RightUpperArm: 'rightUpperArm',
  RightForeArm: 'rightForeArm',
  RightHand: 'rightHand',
  LeftUpLeg: 'leftUpLeg',
  LeftLeg: 'leftLeg',
  LeftFoot: 'leftFoot',
  RightUpLeg: 'rightUpLeg',
  RightLeg: 'rightLeg',
  RightFoot: 'rightFoot',
};

function makeBone(name: BoneName, x: number, y: number, z = 0): THREE.Bone {
  const bone = new THREE.Bone();
  bone.name = `mixamorig:${name}`;
  bone.position.set(x, y, z);
  return bone;
}

function makeRigMesh(
  missing?: BoneName,
  nameStyle: 'colon' | 'camel' = 'colon'
): THREE.SkinnedMesh {
  const bones = new Map<BoneName, THREE.Bone>();
  for (const name of REQUIRED_BONE_NAMES) {
    if (name === missing) continue;
    const bone = makeBone(name, 0, 0);
    bone.name = nameStyle === 'colon' ? `mixamorig:${name}` : `mixamorig${name}`;
    bones.set(name, bone);
  }

  const hips = bones.get('Hips');
  const spine = bones.get('Spine');
  const spine1 = bones.get('Spine1');
  const spine2 = bones.get('Spine2');
  const neck = bones.get('Neck');
  const head = bones.get('Head');
  if (hips) hips.position.set(0, 0, 0);
  if (spine) spine.position.set(0, 0.35, 0);
  if (spine1) spine1.position.set(0, 0.28, 0);
  if (spine2) spine2.position.set(0, 0.22, 0);
  if (neck) neck.position.set(0, 0.16, 0);
  if (head) head.position.set(0, 0.12, 0);
  if (hips && spine) hips.add(spine);
  if (spine && spine1) spine.add(spine1);
  if (spine1 && spine2) spine1.add(spine2);
  if (spine2 && neck) spine2.add(neck);
  if (neck && head) neck.add(head);

  const leftUpperArm = bones.get('LeftUpperArm');
  const leftForeArm = bones.get('LeftForeArm');
  const leftHand = bones.get('LeftHand');
  const rightUpperArm = bones.get('RightUpperArm');
  const rightForeArm = bones.get('RightForeArm');
  const rightHand = bones.get('RightHand');
  if (leftUpperArm) leftUpperArm.position.set(-0.34, 0, 0);
  if (leftForeArm) leftForeArm.position.set(-0.28, -0.18, 0);
  if (leftHand) leftHand.position.set(-0.22, -0.16, 0);
  if (rightUpperArm) rightUpperArm.position.set(0.34, 0, 0);
  if (rightForeArm) rightForeArm.position.set(0.28, -0.18, 0);
  if (rightHand) rightHand.position.set(0.22, -0.16, 0);
  if (spine2 && leftUpperArm) spine2.add(leftUpperArm);
  if (leftUpperArm && leftForeArm) leftUpperArm.add(leftForeArm);
  if (leftForeArm && leftHand) leftForeArm.add(leftHand);
  if (spine2 && rightUpperArm) spine2.add(rightUpperArm);
  if (rightUpperArm && rightForeArm) rightUpperArm.add(rightForeArm);
  if (rightForeArm && rightHand) rightForeArm.add(rightHand);

  const leftUpLeg = bones.get('LeftUpLeg');
  const leftLeg = bones.get('LeftLeg');
  const leftFoot = bones.get('LeftFoot');
  const rightUpLeg = bones.get('RightUpLeg');
  const rightLeg = bones.get('RightLeg');
  const rightFoot = bones.get('RightFoot');
  if (leftUpLeg) leftUpLeg.position.set(-0.12, -0.44, 0);
  if (leftLeg) leftLeg.position.set(-0.02, -0.42, 0);
  if (leftFoot) leftFoot.position.set(-0.01, -0.06, 0.08);
  if (rightUpLeg) rightUpLeg.position.set(0.12, -0.44, 0);
  if (rightLeg) rightLeg.position.set(0.02, -0.42, 0);
  if (rightFoot) rightFoot.position.set(0.01, -0.06, 0.08);
  if (hips && leftUpLeg) hips.add(leftUpLeg);
  if (leftUpLeg && leftLeg) leftUpLeg.add(leftLeg);
  if (leftLeg && leftFoot) leftLeg.add(leftFoot);
  if (hips && rightUpLeg) hips.add(rightUpLeg);
  if (rightUpLeg && rightLeg) rightUpLeg.add(rightLeg);
  if (rightLeg && rightFoot) rightLeg.add(rightFoot);

  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  if (hips) mesh.add(hips);
  const skeleton = new THREE.Skeleton(Array.from(bones.values()));
  mesh.bind(skeleton);
  mesh.updateMatrixWorld(true);
  return mesh;
}

function rigWithRightArm(): RuntimeWarriorRig {
  return resolveRuntimeWarriorRig(makeRigMesh(undefined, 'camel'));
}

function standaloneSegmentRig(): RuntimeWarriorRig {
  const bones = new Map<BoneName, THREE.Bone>();
  for (const name of REQUIRED_BONE_NAMES) {
    const bone = makeBone(name, 100, 100);
    bones.set(name, bone);
  }

  const spine2 = bones.get('Spine2');
  const rightUpperArm = bones.get('RightUpperArm');
  const rightForeArm = bones.get('RightForeArm');
  const rightHand = bones.get('RightHand');
  if (spine2) spine2.position.set(10, 0, 0);
  if (rightUpperArm) rightUpperArm.position.set(0, 0, 0);
  if (rightForeArm) rightForeArm.position.set(0.5, 0, 0);
  if (rightHand) rightHand.position.set(10, 0, 0);

  // Keep the two candidate segments independent while giving each a known
  // unit-length child endpoint; all other required bones stay far away.
  if (rightUpperArm) {
    const upperTip = new THREE.Bone();
    upperTip.position.set(0, 1, 0);
    rightUpperArm.add(upperTip);
  }
  if (rightForeArm) {
    const foreTip = new THREE.Bone();
    foreTip.position.set(0, 1, 0);
    rightForeArm.add(foreTip);
  }

  const skeletonBones = Array.from(bones.values());
  for (const bone of skeletonBones) bone.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(skeletonBones);
  const resolvedBones = new Map<RuntimeRigBoneId, THREE.Bone>();
  const boneIndices = new Map<RuntimeRigBoneId, number>();
  for (let index = 0; index < skeletonBones.length; index += 1) {
    const bone = skeletonBones[index];
    const name = REQUIRED_BONE_NAMES[index];
    const id = BONE_ID_BY_NAME[name];
    resolvedBones.set(id, bone);
    boneIndices.set(id, index);
  }
  return { skeleton, bones: resolvedBones, boneIndices };
}

function simpleGeometry(points: readonly (readonly [number, number, number])[]): THREE.BufferGeometry {
  const values: number[] = [];
  for (const point of points) values.push(point[0], point[1], point[2]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
  return geometry;
}

type SkinAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

function sumWeight(weights: SkinAttribute, vertex: number): number {
  return weights.getX(vertex) + weights.getY(vertex) + weights.getZ(vertex) + weights.getW(vertex);
}

function activeInfluenceCount(weights: SkinAttribute, vertex: number): number {
  let count = 0;
  for (let slot = 0; slot < 4; slot += 1) {
    if (weights.getComponent(vertex, slot) > 0) count += 1;
  }
  return count;
}

function weightedBoneIds(
  geometry: THREE.BufferGeometry,
  rig: RuntimeWarriorRig,
  vertex: number
): Array<{ id: string; weight: number }> {
  const indices = geometry.getAttribute('skinIndex');
  const weights = geometry.getAttribute('skinWeight');
  return Array.from({ length: 4 }, (_, slot) => {
    const skeletonIndex = indices.getComponent(vertex, slot);
    const id = Array.from(rig.boneIndices.entries()).find(([, index]) => index === skeletonIndex)?.[0] ?? 'unknown';
    return { id, weight: weights.getComponent(vertex, slot) };
  });
}

describe('Runtime warrior skinning', () => {
  it('normalizes the Mixamo hand name used by GLTFLoader', () => {
    expect(normalizeRigBoneName('mixamorig:RightHand')).toBe('mixamorigrighthand');
    expect(normalizeRigBoneName('mixamorigRightHand')).toBe('mixamorigrighthand');
    expect(normalizeRigBoneName('mixamorig_Right-Hand')).toBe('mixamorigrighthand');
  });

  it('resolves all required bones to their original skeleton indices', () => {
    const mesh = makeRigMesh();
    const rig = resolveRuntimeWarriorRig(mesh);

    expect(rig.bones.get('rightForeArm')?.name).toBe('mixamorig:RightForeArm');
    expect(rig.boneIndices.get('hips')).toBe(0);
    expect(rig.boneIndices.get('rightFoot')).toBe(17);
    expect(rig.skeleton).toBe(mesh.skeleton);
  });

  it('keeps only four normalized proximity influences', () => {
    const geometry = simpleGeometry([
      [0.64, 0.85, 0],
      [0.90, 0.67, 0],
      [1.10, 0.52, 0],
    ]);
    const rig = rigWithRightArm();

    applyProximitySkinning(geometry, 'rightArm', rig);

    const weights = geometry.getAttribute('skinWeight');
    const indices = geometry.getAttribute('skinIndex');
    expect(weights.itemSize).toBe(4);
    expect(indices.itemSize).toBe(4);
    expect(indices).toBeInstanceOf(THREE.Uint16BufferAttribute);
    expect(weights).toBeInstanceOf(THREE.Float32BufferAttribute);
    for (let vertex = 0; vertex < weights.count; vertex++) {
      expect(sumWeight(weights, vertex)).toBeCloseTo(1, 6);
      expect(activeInfluenceCount(weights, vertex)).toBeLessThanOrEqual(4);
      expect(Array.from({ length: 4 }, (__, slot) => indices.getComponent(vertex, slot))
        .every((index) => Number.isInteger(index) && index >= 0 && index < rig.skeleton.bones.length)).toBe(true);
    }
    validateSkinAttributes(geometry);
  });

  it('uses point-to-segment distance and squared falloff for ranked influences', () => {
    const rig = standaloneSegmentRig();
    const geometry = simpleGeometry([
      [0, 0.5, 0],
      [0, 0.5, 0.5],
    ]);

    applyProximitySkinning(geometry, 'rightArm', rig);

    const onSegment = weightedBoneIds(geometry, rig, 0);
    const offset = weightedBoneIds(geometry, rig, 1);
    const upperOn = onSegment.find((entry) => entry.id === 'rightUpperArm')!.weight;
    const foreOn = onSegment.find((entry) => entry.id === 'rightForeArm')!.weight;
    const upperOffset = offset.find((entry) => entry.id === 'rightUpperArm')!.weight;
    const foreOffset = offset.find((entry) => entry.id === 'rightForeArm')!.weight;
    const expectedOnSegmentRatio = 1 / ((1 - 0.5 / 1.1) ** 2);
    const expectedOffsetRatio = ((1 - 0.5 / 1.1) ** 2) / ((1 - Math.SQRT1_2 / 1.1) ** 2);

    expect(upperOn / foreOn).toBeCloseTo(expectedOnSegmentRatio, 4);
    expect(upperOffset / foreOffset).toBeCloseTo(expectedOffsetRatio, 4);
    expect(upperOn / foreOn).toBeGreaterThan(upperOffset / foreOffset);
  });

  it('keeps model-local geometry independent of a transformed source mesh', () => {
    const mesh = makeRigMesh();
    mesh.position.set(20, 4, -3);
    mesh.scale.set(2, 2, 2);
    mesh.updateMatrixWorld(true);
    const rig = resolveRuntimeWarriorRig(mesh);
    const geometry = simpleGeometry([[0.64, 0.85, 0]]);

    applyProximitySkinning(geometry, 'rightArm', rig);

    expect(weightedBoneIds(geometry, rig, 0)[0].id).toBe('rightUpperArm');
  });

  it('aligns mesh-space geometry when an exported Hips root carries an axis correction', () => {
    const mesh = makeRigMesh();
    const hips = mesh.skeleton.bones[0];
    hips.rotation.x = -Math.PI * 0.5;
    mesh.updateMatrixWorld(true);
    const rig = resolveRuntimeWarriorRig(mesh);
    const geometry = simpleGeometry([[0, 0.58, 0]]);

    // Mixamo/Blender exports can use a rotated root bone while retaining
    // mesh vertices in the upright source frame. The skinning candidates
    // must apply that rest-frame correction before distance tests.
    expect(() => applyProximitySkinning(geometry, 'torso', rig)).not.toThrow();
    expect(weightedBoneIds(geometry, rig, 0).some((entry) => entry.weight > 0)).toBe(true);
  });

  it('does not use bones from another anatomical region as arm candidates', () => {
    const rig = rigWithRightArm();
    const geometry = simpleGeometry([[-0.20, 0.85, 0]]);

    applyProximitySkinning(geometry, 'rightArm', rig);

    const ids = weightedBoneIds(geometry, rig, 0).map((entry) => entry.id);
    expect(ids).not.toContain('leftUpperArm');
    expect(ids).not.toContain('leftForeArm');
    expect(ids).not.toContain('leftHand');
  });

  it('rejects an out-of-radius vertex before installing either skin attribute', () => {
    const rig = rigWithRightArm();
    const geometry = simpleGeometry([[100, 100, 100]]);

    expect(() => applyProximitySkinning(geometry, 'rightArm', rig)).toThrow(/influence|radius|cutoff/i);
    expect(geometry.getAttribute('skinIndex')).toBeUndefined();
    expect(geometry.getAttribute('skinWeight')).toBeUndefined();
  });

  it('handles interleaved position attributes using their stride', () => {
    const rig = rigWithRightArm();
    const geometry = new THREE.BufferGeometry();
    const interleaved = new THREE.InterleavedBuffer(new Float32Array([
      0.64, 0.85, 0, 999,
      0.90, 0.67, 0, 999,
    ]), 4);
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0));

    applyProximitySkinning(geometry, 'rightArm', rig);

    expect(weightedBoneIds(geometry, rig, 1)[0].id).toBe('rightForeArm');
  });

  it('blends adjacent shoulder, elbow and wrist bones through an arm articulation', () => {
    const geometry = simpleGeometry([
      [0.64, 0.85, 0],
      [0.88, 0.68, 0],
      [1.08, 0.52, 0],
    ]);
    const rig = rigWithRightArm();

    applyProximitySkinning(geometry, 'rightArm', rig);

    const first = weightedBoneIds(geometry, rig, 0).filter((entry) => entry.weight > 0);
    const joint = weightedBoneIds(geometry, rig, 1).filter((entry) => entry.weight > 0);
    const last = weightedBoneIds(geometry, rig, 2).filter((entry) => entry.weight > 0);
    expect(first.some((entry) => entry.id === 'rightUpperArm')).toBe(true);
    expect(joint.some((entry) => entry.id === 'rightForeArm')).toBe(true);
    expect(last.some((entry) => entry.id === 'rightHand')).toBe(true);
    expect(joint.length).toBeGreaterThan(1);
  });

  it('skins torso and leg regions with finite normalized four-slot attributes', () => {
    const rig = rigWithRightArm();
    for (const [region, points] of [
      ['torso', [[0, 0.58, 0], [0, 0.93, 0]]],
      ['rightLeg', [[0.12, -0.35, 0], [0.13, -0.78, 0], [0.14, -0.91, 0.08]]],
    ] as const) {
      const geometry = simpleGeometry(points);
      applyProximitySkinning(geometry, region, rig);
      validateSkinAttributes(geometry);
      const weights = geometry.getAttribute('skinWeight');
      expect(Array.from(weights.array).every(Number.isFinite)).toBe(true);
      for (let vertex = 0; vertex < weights.count; vertex += 1) {
        expect(sumWeight(weights, vertex)).toBeCloseTo(1, 6);
      }
    }
  });

  it('fails before attachment when an anatomical transition bone is absent', () => {
    const mesh = makeRigMesh('RightForeArm');
    expect(() => resolveRuntimeWarriorRig(mesh)).toThrow(/RightForeArm/);
    expect(mesh.geometry.getAttribute('skinWeight')).toBeUndefined();
    expect(mesh.geometry.getAttribute('skinIndex')).toBeUndefined();
  });

  it('rejects malformed skin attributes at the geometry boundary', () => {
    const rig = rigWithRightArm();
    const geometry = simpleGeometry([[0, 0, 0]]);
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 1, 2, 3], 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([0.25, 0.25, 0.25, Number.NaN], 4));
    expect(() => validateSkinAttributes(geometry, rig.skeleton)).toThrow(/finite|NaN/i);

    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([0.2, 0.2, 0.2, 0.2], 4));
    expect(() => validateSkinAttributes(geometry, rig.skeleton)).toThrow(/sum|one|1/i);

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 1, 2, 18], 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
    expect(() => validateSkinAttributes(geometry, rig.skeleton)).toThrow(/outside|skeleton/i);

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 1, 2, 3], 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([-0.1, 1.1, 0, 0], 4));
    expect(() => validateSkinAttributes(geometry, rig.skeleton)).toThrow(/negative/i);
  });

  it('requires a real skeleton or an apply-generated marker for index validation', () => {
    const geometry = simpleGeometry([[0, 0, 0]]);
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));

    expect(() => validateSkinAttributes(geometry)).toThrow(/skeleton/i);
    expect(() => validateSkinAttributes(geometry, rigWithRightArm().skeleton)).not.toThrow();
  });

  it('does not trust a forged public marker and requires a skeleton for cloned geometry', () => {
    const forged = simpleGeometry([[0, 0, 0]]);
    forged.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
    forged.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
    forged.userData.runtimeWarriorBoneCount = 18;
    expect(() => validateSkinAttributes(forged)).toThrow(/skeleton|marker/i);

    const rig = rigWithRightArm();
    const applied = simpleGeometry([[0.64, 0.85, 0]]);
    applyProximitySkinning(applied, 'rightArm', rig);
    const cloned = applied.clone();
    expect(() => validateSkinAttributes(cloned)).toThrow(/skeleton|marker/i);
    expect(() => validateSkinAttributes(cloned, rig.skeleton)).not.toThrow();
  });
});
