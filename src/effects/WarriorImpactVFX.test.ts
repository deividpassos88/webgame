import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WarriorImpactVFX } from './WarriorImpactVFX';

function textureLoader() {
  return {
    async loadAsync(): Promise<THREE.Texture> {
      return new THREE.Texture();
    },
  };
}

describe('WarriorImpactVFX', () => {
  it('loads the shared warrior sprites into the fixed impact pool', async () => {
    const scene = new THREE.Scene();
    const vfx = new WarriorImpactVFX(scene);
    const urls: string[] = [];
    await expect(vfx.loadTextureAssets({
      async loadAsync(url: string) {
        urls.push(url);
        return new THREE.Texture();
      },
    })).resolves.toBe(true);

    expect(urls).toEqual([
      '/vfx/warrior/impact-flare.png',
      '/vfx/warrior/soft-glow.png',
    ]);
    vfx.dispose();
  });

  it('plays a distinct target impact for every skill hit and fades it out', () => {
    const scene = new THREE.Scene();
    const vfx = new WarriorImpactVFX(scene);
    vfx.play('triplo_ataque', new THREE.Vector3(1, 2, 3), 1);
    vfx.play('pulo_atacando', new THREE.Vector3(-1, 1, 0));

    expect(vfx.activeCount).toBe(2);
    expect(scene.getObjectByName('WarriorAttackImpact')).toBeDefined();

    for (let frame = 0; frame < 60; frame += 1) vfx.update(1 / 60);
    expect(vfx.activeCount).toBe(0);
    expect(scene.getObjectByName('WarriorAttackImpact')?.visible).toBe(false);
    vfx.dispose();
  });
});
