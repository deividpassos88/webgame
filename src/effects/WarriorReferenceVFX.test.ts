import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WarriorReferenceVFX } from './WarriorReferenceVFX';

describe('WarriorReferenceVFX', () => {
  it('uses layered vertical crescents for the directional air cut and fades them out', async () => {
    const scene = new THREE.Scene();
    const vfx = new WarriorReferenceVFX(scene);
    await vfx.loadTextureAssets({
      async loadAsync() { return new THREE.Texture(); },
    });

    vfx.playAttack('ataque_basico', new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
    const effect = scene.getObjectByName('WarriorReferenceVFX');
    expect(effect?.getObjectByName('ReferenceVerticalSlash')?.children).toHaveLength(3);
    expect(vfx.activeCount).toBe(1);
    vfx.update(0.2);
    expect(effect?.position.z).toBeGreaterThan(0);
    vfx.update(0.5);
    expect(vfx.activeCount).toBe(0);
    vfx.dispose();
  });

  it('builds a horizontal layered spin and a separate target hit burst', () => {
    const scene = new THREE.Scene();
    let heavyImpact = 0;
    const vfx = new WarriorReferenceVFX(scene, () => { heavyImpact += 1; });

    vfx.playAttack('ataque_giratorio', new THREE.Vector3(), new THREE.Vector3(1, 0, 0));
    const effect = scene.getObjectByName('WarriorReferenceVFX');
    const spin = effect?.getObjectByName('ReferenceHorizontalSpin');
    vfx.update(0.45);
    expect(spin?.scale.x).toBeGreaterThan(4);
    expect(spin?.children).toHaveLength(3);

    vfx.playAttack('pulo_atacando', new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
    expect(heavyImpact).toBe(1);
    vfx.playHit('ataque_giratorio_2', new THREE.Vector3(2, 0, 2), 1, 1.2);
    expect(vfx.activeCount).toBe(3);
    vfx.clear();
    expect(vfx.activeCount).toBe(0);
    vfx.dispose();
  });
});
