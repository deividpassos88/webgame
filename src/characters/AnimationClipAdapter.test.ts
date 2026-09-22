import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { adaptRotationClip, makeClipInPlace } from './AnimationClipAdapter';

describe('adaptRotationClip', () => {
  it('keeps only rotation tracks for bones shared by the target model', () => {
    const clip = new THREE.AnimationClip('correndo', 1, [
      new THREE.QuaternionKeyframeTrack(
        'mixamorig:Hips.quaternion',
        [0, 1],
        [0, 0, 0, 1, 0, 0.2, 0, 0.98]
      ),
      new THREE.QuaternionKeyframeTrack(
        'mixamorig:Sword_joint.quaternion',
        [0, 1],
        [0, 0, 0, 1, 0, 0, 0.2, 0.98]
      ),
      new THREE.VectorKeyframeTrack(
        'mixamorig:Hips.position',
        [0, 1],
        [0, 0, 0, 3, 0, 4]
      ),
    ]);

    const adapted = adaptRotationClip(
      clip,
      new Set(['mixamorig:Hips']),
      'dragon-miner:running'
    );

    expect(adapted.name).toBe('dragon-miner:running');
    expect(adapted.duration).toBe(1);
    expect(adapted.tracks.map((track) => track.name)).toEqual([
      'mixamorig:Hips.quaternion',
    ]);
  });

  it('applies source animation deltas over the target skeleton rest pose', () => {
    const halfSqrt = Math.SQRT1_2;
    const sourceRest = new THREE.Quaternion(0, 0, halfSqrt, halfSqrt);
    const targetRest = new THREE.Quaternion(halfSqrt, 0, 0, halfSqrt);
    const clip = new THREE.AnimationClip('running', 1, [
      new THREE.QuaternionKeyframeTrack(
        'mixamorigHips.quaternion',
        [0, 1],
        [
          sourceRest.x,
          sourceRest.y,
          sourceRest.z,
          sourceRest.w,
          0,
          0,
          0,
          1,
        ]
      ),
    ]);

    const adapted = adaptRotationClip(
      clip,
      new Set(['mixamorigHips']),
      'dragon-miner:running',
      {
        sourceRestRotations: new Map([['mixamorigHips', sourceRest]]),
        targetRestRotations: new Map([['mixamorigHips', targetRest]]),
      }
    );
    const values = Array.from(adapted.tracks[0].values);

    expect(values.slice(0, 4)).toEqual([
      expect.closeTo(halfSqrt, 5),
      expect.closeTo(0, 5),
      expect.closeTo(0, 5),
      expect.closeTo(halfSqrt, 5),
    ]);
    expect(values.slice(4, 8)).toEqual([
      expect.closeTo(0.5, 5),
      expect.closeTo(0.5, 5),
      expect.closeTo(-0.5, 5),
      expect.closeTo(0.5, 5),
    ]);
  });
});

describe('makeClipInPlace', () => {
  it('removes motion on the configured rig axes while preserving the vertical axis', () => {
    const sourceTrack = new THREE.VectorKeyframeTrack(
      'mixamorig:Hips.position',
      [0, 0.5, 1],
      [1, 2, 3, 4, 5, 6, 8, 9, 10]
    );
    const clip = new THREE.AnimationClip('correndo', 1, [sourceTrack]);

    const inPlace = makeClipInPlace(clip, ['x', 'y']);
    const values = Array.from(inPlace.tracks[0].values);

    expect(values).toEqual([1, 2, 3, 1, 2, 6, 1, 2, 10]);
    expect(Array.from(sourceTrack.values)).toEqual([1, 2, 3, 4, 5, 6, 8, 9, 10]);
  });

  it('removes root motion when GLTFLoader sanitizes the Hips bone name', () => {
    const clip = new THREE.AnimationClip('running', 1, [
      new THREE.VectorKeyframeTrack(
        'mixamorigHips.position',
        [0, 1],
        [0, 100, -10, 2, 483, 1]
      ),
    ]);

    const inPlace = makeClipInPlace(clip, ['x', 'y']);

    expect(Array.from(inPlace.tracks[0].values)).toEqual([
      0, 100, -10, 0, 100, 1,
    ]);
  });

  it('can pin a sanitized root track to the exported rest pose', () => {
    const clip = new THREE.AnimationClip('idle', 1, [
      new THREE.VectorKeyframeTrack(
        'mixamorigHips.position',
        [0, 1],
        [0.5, -1.16, -51.78, 0.85, -0.85, -51.88]
      ),
    ]);

    const inPlace = makeClipInPlace(
      clip,
      ['x', 'y', 'z'],
      clip,
      new Map([['mixamorig:Hips', new THREE.Vector3(0.045, 54.25, -3.14)]])
    );

    expect(Array.from(inPlace.tracks[0].values)).toEqual([
      Math.fround(0.045), 54.25, Math.fround(-3.14),
      Math.fround(0.045), 54.25, Math.fround(-3.14),
    ]);
  });

  it('removes horizontal root motion from the monster Hips track', () => {
    const idle = new THREE.AnimationClip('Character_output.fbx', 1, [
      new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [-2, 107, -10, -2, 107, -10]),
    ]);
    const attack = new THREE.AnimationClip('Charged_Slash', 1, [
      new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [10, 104, 1, 38, 86, 22]),
    ]);

    const inPlace = makeClipInPlace(attack, ['x', 'z'], idle);

    expect(Array.from(inPlace.tracks[0].values)).toEqual([
      -2, 104, -10, -2, 86, -10,
    ]);
  });
});
