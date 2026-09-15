import * as THREE from 'three';

export interface FacePortraitFraming {
  readonly camera: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly fov: number;
}

/**
 * Uses the model's world bounds to place a tight, upper-body portrait camera.
 * The old fixed-height camera regularly framed the warrior's torso after asset
 * scale changes; this stays anchored around the face regardless of scale.
 */
export function getFacePortraitFraming(bounds: THREE.Box3): FacePortraitFraming {
  const center = bounds.getCenter(new THREE.Vector3());
  const height = Math.max(0.5, bounds.max.y - bounds.min.y);
  const targetY = bounds.max.y - height * 0.16;
  const distance = Math.max(1.15, height * 0.7);
  return {
    camera: new THREE.Vector3(center.x, targetY + height * 0.04, bounds.max.z + distance),
    target: new THREE.Vector3(center.x, targetY, center.z),
    fov: 22,
  };
}

/**
 * Skinned GLB meshes keep a compact bind-pose bounding box even when their
 * bones stretch the live character across the world. A named Head bone is a
 * reliable face anchor, independent of the body mesh bounds or weapon pose.
 */
export function getFacePortraitFramingFromHead(
  headPosition: THREE.Vector3,
  worldScale: THREE.Vector3
): FacePortraitFraming {
  const scale = Math.max(0.5, worldScale.x, worldScale.y, worldScale.z);
  const target = headPosition.clone().add(new THREE.Vector3(0, -scale * 0.048, 0));
  const distance = Math.max(0.65, scale * 0.7);
  return {
    camera: target.clone().add(new THREE.Vector3(0, scale * 0.055, distance)),
    target,
    fov: 24,
  };
}
