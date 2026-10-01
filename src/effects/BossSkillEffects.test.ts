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

  it('draws the circle impact as a rich explosion that lingers, then disappears', () => {
    const scene = new THREE.Scene();
    const effects = new BossSkillEffects(scene);
    const impacts: string[] = [];
    effects.onImpact = (e) => impacts.push(e.skill);
    effects.handle(event('telegraph'));

    effects.handle(event('impact'));
    expect(impacts).toEqual(['circle']);
    expect(effects.activeObjectCount).toBeGreaterThan(0);
    for (const name of [
      'mini-boss-skill-impact',
      'mini-boss-skill-scorch',
      'mini-boss-skill-dome',
      'mini-boss-skill-fire-column',
    ]) {
      expect(scene.getObjectByName(name)).toBeTruthy();
    }
    expect(scene.getObjectsByProperty('type', 'Points').length).toBeGreaterThanOrEqual(3);
    effects.update(0.016); // creation frame never ages an effect
    effects.update(1.2);
    expect(effects.activeObjectCount).toBeGreaterThan(0);
    effects.update(1.4);

    expect(effects.activeObjectCount).toBe(0);
  });

  it('draws the rectangle impact with blast walls and removes it after its lifetime', () => {
    const scene = new THREE.Scene();
    const effects = new BossSkillEffects(scene);

    effects.handle(event('impact', 'rectangle'));
    expect(scene.getObjectsByProperty('name', 'mini-boss-skill-blast-wall')).toHaveLength(2);
    effects.update(0.016);
    effects.update(1.2);
    expect(effects.activeObjectCount).toBeGreaterThan(0);
    effects.update(1.2);

    expect(effects.activeObjectCount).toBe(0);
  });

  it('lands every meteor with its own blast, scorch and fire column', () => {
    const scene = new THREE.Scene();
    const effects = new BossSkillEffects(scene);

    effects.handle(event('telegraph', 'meteors'));
    effects.handle(event('impact', 'meteors'));

    expect(scene.getObjectsByProperty('name', 'boss-fire-blast')).toHaveLength(30);
    expect(scene.getObjectsByProperty('name', 'boss-meteor-fire-column')).toHaveLength(30);
    expect(scene.getObjectsByProperty('name', 'boss-meteor-core')).toHaveLength(0);
    for (let i = 0; i < 30; i += 1) effects.update(0.06);
    scene.traverse((object) => {
      const points = object as THREE.Points;
      if (!points.isPoints) return;
      for (const value of points.geometry.getAttribute('position').array as Float32Array) {
        expect(Number.isFinite(value)).toBe(true);
      }
    });
    effects.update(0.1);
    expect(effects.activeObjectCount).toBe(0);
  });

  it('gives the falling meteors a flaming tail', () => {
    const scene = new THREE.Scene();
    const effects = new BossSkillEffects(scene);
    effects.handle(event('telegraph', 'meteors'));

    expect(scene.getObjectsByProperty('name', 'boss-meteor-trail')).toHaveLength(30);
    expect(scene.getObjectsByProperty('name', 'boss-meteor-warning')).toHaveLength(30);
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

    effects.update(0.016);
    effects.update(2.9);
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
