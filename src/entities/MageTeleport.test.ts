import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  MAGE_TELEPORT_DISTANCE,
  MAGE_TELEPORT_FATIGUE_PERCENT,
  MAGE_TELEPORT_INVULNERABILITY_SECONDS,
  mageTeleportManaCost,
  resolveMageTeleportDestination,
} from './MageTeleport';

describe('Mage teleport', () => {
  it('blinks 10 meters in the requested direction and spends 25% fatigue worth of the configured bar', () => {
    const destination = resolveMageTeleportDestination({
      origin: new THREE.Vector3(1, 0, 2),
      direction: new THREE.Vector3(0, 0, -1),
      worldLimit: 23,
    });

    expect(MAGE_TELEPORT_DISTANCE).toBe(10);
    expect(MAGE_TELEPORT_FATIGUE_PERCENT).toBe(25);
    expect(MAGE_TELEPORT_INVULNERABILITY_SECONDS).toBe(1);
    expect(destination.x).toBeCloseTo(1);
    expect(destination.z).toBeCloseTo(2 - MAGE_TELEPORT_DISTANCE);
    expect(mageTeleportManaCost(50)).toBe(5);
  });

  it('stops before a pillar and the arena wall', () => {
    const blocked = resolveMageTeleportDestination({
      origin: new THREE.Vector3(0, 0, 0),
      direction: new THREE.Vector3(1, 0, 0),
      worldLimit: 23,
      obstacles: [{ x: 3, z: 0, radius: 0.9 }],
    });
    expect(blocked.x).toBeLessThan(3 - 0.9);
    expect(blocked.x).toBeGreaterThan(1);

    const walled = resolveMageTeleportDestination({
      origin: new THREE.Vector3(20, 0, 0),
      direction: new THREE.Vector3(1, 0, 0),
      worldLimit: 23,
    });
    expect(walled.x).toBeLessThanOrEqual(23 - 0.45);
    expect(walled.x).toBeGreaterThan(20);
  });
});
