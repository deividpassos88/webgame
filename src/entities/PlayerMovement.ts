/**
 * Moves a non-negative scalar toward its target at a rate that depends on
 * whether the player is accelerating or braking.  The result is clamped to
 * the target so a long frame can never overshoot it.
 */
export function approachMovementSpeed(
  current: number,
  target: number,
  acceleration: number,
  deceleration: number,
  delta: number
): number {
  if (!Number.isFinite(target)) return Number.isFinite(current) ? current : 0;
  if (!Number.isFinite(current)) current = 0;
  if (!Number.isFinite(delta) || delta <= 0) return current;

  const rate = target > current ? acceleration : deceleration;
  const step = Math.max(0, Number.isFinite(rate) ? rate : 0) * delta;
  if (target > current) return Math.min(target, current + step);
  return Math.max(target, current - step);
}

/** Measures navigation distance on the XZ ground plane, ignoring model elevation. */
export function groundPlaneDistance(from: THREE.Vector3, to: THREE.Vector3): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

/** Converts normalized WASD axes into an in-place, camera-relative world direction. */
export function resolveCameraRelativeMovement(
  input: THREE.Vector2,
  cameraForward: THREE.Vector3
): THREE.Vector3 {
  if (input.lengthSq() <= 0) return new THREE.Vector3();

  const forward = cameraForward.clone().setY(0);
  if (forward.lengthSq() <= 1e-8) forward.set(0, 0, -1);
  else forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();

  return right.multiplyScalar(input.x)
    .addScaledVector(forward, -input.y)
    .normalize();
}
import * as THREE from 'three';
