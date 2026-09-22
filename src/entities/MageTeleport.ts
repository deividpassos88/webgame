import * as THREE from 'three';
import type { NavigationObstacle } from '../world/NavigationObstacle';

export const MAGE_TELEPORT_DISTANCE = 10;
export const MAGE_TELEPORT_FATIGUE_PERCENT = 25;
export const MAGE_TELEPORT_MP_PERCENT = 10;
/** Immunity covers only the blink, from the moment it starts until one second later. */
export const MAGE_TELEPORT_INVULNERABILITY_SECONDS = 1;

export function mageTeleportManaCost(maxMana: number): number {
  const safe = Number.isFinite(maxMana) ? Math.max(0, maxMana) : 0;
  return Math.max(1, Math.round(safe * MAGE_TELEPORT_MP_PERCENT / 100));
}

/**
 * Instant blink along the requested facing/movement direction. Stops before a
 * pillar or the arena wall instead of sliding through them.
 */
export function resolveMageTeleportDestination(input: {
  readonly origin: THREE.Vector3;
  readonly direction: THREE.Vector3;
  readonly distance?: number;
  readonly worldLimit: number;
  readonly bodyRadius?: number;
  readonly obstacles?: readonly NavigationObstacle[];
}): THREE.Vector3 {
  const direction = input.direction.clone().setY(0);
  if (direction.lengthSq() <= 1e-8) direction.set(0, 0, 1);
  direction.normalize();

  const distance = input.distance ?? MAGE_TELEPORT_DISTANCE;
  const bodyRadius = input.bodyRadius ?? 0.45;
  const limit = Math.max(bodyRadius, input.worldLimit - bodyRadius);
  const destination = input.origin.clone();
  const step = 0.15;
  const steps = Math.max(1, Math.ceil(distance / step));

  for (let index = 1; index <= steps; index += 1) {
    const travel = Math.min(distance, index * step);
    const nextX = input.origin.x + direction.x * travel;
    const nextZ = input.origin.z + direction.z * travel;
    if (Math.abs(nextX) > limit || Math.abs(nextZ) > limit) break;
    if (blockedByObstacle(nextX, nextZ, bodyRadius, input.obstacles ?? [])) break;
    destination.x = nextX;
    destination.z = nextZ;
  }
  destination.y = input.origin.y;
  return destination;
}

function blockedByObstacle(
  x: number,
  z: number,
  bodyRadius: number,
  obstacles: readonly NavigationObstacle[]
): boolean {
  for (const obstacle of obstacles) {
    const reach = bodyRadius + obstacle.radius;
    const dx = x - obstacle.x;
    const dz = z - obstacle.z;
    if (dx * dx + dz * dz < reach * reach) return true;
  }
  return false;
}
