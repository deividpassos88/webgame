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
    expect(level.group.getObjectByName('CelestialNorthGrandstand')).toBeDefined();
    expect(level.group.getObjectByName('CelestialNorthStadiumAudience')).toBeDefined();
    expect(level.group.getObjectByName('CelestialNorthClassicalArch')).toBeDefined();
    const northwest = level.group.getObjectByName('CelestialNorthWestGallery');
    const northeast = level.group.getObjectByName('CelestialNorthEastGallery');
    expect(northwest).toBeDefined();
    expect(northeast).toBeDefined();
    expect(level.group.getObjectByName('CelestialCentralOpenSkyVista')).toBeDefined();
    // No rear gallery can span the centre: otherwise the distant sky and
    // floating temples are hidden behind a continuous stadium wall.
    const westBounds = new THREE.Box3().setFromObject(northwest!);
    const eastBounds = new THREE.Box3().setFromObject(northeast!);
    expect(westBounds.max.x).toBeLessThan(-12);
    expect(eastBounds.min.x).toBeGreaterThan(12);
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
    const clouds = level.group.getObjectByName('CelestialVolumetricCloudBanks') as THREE.InstancedMesh;
    expect(clouds.count).toBeGreaterThan(800);
    expect(clouds.geometry).toBeInstanceOf(THREE.SphereGeometry);
    const marble = (level.groundMeshes[0] as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
    expect(marble.roughness).toBeGreaterThan(0.25);
    expect(marble.map?.name).toBe('CelestialMarblePBRAlbedo');
    expect(marble.bumpMap?.name).toBe('CelestialMarbleMicroRelief');
    expect(marble.roughnessMap?.name).toBe('CelestialMarblePolishedRoughness');
    expect(level.group.getObjectByName('CelestialSculptedPlatformFacade')).toBeDefined();
    expect(level.group.getObjectByName('CelestialPlatformArcades')).toBeInstanceOf(THREE.InstancedMesh);
    expect(level.group.getObjectByName('CelestialGrandstandBalustrades')).toBeDefined();
    expect(level.group.getObjectByName('CelestialGalleryStoneBalusters')).toBeInstanceOf(THREE.InstancedMesh);
    expect(level.group.getObjectByName('CelestialSculptedFloatingRock')).toBeDefined();
    expect(level.group.getObjectByName('CelestialFloatingIslandVegetation')).toBeInstanceOf(THREE.InstancedMesh);
    const waterfall = level.group.getObjectByName('CelestialIslandAnimatedWaterfall') as THREE.Mesh;
    expect(waterfall).toBeDefined();
    const waterMaterial = waterfall.material as THREE.MeshBasicMaterial;
    const initialOffset = waterMaterial.map?.offset.y;
    level.update(4.2);
    expect(waterMaterial.map?.offset.y).not.toEqual(initialOffset);
    expect(level.group.getObjectByName('CelestialFlameLuminousCore')).toBeDefined();
  });

  it('preserves the wave, boss and mini-boss spawn positions on the playing floor', () => {
    const level = new Level();
    expect(level.getWaveSpawnPoints()).toHaveLength(8);
    expect(level.getWaveSpawnPoints().every(p => Math.abs(p.x) < 25 && Math.abs(p.z) < 25)).toBe(true);
    expect(level.getBossSpawnPoint().toArray()).toEqual([0, 0, -18]);
    expect(level.getFinalBattleSpawnLayout().miniBosses).toHaveLength(4);
  });
});
