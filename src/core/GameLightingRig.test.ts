import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GameLightingRig } from './GameLightingRig';

describe('GameLightingRig - Campo dos Deuses', () => {
  it('keeps warm player light above the character during celestial battles', () => {
    const scene = new THREE.Scene();
    const rig = new GameLightingRig(scene);
    rig.update(new THREE.Vector3(4, 1, -3), null);
    expect(rig.playerLight.position.toArray()).toEqual([4, 6, -3]);
    expect(rig.playerLight.intensity).toBeGreaterThan(0);
    expect(rig.playerLight.distance).toBe(18);
    const sun = scene.children.find(
      child => child instanceof THREE.DirectionalLight
    ) as THREE.DirectionalLight;
    expect(sun.name).toBe('CelestialSunLight');
    expect(sun.shadow.mapSize.toArray()).toEqual([1024, 1024]);
  });

  it('keeps marble combat visible and fades only the distant temples into daylight', () => {
    const scene = new THREE.Scene();
    new GameLightingRig(scene);
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    expect((scene.fog as THREE.Fog).near).toBe(105);
    expect((scene.fog as THREE.Fog).far).toBe(205);
    expect((scene.fog as THREE.Fog).color.getHex()).toBe(0xb2d8ff);
    expect((scene.background as THREE.Color).getHex()).toBe(0xb2d8ff);
    const ambient = scene.children.find(child => child instanceof THREE.AmbientLight) as THREE.AmbientLight;
    expect(ambient.intensity).toBeGreaterThan(0.4);
    expect(ambient.intensity).toBeLessThan(0.6);
  });

  it('still updates the boss light dynamically on the divine platform', () => {
    const scene = new THREE.Scene();
    const rig = new GameLightingRig(scene);
    rig.update(new THREE.Vector3(), null);
    expect(rig.bossLight.visible).toBe(true);
    expect(rig.bossLight.intensity).toBe(0);
    rig.update(new THREE.Vector3(), new THREE.Vector3(-7, 2, 8));
    expect(rig.bossLight.intensity).toBe(16);
    expect(rig.bossLight.position.toArray()).toEqual([-7, 8, 9]);
  });
});
