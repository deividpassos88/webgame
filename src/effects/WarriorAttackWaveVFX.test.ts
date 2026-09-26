import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WarriorAttackWaveVFX } from './WarriorAttackWaveVFX';

describe('WarriorAttackWaveVFX', () => {
  it('creates a travelling C-shaped air cut for a normal swing', async () => {
    const scene = new THREE.Scene();
    const vfx = new WarriorAttackWaveVFX(scene);
    await vfx.loadTextureAssets({
      async loadAsync() { return new THREE.Texture(); },
    });

    vfx.play('ataque_basico', new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
    const wave = scene.getObjectByName('WarriorAttackWave');
    expect(vfx.activeCount).toBe(1);
    expect(wave?.getObjectByName('WarriorAirSlash')).toBeDefined();
    const startZ = wave?.position.z ?? 0;
    vfx.update(0.1);
    expect(wave?.position.z).toBeGreaterThan(startZ);

    vfx.update(0.5);
    expect(vfx.activeCount).toBe(0);
    vfx.dispose();
  });

  it('expands the spin to the ten-meter ring and reports the jump landing shake', () => {
    const scene = new THREE.Scene();
    let heavyImpacts = 0;
    const vfx = new WarriorAttackWaveVFX(scene, () => { heavyImpacts += 1; });

    vfx.play('ataque_giratorio', new THREE.Vector3(), new THREE.Vector3(1, 0, 0));
    const spin = scene.getObjectByName('WarriorAttackWave');
    const ring = spin?.getObjectByName('WarriorSpinWave') as THREE.Mesh | undefined;
    vfx.update(0.45);
    expect(ring?.scale.x).toBeGreaterThan(4);

    vfx.play('pulo_atacando', new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
    expect(heavyImpacts).toBe(1);
    vfx.clear();
    vfx.dispose();
  });
});
