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
      expect(PRISM_FINISHER.missileCount).toBe(24);
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
      effect.update(0.45);
      const active = effect.group.children.filter((x) => x.name === 'MagePrismHomingMissile' && x.visible);
      expect(active.length).toBeGreaterThan(8);
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
      const field = effect.group.getObjectByName('MagePrismaticFinalExplosionField');
      expect(field).toBeDefined();
      expect(effect.group.getObjectByName('MagePrismVolumetricBlast')).toBeDefined();
      const shockfront = effect.group.getObjectByName('MagePrismShockFront') as THREE.Mesh;
      expect(shockfront).toBeDefined();
      expect(shockwave.visible).toBe(false);
      const spiral = effect.group.getObjectByName('MagePrismSpiralVortex') as THREE.Mesh;
      const horizontalFlash = effect.group.getObjectByName('MagePrismExplosionHorizontalFlash') as THREE.Sprite;
      const jets = effect.group.getObjectByName('MagePrismLaserRuptureJets') as THREE.InstancedMesh;
      expect(spiral).toBeDefined();
      expect(horizontalFlash).toBeDefined();
      expect(jets.count).toBeGreaterThan(40);
      // Before the flash: magenta charged ring, white center and cyan lightning.
      expect(effect.update(0.06)).toBe(true);
      expect((whiteCore.material as THREE.SpriteMaterial).opacity).toBeGreaterThan(0);
      const spiralMat = spiral.material as THREE.ShaderMaterial;
      expect(spiralMat.uniforms.uOpacity.value).toBeGreaterThan(0.6);
      expect((horizontalFlash.material as THREE.SpriteMaterial).opacity).toBeLessThan(0.1);
      expect((jets.material as THREE.MeshBasicMaterial).opacity).toBe(0);

      // Detonation: white horizontal flare and 3D shards without a giant shield.
      effect.update(0.26);
      expect((horizontalFlash.material as THREE.SpriteMaterial).opacity).toBeGreaterThan(0.7);
      expect((jets.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0);
      expect((shockfront.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBeGreaterThan(0);
      const volume = effect.group.getObjectByName('MagePrismVolumetricBlast') as THREE.Mesh;
      expect(volume.scale.x).toBeLessThan(2.4);

      // Rotation and residual glow continue after the flash, but no bubble.
      effect.update(0.50);
      expect(spiralMat.uniforms.uOpacity.value).toBeGreaterThan(0.3);
      expect((horizontalFlash.material as THREE.SpriteMaterial).opacity).toBeLessThan(0.01);
      expect((volume.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);
      expect((jets.material as THREE.MeshBasicMaterial).opacity).toBeLessThan(0.25);
      effect.update(0.22);
      expect((jets.material as THREE.MeshBasicMaterial).opacity).toBe(0);
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
