import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PrismaticFinisherEffect, PRISM_FINISHER } from './PrismaticFinisherVFX';
import { VFXLightPool } from './VFXLightPool';
import type { MageVFXResources } from './MageVFXResources';

function setup() {
  const scene = new THREE.Scene();
  const lightPool = new VFXLightPool(scene, 2);
  const resources = {
    softGlow: new THREE.Texture(),
    impactFlare: new THREE.Texture(),
  } as MageVFXResources;
  const effect = new PrismaticFinisherEffect(resources, 'high', lightPool);
  return { scene, lightPool, resources, effect };
}

describe('Raio Prismático - raios teleguiados e explosão de plasma', () => {
  it('lança seis feixes violetas curvos com geometria de laser e acompanha alvos móveis', () => {
    const { scene, lightPool, resources, effect } = setup();
    const target = new THREE.Group();
    target.position.set(3, 0, 7);
    scene.add(target);
    try {
      effect.play({
        start: new THREE.Vector3(0, 1, 0),
        endpoint: new THREE.Vector3(0, 1, 7),
        targets: [target],
        isTargetAlive: () => true,
      });
      scene.add(effect.group);
      expect(effect.group.getObjectByName('MagePrismHomingMissile')).toBeDefined();
      expect(effect.group.children.filter((x) => x.name === 'MagePrismHomingMissile')).toHaveLength(PRISM_FINISHER.missileCount);
      expect(effect.group.getObjectByName('MagePrismMissileCore')).toBeUndefined();
      expect(effect.group.getObjectByName('MagePrismMissileGlow')).toBeUndefined();
      expect(effect.group.getObjectByName('MagePrismHomingLaserCore')).toBeDefined();
      for (let i = 0; i < 10; i++) effect.update(0.04);
      const missile = effect.group.children.find((x) => x.name === 'MagePrismHomingMissile' && x.visible);
      expect(missile).toBeDefined();
      const before = missile!.position.clone();
      const core = missile!.getObjectByName('MagePrismHomingLaserCore') as THREE.Mesh;
      const positions = core.geometry.getAttribute('position');
      expect(positions.count).toBeGreaterThan(40);
      expect(positions.getX(9)).not.toBeNaN();
      target.position.set(6, 0, 7);
      effect.update(0.12);
      expect(missile!.position.distanceTo(before)).toBeGreaterThan(0.01);
    } finally {
      effect.dispose();
      lightPool.dispose();
      resources.softGlow.dispose();
      resources.impactFlare.dispose();
    }
  });

  it('detona uma explosão violeta com onda de choque, fragmentos e dissolução', () => {
    const { scene, lightPool, resources, effect } = setup();
    try {
      effect.play({
        start: new THREE.Vector3(0, 1, 0),
        endpoint: new THREE.Vector3(0, 1, 7),
        targets: [],
      });
      scene.add(effect.group);
      effect.update(1.8);
      const impact = new THREE.Vector3(0, 1.5, 7);
      effect.detonate(impact);
      // Mesmo com múltiplas solicitações, a detonação não reinicia.
      effect.detonate(impact);
      const shockwave = effect.group.getObjectByName('MagePrismExplosionShockwave') as THREE.Mesh;
      const whiteCore = effect.group.getObjectByName('MagePrismExplosionWhiteCore') as THREE.Sprite;
      expect(shockwave).toBeDefined();
      expect(whiteCore).toBeDefined();
      const plasma = effect.group.getObjectByName('MagePrismExplosionPlasma') as THREE.Mesh;
      expect(plasma.material).toBeInstanceOf(THREE.ShaderMaterial);
      expect(effect.group.getObjectByName('MagePrismExplosionBrokenShockwave')).toBeDefined();
      expect(effect.group.getObjectByName('MagePrismExplosionRadialLightning')).toBeDefined();
      expect(effect.update(0.06)).toBe(true);
      expect(shockwave.scale.x).toBeGreaterThan(0.2);
      expect((whiteCore.material as THREE.SpriteMaterial).opacity).toBeGreaterThan(0);
      let alive = true;
      for (let i = 0; i < 65; i++) alive = effect.update(0.04);
      expect(alive).toBe(false);
      effect.reset();
      expect(effect.group.visible).toBe(false);
      expect(lightPool.availableCount).toBe(2);
    } finally {
      effect.dispose();
      lightPool.dispose();
      resources.softGlow.dispose();
      resources.impactFlare.dispose();
    }
  });
});
