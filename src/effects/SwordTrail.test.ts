import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createRuntimeWarriorSword } from '../characters/RuntimeWarriorWeapon';
import { SwordTrail } from './SwordTrail';

function anchoredSword(): THREE.Group {
  const sword = new THREE.Group();
  const base = new THREE.Object3D();
  base.name = 'VFX_SwordBase';
  base.position.set(0, 0, -0.72);
  const tip = new THREE.Object3D();
  tip.name = 'VFX_SwordTip';
  tip.position.set(0, 0, 0.97);
  const impact = new THREE.Object3D();
  impact.name = 'VFX_Impact';
  impact.position.set(0, 0, 0.82);
  sword.add(base, tip, impact);
  return sword;
}

describe('SwordTrail', () => {
  it('keeps one geometry and fixed attributes while opening and closing', () => {
    const trail = new SwordTrail();
    const sword = createRuntimeWarriorSword();
    const geometry = trail.object.geometry;
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    expect(position.count / 2).toBeGreaterThanOrEqual(32);

    trail.attach(sword);
    trail.setActive(true);
    trail.update();

    expect(trail.object.visible).toBe(true);
    expect(trail.object.geometry).toBe(geometry);
    expect(trail.object.geometry.getAttribute('position')).toBe(position);
    expect(trail.object.geometry.getAttribute('uv')).toBe(uv);

    trail.setActive(false);
    trail.update();
    expect(trail.object.visible).toBe(false);

    trail.dispose();
    sword.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry !== geometry) mesh.geometry.dispose();
    });
  });

  it('is safe when no sword is attached', () => {
    const trail = new SwordTrail();
    expect(() => {
      trail.setActive(true);
      trail.update();
      trail.setActive(false);
      trail.update();
      trail.dispose();
    }).not.toThrow();
  });

  it('seeds every history segment at the blade and varies direction by combo stage', () => {
    const trail = new SwordTrail();
    const sword = createRuntimeWarriorSword();
    trail.attach(sword);

    const firstPointForStage = (stage: number) => {
      trail.setStageDirection(stage);
      trail.setActive(true);
      trail.update();
      const values = Array.from(trail.object.geometry.getAttribute('position').array);
      for (let offset = 0; offset < values.length; offset += 6) {
        expect(values.slice(offset, offset + 6).some((value) => Math.abs(value) > 0.0001)).toBe(true);
        expect(values.slice(offset, offset + 6)).toEqual(values.slice(0, 6));
      }
      trail.setActive(false);
      return values.slice(0, 6);
    };

    const stageZero = firstPointForStage(0);
    const stageOne = firstPointForStage(1);
    const stageTwo = firstPointForStage(2);

    expect(stageZero).not.toEqual(stageOne);
    expect(stageOne).not.toEqual(stageTwo);
    expect(stageZero).not.toEqual(stageTwo);
    trail.dispose();
  });

  it('follows explicit sword anchors and emits only pooled finite particles', () => {
    const trail = new SwordTrail();
    const sword = anchoredSword();
    const tip = sword.getObjectByName('VFX_SwordTip');
    if (!tip) throw new Error('tip fixture missing');

    trail.attach(sword);
    trail.setAttack('ataque_giratorio');
    trail.setActive(true);
    trail.update(0);
    tip.position.x = 0.4;
    trail.update(1 / 60);
    trail.burst();

    expect(trail.object.visible).toBe(true);
    expect(trail.activeParticleCount).toBeGreaterThan(0);
    expect(trail.activeParticleCount).toBeLessThanOrEqual(128);
    expect(Array.from(trail.object.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);

    trail.setActive(false);
    expect(trail.object.visible).toBe(false);
    expect(trail.activeParticleCount).toBe(0);
    trail.dispose();
    expect(() => trail.dispose()).not.toThrow();
  });

  it('preserves a visible history when the whole sword moves rigidly', () => {
    const stableRoot = new THREE.Group();
    const sword = anchoredSword();
    stableRoot.add(sword);
    const trail = new SwordTrail();

    trail.attach(sword);
    trail.setActive(true);
    stableRoot.updateMatrixWorld(true);
    trail.update(1 / 60);

    sword.rotation.y = Math.PI / 2;
    stableRoot.updateMatrixWorld(true);
    trail.update(1 / 60);

    const positions = Array.from(trail.object.geometry.getAttribute('position').array);
    expect(positions.slice(0, 6)).not.toEqual(positions.slice(6, 12));
    trail.dispose();
  });

  it('changes the ribbon material to the selected attack colors', () => {
    const trail = new SwordTrail();
    trail.attach(anchoredSword());
    trail.setAttack('triplo_ataque');

    expect((trail.object.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xffb11a);
    trail.dispose();
  });

  it('keeps particles and ribbon visible during a controlled fade', () => {
    const trail = new SwordTrail();
    trail.attach(anchoredSword());
    trail.setAttack('ataque_giratorio');
    trail.setActive(true);
    trail.update(1 / 60);
    trail.burst();

    trail.beginFade(0.6);
    trail.update(0.3);

    expect(trail.object.visible).toBe(true);
    expect(trail.activeParticleCount).toBeGreaterThan(0);

    trail.update(0.31);
    expect(trail.object.visible).toBe(false);
    trail.dispose();
  });

  it('keeps the ribbon root visible for the whole fade without particles', () => {
    const trail = new SwordTrail();
    trail.attach(anchoredSword());
    trail.setAttack('ataque_giratorio');
    trail.setActive(true);
    trail.update(0);

    trail.beginFade(0.8);
    trail.update(0.4);

    expect(trail.object.visible).toBe(true);
    expect(trail.object.parent?.visible).toBe(true);
    trail.dispose();
  });

  it('accepts transparent texture maps for trail, impact, sparks and smoke', () => {
    const trail = new SwordTrail();
    const spark = new THREE.Texture();
    const smoke = new THREE.Texture();
    const slash = new THREE.Texture();
    const impact = new THREE.Texture();
    const flame = new THREE.Texture();

    trail.setVisualTextures({ spark, smoke, slash, impact, flame });

    expect(trail.visualTextures).toEqual({ spark, smoke, slash, impact, flame });
    trail.dispose();
  });

  it('loads the licensed runtime texture paths through an injectable loader', async () => {
    const trail = new SwordTrail();
    const urls: string[] = [];
    const loader = {
      async loadAsync(url: string) {
        urls.push(url);
        return new THREE.Texture();
      },
    };

    await expect(trail.loadTextureAssets(loader)).resolves.toBe(true);
    expect(urls).toEqual([
      '/vfx/warrior/soft-glow.png',
      '/vfx/warrior/smoke.png',
      '/vfx/warrior/slash-arc.png',
      '/vfx/warrior/impact-flare.png',
      '/vfx/warrior/flame.png',
    ]);
    const textures = trail.visualTextures;
    expect(textures.slash?.repeat.toArray()).toEqual([0.82, 0.26]);
    expect(textures.slash?.offset.toArray()).toEqual([0.09, 0.38]);
    expect(textures.flame?.repeat.toArray()).toEqual([0.22, 0.54]);
    expect(textures.flame?.offset.toArray()).toEqual([0.39, 0.23]);
    trail.dispose();
  });
});
