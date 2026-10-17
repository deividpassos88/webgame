import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Level } from './Level';

describe('Campo dos Deuses - arena celestial', () => {
  it('keeps the playable arena square while placing all stands beyond the combat boundary', () => {
    const level = new Level();
    const floor = level.groundMeshes[0] as THREE.Mesh;
    expect(floor.name).toBe('CelestialPlayableSmoothMarbleFloor');
    expect((floor.geometry as THREE.PlaneGeometry).parameters.width).toBe(49.5);
    expect((floor.geometry as THREE.PlaneGeometry).parameters.height).toBe(49.5);
    expect(level.navigationObstacles).toHaveLength(0);
    expect(level.group.getObjectByName('CelestialFloatingSquareFoundation')).toBeDefined();
    expect(level.group.getObjectByName('CelestialEastGrandstand')).toBeDefined();
    expect(level.group.getObjectByName('CelestialWestGrandstand')).toBeDefined();
  });

  it('renders four ceremonial braziers without the old dungeon torch pool', () => {
    const level = new Level();
    const lights = level.group.children.filter(
      (child): child is THREE.PointLight => child instanceof THREE.PointLight
    );
    expect(lights).toHaveLength(4);
    expect(lights.every((l) => l.name.startsWith('CelestialBrazierLight'))).toBe(true);
    const before = lights.map(l => l.intensity);
    level.update(1.1, new THREE.Vector3());
    expect(lights.some((l, i) => l.intensity !== before[i])).toBe(true);
    expect(level.group.getObjectByName('CelestialVolumetricCloudBanks')).toBeDefined();
    expect(level.group.getObjectByName('CelestialSkydomeSun')).toBeDefined();
  });

  it('preserves the wave, boss and mini-boss spawn positions on the playing floor', () => {
    const level = new Level();
    expect(level.getWaveSpawnPoints()).toHaveLength(8);
    expect(level.getWaveSpawnPoints().every(p => Math.abs(p.x) < 25 && Math.abs(p.z) < 25)).toBe(true);
    expect(level.getBossSpawnPoint().toArray()).toEqual([0, 0, -18]);
    expect(level.getFinalBattleSpawnLayout().miniBosses).toHaveLength(4);
  });
});
