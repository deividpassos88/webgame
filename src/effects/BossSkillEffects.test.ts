import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BossSkillEvent } from '../entities/BossSkillController';
import { BossSkillEffects } from './BossSkillEffects';

function event(type: BossSkillEvent['type'], skill: BossSkillEvent['skill'] = 'circle'): BossSkillEvent {
  const warningSeconds = { circle: 4.2, rectangle: 3.5, meteors: 1 }[skill];
  return {
    type,
    skill,
    secondsUntilImpact: type === 'telegraph' ? warningSeconds : 0,
    origin: new THREE.Vector3(0, 0, 0),
    target: new THREE.Vector3(0, 0, 5),
    meteorPoints: Array.from(
      { length: 30 },
      (_, index) => new THREE.Vector3(index - 15, 0, 5)
    ),
  };
}

function sceneMaterials(scene: THREE.Scene): THREE.Material[] {
  const materials: THREE.Material[] = [];
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    materials.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
  });
  return materials;
}

describe('BossSkillEffects', () => {
  it.each(['circle', 'rectangle', 'meteors'] as const)(
    'creates a lightweight transparent warning for %s',
    (skill) => {
      const scene = new THREE.Scene();
      const effects = new BossSkillEffects(scene);

      effects.handle(event('telegraph', skill));

      expect(effects.activeObjectCount).toBeGreaterThan(0);
      const materials = sceneMaterials(scene) as THREE.MeshBasicMaterial[];
      expect(materials.length).toBeGreaterThan(0);
      expect(materials.every((material) => material.transparent)).toBe(true);
      expect(materials.every((material) => material.depthWrite === false)).toBe(true);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) expect(mesh.castShadow).toBe(false);
      });
    }
  );

  it('keeps the circle fire visible for 2.2 seconds and covers more than its center', () => {
    const scene = new THREE.Scene();
    const effects = new BossSkillEffects(scene);
    effects.handle(event('telegraph'));

    effects.handle(event('impact'));
    expect(effects.activeObjectCount).toBeGreaterThan(0);
    effects.update(1.2);
    expect(effects.activeObjectCount).toBeGreaterThan(0);
    expect(scene.getObjectsByProperty('name', 'boss-fire-blast').length).toBeGreaterThan(1);
    effects.update(1.1);

    expect(effects.activeObjectCount).toBe(0);
  });

  it('removes the rectangle impact after its shorter lifetime', () => {
    const scene = new THREE.Scene();
    const effects = new BossSkillEffects(scene);

    effects.handle(event('impact', 'rectangle'));
    effects.update(1.2);

    expect(effects.activeObjectCount).toBe(0);
  });

  it('keeps a single inactive impact light in the scene between skills', () => {
    const scene = new THREE.Scene();
    const effects = new BossSkillEffects(scene);
    const lights = () => scene.children.filter((object) => object instanceof THREE.PointLight);

    expect(lights()).toHaveLength(1);
    expect((lights()[0] as THREE.PointLight).intensity).toBe(0);

    effects.handle(event('impact', 'circle'));
    expect(lights()).toHaveLength(1);
    expect((lights()[0] as THREE.PointLight).intensity).toBeGreaterThan(0);

    effects.update(2.3);
    expect(effects.activeObjectCount).toBe(0);
    expect(lights()).toHaveLength(1);
    expect((lights()[0] as THREE.PointLight).intensity).toBe(0);
  });

  it('renders the expanded circle and triple-width rectangle while preserving meteor size', () => {
    const scene = new THREE.Scene();
    const effects = new BossSkillEffects(scene);

    effects.handle(event('telegraph', 'circle'));
    let circle = scene.getObjectByProperty('type', 'Mesh') as THREE.Mesh;
    expect((circle.geometry as THREE.CircleGeometry).parameters.radius).toBe(17.5);

    effects.handle(event('telegraph', 'rectangle'));
    const rectangle = scene.getObjectByProperty('type', 'Mesh') as THREE.Mesh;
    expect((rectangle.geometry as THREE.PlaneGeometry).parameters).toMatchObject({
      width: 24,
      height: 120,
    });

    effects.handle(event('telegraph', 'meteors'));
    circle = scene.getObjectByProperty('type', 'Mesh') as THREE.Mesh;
    expect((circle.geometry as THREE.CircleGeometry).parameters.radius).toBe(1.35);
    expect(scene.getObjectsByProperty('name', 'boss-meteor-core')).toHaveLength(30);
    expect(scene.getObjectByName('boss-meteor-smoke')).toBeTruthy();
  });

  it('syncs the meteor fall with the one-second warning', () => {
    const scene = new THREE.Scene();
    const effects = new BossSkillEffects(scene);
    effects.handle(event('telegraph', 'meteors'));
    const core = scene.getObjectByName('boss-meteor-core')!;

    effects.update(1);

    expect(core.position.y).toBeCloseTo(core.userData.groundY, 5);
  });

  it('clear removes objects and disposes their geometry and material', () => {
    const scene = new THREE.Scene();
    const effects = new BossSkillEffects(scene);
    effects.handle(event('telegraph', 'meteors'));
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        .forEach((material) => materials.add(material));
    });
    let disposedGeometries = 0;
    let disposedMaterials = 0;
    geometries.forEach((geometry) => geometry.addEventListener('dispose', () => disposedGeometries++));
    materials.forEach((material) => material.addEventListener('dispose', () => disposedMaterials++));

    effects.clear();

    expect(effects.activeObjectCount).toBe(0);
    expect(disposedGeometries).toBe(geometries.size);
    expect(disposedMaterials).toBe(materials.size);
  });
});
