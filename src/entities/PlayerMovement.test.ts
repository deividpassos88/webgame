import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  approachMovementSpeed,
  groundPlaneDistance,
  resolveCameraRelativeMovement,
} from './PlayerMovement';
import { CharacterAssetStore } from '../characters/CharacterAssetStore';
import { Player } from './Player';

describe('PlayerMovement', () => {
  it('accelerates toward the requested speed without overshooting', () => {
    expect(approachMovementSpeed(0, 4.5, 14, 18, 0.1)).toBeCloseTo(1.4, 6);
    expect(approachMovementSpeed(4.4, 4.5, 14, 18, 0.1)).toBe(4.5);
  });

  it('decelerates at the requested rate without crossing zero', () => {
    expect(approachMovementSpeed(4.5, 0, 14, 18, 0.1)).toBeCloseTo(2.7, 6);
    expect(approachMovementSpeed(0.2, 0, 14, 18, 1)).toBe(0);
  });

  it.each([
    ['forward', 0, -1, 0, -1],
    ['backward', 0, 1, 0, 1],
    ['left', -1, 0, -1, 0],
    ['right', 1, 0, 1, 0],
    ['forward-left', -1, -1, -Math.SQRT1_2, -Math.SQRT1_2],
    ['forward-right', 1, -1, Math.SQRT1_2, -Math.SQRT1_2],
    ['backward-left', -1, 1, -Math.SQRT1_2, Math.SQRT1_2],
    ['backward-right', 1, 1, Math.SQRT1_2, Math.SQRT1_2],
  ])('resolves %s movement relative to the camera', (_label, x, z, expectedX, expectedZ) => {
    const direction = resolveCameraRelativeMovement(
      new THREE.Vector2(x, z),
      new THREE.Vector3(0, -0.8, -0.6)
    );

    expect(direction.x).toBeCloseTo(expectedX, 6);
    expect(direction.y).toBeCloseTo(0, 6);
    expect(direction.z).toBeCloseTo(expectedZ, 6);
    expect(direction.length()).toBeCloseTo(1, 6);
  });

  it('keeps a click destination when keyboard movement is merely inactive', () => {
    const player = new Player('paladin', new CharacterAssetStore());
    player.moveTarget = new THREE.Vector3(4, 0, 6);

    player.setKeyboardMoving(false);

    expect(player.moveTarget).toEqual(new THREE.Vector3(4, 0, 6));
  });

  it('finishes a click destination using ground-plane distance', () => {
    expect(
      groundPlaneDistance(
        new THREE.Vector3(4, 1.25, 6),
        new THREE.Vector3(4, 0, 6)
      )
    ).toBe(0);
  });
});
