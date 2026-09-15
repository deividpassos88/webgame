import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GameLightingRig } from './GameLightingRig';

describe('GameLightingRig', () => {
  it('keeps a soft light above the moving player', () => {
    const scene = new THREE.Scene();
    const rig = new GameLightingRig(scene);

    rig.update(new THREE.Vector3(4, 1, -3), null);

    expect(rig.playerLight.position.toArray()).toEqual([4, 6, -3]);
    expect(rig.playerLight.intensity).toBe(30);
    expect(rig.playerLight.distance).toBe(18);
    const moon = scene.children.find((child) => child instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
    expect(moon.shadow.mapSize.toArray()).toEqual([1024, 1024]);
  });

  it('keeps the player inside the camera fog band while hiding distant corners', () => {
    const scene = new THREE.Scene();

    new GameLightingRig(scene);

    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    expect((scene.fog as THREE.Fog).near).toBe(30);
    expect((scene.fog as THREE.Fog).far).toBe(50);
    expect((scene.fog as THREE.Fog).color.getHex()).toBe(0x060912);
    expect((scene.background as THREE.Color).getHex()).toBe(0x060912);
    const ambient = scene.children.find((child) => child instanceof THREE.AmbientLight);
    expect((ambient as THREE.AmbientLight).intensity).toBeLessThanOrEqual(0.45);
  });

  it('keeps the boss light in the renderer and changes only its intensity', () => {
    const scene = new THREE.Scene();
    const rig = new GameLightingRig(scene);

    rig.update(new THREE.Vector3(), null);
    expect(rig.bossLight.visible).toBe(true);
    expect(rig.bossLight.intensity).toBe(0);

    rig.update(new THREE.Vector3(), new THREE.Vector3(-7, 2, 8));
    expect(rig.bossLight.visible).toBe(true);
    expect(rig.bossLight.intensity).toBe(28);
    expect(rig.bossLight.position.toArray()).toEqual([-7, 8, 9]);

    rig.update(new THREE.Vector3(), null);
    expect(rig.bossLight.visible).toBe(true);
    expect(rig.bossLight.intensity).toBe(0);
  });
});
