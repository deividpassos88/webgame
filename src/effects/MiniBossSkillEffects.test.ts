import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type {
  MiniBossSkillEvent,
  MiniBossSkillKind,
} from '../combat/MiniBossSkillController';
import { MiniBossSkillEffects } from './MiniBossSkillEffects';

function event(
  type: MiniBossSkillEvent['type'],
  skill: MiniBossSkillKind = 'circle',
  ownerId = 'mini-a',
  target = new THREE.Vector3(0, 0, 5),
  origin = new THREE.Vector3(0, 0, 0)
): MiniBossSkillEvent {
  return {
    type,
    skill,
    ownerId,
    secondsUntilImpact: type === 'telegraph' || type === 'retarget'
      ? skill === 'circle' ? 4.2 : 3.5
      : 0,
    origin,
    target,
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

describe('MiniBossSkillEffects', () => {
  it('creates a lightweight red transparent circle warning with the approved radius', () => {
    const scene = new THREE.Scene();
    const effects = new MiniBossSkillEffects(scene);

    effects.handle(event('telegraph', 'circle'));

    const warning = scene.getObjectByName('mini-boss-skill-warning-circle') as THREE.Mesh;
    expect(warning).toBeTruthy();
    expect((warning.geometry as THREE.CircleGeometry).parameters.radius).toBe(8.75);
    expect((warning.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xff1f16);
    expect((warning.material as THREE.MeshBasicMaterial).transparent).toBe(true);
    expect((warning.material as THREE.MeshBasicMaterial).depthWrite).toBe(false);
    expect(warning.castShadow).toBe(false);
    expect(effects.activeObjectCount).toBe(1);
  });

  it('does not age an effect with elapsed time from before its creation frame', () => {
    const scene = new THREE.Scene();
    const effects = new MiniBossSkillEffects(scene);

    effects.handle(event('telegraph', 'circle'));
    effects.update(10);

    expect(scene.getObjectByName('mini-boss-skill-warning-circle')).toBeTruthy();
    expect(effects.activeObjectCount).toBe(1);

    effects.update(4.21);
    expect(effects.activeObjectCount).toBe(0);
  });

  it('creates the approved 60 by 12 rectangle warning without particle systems', () => {
    const scene = new THREE.Scene();
    const effects = new MiniBossSkillEffects(scene);

    effects.handle(event('telegraph', 'rectangle'));

    const warning = scene.getObjectByName('mini-boss-skill-warning-rectangle') as THREE.Mesh;
    expect(warning).toBeTruthy();
    expect((warning.geometry as THREE.PlaneGeometry).parameters).toMatchObject({
      width: 12,
      height: 60,
    });
    expect(scene.getObjectsByProperty('type', 'Points')).toHaveLength(0);
  });

  it('retargets an existing circle mesh in place for the matching owner and skill', () => {
    const scene = new THREE.Scene();
    const effects = new MiniBossSkillEffects(scene);

    effects.handle(event('telegraph', 'circle', 'mini-a'));
    const warning = scene.getObjectByName('mini-boss-skill-warning-circle') as THREE.Mesh;
    const geometry = warning.geometry;
    const material = warning.material;

    effects.handle(
      event('retarget', 'circle', 'mini-a', new THREE.Vector3(7, 0, 9))
    );

    expect(scene.getObjectByName('mini-boss-skill-warning-circle')).toBe(warning);
    expect(warning.geometry).toBe(geometry);
    expect(warning.material).toBe(material);
    expect(warning.position).toEqual(new THREE.Vector3(7, 0.05, 9));
    expect(effects.activeObjectCount).toBe(1);
  });

  it('rotates an existing rectangle mesh in place to the retarget direction', () => {
    const scene = new THREE.Scene();
    const effects = new MiniBossSkillEffects(scene);

    effects.handle(event('telegraph', 'rectangle', 'mini-a'));
    const warning = scene.getObjectByName('mini-boss-skill-warning-rectangle') as THREE.Mesh;
    const group = warning.parent as THREE.Group;
    const geometry = warning.geometry;

    effects.handle(
      event('retarget', 'rectangle', 'mini-a', new THREE.Vector3(5, 0, 0))
    );

    expect(scene.getObjectByName('mini-boss-skill-warning-rectangle')).toBe(warning);
    expect(warning.geometry).toBe(geometry);
    expect(group.rotation.y).toBeCloseTo(Math.PI / 2, 5);
    expect(group.position).toEqual(new THREE.Vector3(30, 0.05, 0));
    expect(effects.activeObjectCount).toBe(1);
  });

  it('uses the impact snapshot to finish the warning at the exact shown geometry', () => {
    const scene = new THREE.Scene();
    const effects = new MiniBossSkillEffects(scene);

    effects.handle(event('telegraph', 'circle', 'mini-a'));
    const warning = scene.getObjectByName('mini-boss-skill-warning-circle') as THREE.Mesh;
    const finalTarget = new THREE.Vector3(8, 0, 9);

    effects.handle(event('impact', 'circle', 'mini-a', finalTarget));

    expect(warning.position).toEqual(new THREE.Vector3(8, 0.05, 9));
    const impact = scene.getObjectByName('mini-boss-skill-impact') as THREE.Mesh;
    expect(impact.position).toEqual(new THREE.Vector3(8, 0.08, 9));
  });

  it('keeps concurrent mini-boss warnings and clears only the requested owner', () => {
    const scene = new THREE.Scene();
    const effects = new MiniBossSkillEffects(scene);

    effects.handle(event('telegraph', 'circle', 'mini-a'));
    effects.handle(event('telegraph', 'rectangle', 'mini-b'));

    expect(effects.activeObjectCount).toBe(2);
    effects.clear('mini-a');
    expect(effects.activeObjectCount).toBe(1);
    expect(scene.getObjectByName('mini-boss-skill-warning-circle')).toBeUndefined();
    expect(scene.getObjectByName('mini-boss-skill-warning-rectangle')).toBeTruthy();
  });

  it('adds an impact independently of its warning and fades both on their own timers', () => {
    const scene = new THREE.Scene();
    const effects = new MiniBossSkillEffects(scene);

    effects.handle(event('telegraph', 'circle'));
    effects.handle(event('impact', 'circle'));
    expect(effects.activeObjectCount).toBe(2);
    expect(scene.getObjectByName('mini-boss-skill-impact')).toBeTruthy();

    effects.update(0.1);
    effects.update(0.49);
    expect(effects.activeObjectCount).toBe(1);
    expect(scene.getObjectByName('mini-boss-skill-warning-circle')).toBeTruthy();

    effects.update(4.2);
    expect(effects.activeObjectCount).toBe(0);
  });

  it('clear disposes every owned geometry and material', () => {
    const scene = new THREE.Scene();
    const effects = new MiniBossSkillEffects(scene);
    effects.handle(event('telegraph', 'circle'));
    effects.handle(event('impact', 'rectangle'));

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

  it('ignores invalid or negative frame time without extending an effect lifetime', () => {
    const scene = new THREE.Scene();
    const effects = new MiniBossSkillEffects(scene);
    effects.handle(event('impact', 'circle'));

    effects.update(-10);
    expect(effects.activeObjectCount).toBe(1);
    effects.update(Number.NaN);
    expect(effects.activeObjectCount).toBe(1);
    effects.update(0.5);
    expect(effects.activeObjectCount).toBe(0);
  });
});
