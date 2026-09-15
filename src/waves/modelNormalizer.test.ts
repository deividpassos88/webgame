import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  animatedModelGroundY,
  hasLyingBindPose,
  measureAnimatedModelProfile,
} from './modelNormalizer';

function makeBone(name: string, position: THREE.Vector3): THREE.Bone {
  const bone = new THREE.Bone();
  bone.name = name;
  bone.position.copy(position);
  return bone;
}

/** Rig em pé: coluna vertical de bones + SkinnedMesh anexado. */
function makeUprightRig(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Armature';
  const hips = makeBone('mixamorig:Hips', new THREE.Vector3(0, 1, 0));
  const spine = makeBone('mixamorig:Spine', new THREE.Vector3(0, 0.4, 0));
  const head = makeBone('mixamorig:Head', new THREE.Vector3(0, 0.5, 0));
  const leftFoot = makeBone('mixamorig:LeftFoot', new THREE.Vector3(-0.15, -1, 0.05));
  const rightFoot = makeBone('mixamorig:RightFoot', new THREE.Vector3(0.15, -1, -0.05));
  hips.add(spine, leftFoot, rightFoot);
  spine.add(head);
  root.add(hips);
  const skinned = new THREE.SkinnedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial()
  );
  skinned.skeleton = new THREE.Skeleton([hips, spine, head, leftFoot, rightFoot]);
  root.add(skinned);
  root.updateMatrixWorld(true);
  return root;
}

/** Rig deitado (estilo export Tripo): bones espalhados no plano XZ. */
function makeLyingRig(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Armature';
  // Personagem "de costas": cabeça aponta para +Z, altura mínima.
  const hips = makeBone('mixamorig:Hips', new THREE.Vector3(0, 0.1, 0));
  const head = makeBone('mixamorig:Head', new THREE.Vector3(0, 0, 0.7));
  const leftFoot = makeBone('mixamorig:LeftFoot', new THREE.Vector3(-0.2, 0, -0.55));
  const rightFoot = makeBone('mixamorig:RightFoot', new THREE.Vector3(0.2, 0, -0.55));
  hips.add(head, leftFoot, rightFoot);
  root.add(hips);
  const skinned = new THREE.SkinnedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial()
  );
  skinned.skeleton = new THREE.Skeleton([hips, head, leftFoot, rightFoot]);
  root.add(skinned);
  root.updateMatrixWorld(true);
  return root;
}

describe('modelNormalizer', () => {
  it('detects a lying bind pose (Z extent dominant) and not an upright one', () => {
    expect(hasLyingBindPose(makeLyingRig())).toBe(true);
    expect(hasLyingBindPose(makeUprightRig())).toBe(false);
  });

  it('returns false for models without skeletons', () => {
    const plain = new THREE.Group();
    plain.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    expect(hasLyingBindPose(plain)).toBe(false);
    expect(animatedModelGroundY(plain)).toBeNull();
    expect(measureAnimatedModelProfile(plain)).toBeNull();
  });

  it('measures the ground Y from bone world positions', () => {
    const rig = makeUprightRig();
    // pés em y = 1 (hips) - 1 = 0
    expect(animatedModelGroundY(rig)).toBeCloseTo(0, 5);
    const profile = measureAnimatedModelProfile(rig);
    expect(profile).not.toBeNull();
    // cabeça em y = 1 + 0.4 + 0.5 = 1.9
    expect(profile!.height).toBeCloseTo(1.9, 5);
    expect(profile!.maxY).toBeCloseTo(1.9, 5);
  });

  it('tracks bone measurements when the pose changes', () => {
    const rig = makeUprightRig();
    const before = animatedModelGroundY(rig);
    // "pula": move o rig inteiro para cima
    rig.position.y += 2.5;
    rig.updateMatrixWorld(true);
    expect(animatedModelGroundY(rig)).toBeCloseTo(before! + 2.5, 5);
  });

  it('measures a lying rig by its real bone silhouette (Z extent), not Box3 height', () => {
    const rig = makeLyingRig();
    const profile = measureAnimatedModelProfile(rig);
    // altura deitada = extensão Z (cabeça a +0.7, pés a -0.55 => 1.25);
    // o Box3 da bind daria altura ~0.1 (só o eixo Y deitado).
    expect(profile).not.toBeNull();
    expect(profile!.height).toBeCloseTo(1.25, 5);
    expect(profile!.minY).toBeCloseTo(0.1, 5); // hips e filhos estão em y=0.1
  });
});
