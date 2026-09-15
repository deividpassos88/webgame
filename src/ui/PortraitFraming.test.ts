import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  getFacePortraitFraming,
  getFacePortraitFramingFromHead,
} from './PortraitFraming';

describe('getFacePortraitFraming', () => {
  it('frames the upper face area instead of the warrior torso', () => {
    const framing = getFacePortraitFraming(
      new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.3), new THREE.Vector3(0.5, 2, 0.3))
    );

    expect(framing.target.y).toBeCloseTo(1.68);
    expect(framing.camera.y).toBeGreaterThan(1.68);
    expect(framing.camera.z).toBeGreaterThan(1.3);
    expect(framing.fov).toBeLessThan(28);
  });

  it('anchors a skinned model portrait to the Head bone rather than a bind-pose mesh box', () => {
    const framing = getFacePortraitFramingFromHead(
      new THREE.Vector3(2, 3.4, -1),
      new THREE.Vector3(1.25, 1.25, 1.25)
    );

    expect(framing.target).toEqual(new THREE.Vector3(2, 3.34, -1));
    expect(framing.camera.y).toBeGreaterThan(framing.target.y);
    expect(framing.camera.z).toBeGreaterThan(framing.target.z);
    expect(framing.fov).toBeLessThanOrEqual(26);
  });
});
