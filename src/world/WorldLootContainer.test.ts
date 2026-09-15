import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WorldLootContainer } from './WorldLootContainer';

describe('WorldLootContainer', () => {
  it('allows interaction only inside its explicit radius and retains loot state', () => {
    const container = new WorldLootContainer(new THREE.Group(), new THREE.Vector3(0, 0, 0));

    expect(container.canInteractFrom(new THREE.Vector3(2, 0, 0))).toBe(true);
    expect(container.canInteractFrom(new THREE.Vector3(4, 0, 0))).toBe(false);
    expect(container.state.available('runic-crystal')).toBeGreaterThan(0);
  });
});
