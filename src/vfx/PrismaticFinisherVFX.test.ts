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

  it('reconstrói a explosão da referência em seis blocos 3D com fases e cleanup', () => {
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
      effect.detonate(impact); // Detonation is idempotent.

      const core = effect.group.getObjectByName('MagePrismExplosionCore') as THREE.Sprite;
      const disc = effect.group.getObjectByName('MagePrismExplosionGroundDisc') as THREE.Mesh;
      const halo = effect.group.getObjectByName('MagePrismExplosionOuterHalo') as THREE.Mesh;
      const burst = effect.group.getObjectByName('MagePrismExplosionLightningBurst') as THREE.Group;
      const orbits = ['MagePrismExplosionOrbitA', 'MagePrismExplosionOrbitB', 'MagePrismExplosionOrbitC']
        .map((name) => effect.group.getObjectByName(name) as THREE.Mesh);
      const rising = effect.group.getObjectByName('MagePrismExplosionFragmentsAscending') as THREE.InstancedMesh;
      const field = effect.group.getObjectByName('MagePrismaticFinalExplosionField')!;
      const volume = effect.group.getObjectByName('MagePrismVolumetricBlast') as THREE.Mesh;

      expect(field).toBeDefined();
      expect(core).toBeDefined();
      expect(disc).toBeDefined();
      expect(halo).toBeDefined();
      expect(burst.children).toHaveLength(7);
      expect(orbits.every(Boolean)).toBe(true);
      expect(rising.count).toBeGreaterThan(40);

      // Charge: cyan floor and a white center, no flash or orbits yet.
      expect(effect.update(0.06)).toBe(true);
      expect(core.material.opacity).toBeGreaterThan(0.1);
      expect((disc.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBeGreaterThan(0);
      expect((orbits[0].material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);

      // Rupture: seven physically thick lightning ribbons + intense white core.
      effect.update(0.14);
      expect(core.material.opacity).toBeGreaterThan(0.7);
      expect(burst.visible).toBe(true);
      const bolt = burst.children[0] as THREE.Mesh;
      expect((bolt.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBeGreaterThan(0.4);
      expect(bolt.geometry.getAttribute('position').count).toBeGreaterThan(12);

      // Vortex: three independently raised, rotating 3D ribbons.
      effect.update(0.31);
      for (const orbit of orbits) {
        expect((orbit.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBeGreaterThan(0.4);
        const coords = orbit.geometry.getAttribute('position') as THREE.BufferAttribute;
        expect(coords.getY(0)).not.toBeCloseTo(coords.getY(10), 3);
      }
      expect(burst.visible).toBe(false);
      expect((rising.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0);
      expect((volume.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);

      // Fast fade: visually gone at 1.26s, even if the pooled object survives a few frames.
      effect.update(0.75);
      expect(core.material.opacity).toBe(0);
      expect((orbits[1].material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);
      expect((rising.material as THREE.MeshBasicMaterial).opacity).toBe(0);

      let alive = true;
      for (let i = 0; i < 20; i++) alive = effect.update(0.05);
      expect(alive).toBe(false);
      effect.reset();
      expect(effect.group.visible).toBe(false);
      expect(lightPool.availableCount).toBe(2);
      expect(core.material.opacity).toBe(0);
    } finally {
      effect.dispose();
      lightPool.dispose();
      resources.softGlow.dispose();
      resources.impactFlare.dispose();
    }
  });
});
