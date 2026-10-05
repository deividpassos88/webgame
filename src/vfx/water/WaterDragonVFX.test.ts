import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MageVFXResources } from '../MageVFXResources';
import { VFXLightPool } from '../VFXLightPool';
import type { MageVFXQuality } from '../VFXTypes';
import { WATER_DRAGON_SHAPE } from './WaterDragonGeometry';
import {
  WaterDragonVFX, WATER_DRAGON_FALL_SECONDS, WATER_DRAGON_POOL_LIMITS,
} from './WaterDragonVFX';

const cleanup: Array<() => void> = [];
function setup(quality: MageVFXQuality = 'high') {
  const scene = new THREE.Scene();
  const resources = new MageVFXResources();
  const lights = new VFXLightPool(scene, 4);
  const water = new WaterDragonVFX(scene, resources, lights, quality);
  const caster = new THREE.Group();
  caster.position.set(2, 0, 3);
  const target = new THREE.Group();
  target.position.set(0, 0, 5);
  cleanup.push(() => { water.dispose(); lights.dispose(); resources.dispose(); });
  return { scene, resources, lights, water, caster, target };
}

beforeEach(() => {
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
});
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
});

describe('Dragão das Marés pooled water effects', () => {
  it('builds broad blue sheets and a long dragon head around the caster, not a hand orb or bubble', () => {
    const { scene, water, caster } = setup();
    water.charge(caster);
    water.update(0.3);
    const charge = scene.getObjectByName('MageWaterDragonChargeVFX')!;
    expect(charge.position.toArray()).toEqual(caster.position.toArray());
    expect(charge.getObjectByName('WaterDragonHead')).toBeDefined();
    expect(charge.getObjectByName('WaterDragonLongSnout')).toBeDefined();
    expect(charge.getObjectByName('WaterDragonLowerJaw')).toBeDefined();
    expect(charge.getObjectByName('WaterDragonLowerFoam')).toBeDefined();
    expect(scene.getObjectByName('MageChargeOrbVFX')).toBeUndefined();
    expect(scene.getObjectByName('MageSkillThinSoapBubbleFilm')).toBeUndefined();
    const ribbon = charge.getObjectByName('WaterDragonBroadRibbon') as THREE.Mesh;
    const material = ribbon.material as THREE.ShaderMaterial;
    expect(material.blending).toBe(THREE.NormalBlending);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.forceSinglePass).toBe(true);
    expect(material.uniforms.uOpacity.value).toBeGreaterThan(0.8);
    const box = new THREE.Box3().setFromBufferAttribute(ribbon.geometry.getAttribute('position') as THREE.BufferAttribute);
    expect(box.getSize(new THREE.Vector3()).y).toBeGreaterThan(WATER_DRAGON_SHAPE.height);
    expect(box.getSize(new THREE.Vector3()).x).toBeGreaterThan(4);
  });

  it('advects the water, rotates the spiral and follows world-space caster movement', () => {
    const { scene, water, caster } = setup();
    const parent = new THREE.Group(); parent.position.set(4, 0, -2); parent.add(caster);
    water.charge(caster);
    water.update(0.2);
    const charge = scene.getObjectByName('MageWaterDragonChargeVFX')!;
    const spiral = charge.getObjectByName('WaterDragonSpiral')!;
    const ribbon = charge.getObjectByName('WaterDragonBroadRibbon') as THREE.Mesh;
    const material = ribbon.material as THREE.ShaderMaterial;
    const yaw = spiral.rotation.y;
    const time = material.uniforms.uTime.value;
    caster.position.x += 1;
    water.update(0.12);
    expect(charge.position.toArray()).toEqual(caster.getWorldPosition(new THREE.Vector3()).toArray());
    expect(spiral.rotation.y).not.toBe(yaw);
    expect(material.uniforms.uTime.value).toBeGreaterThan(time);
  });

  it('dissolves the released spiral and reuses its geometry on the next charge', () => {
    const { scene, water, caster, lights } = setup();
    const handle = water.charge(caster)!;
    water.update(0.4);
    const charge = scene.getObjectByName('MageWaterDragonChargeVFX')!;
    const ribbon = charge.getObjectByName('WaterDragonBroadRibbon') as THREE.Mesh;
    handle.release(); handle.release();
    water.update(0.14);
    expect(water.activeCharges).toBe(1);
    expect((ribbon.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBeLessThan(0.6);
    water.update(0.15);
    expect(water.activeCharges).toBe(0);
    expect(water.pooledCharges).toBe(1);
    expect(charge.parent).toBeNull();
    expect(lights.availableCount).toBe(lights.size);
    water.charge(caster);
    expect(scene.getObjectByName('MageWaterDragonChargeVFX')).toBe(charge);
    expect((charge.getObjectByName('WaterDragonBroadRibbon') as THREE.Mesh).geometry).toBe(ribbon.geometry);
  });

  it.each(['low', 'high'] as const)('hits once after the sky descent, then fades the ground splash (%s quality)', (quality) => {
    const { scene, water, target, lights } = setup(quality);
    const onImpact = vi.fn();
    water.strike({ position: target.position, target, onImpact });
    const strike = scene.getObjectByName('MageWaterDragonSkyStrikeVFX')!;
    const column = strike.getObjectByName('WaterDragonDescendingColumn')!;
    const splash = strike.getObjectByName('WaterDragonImpactCrown')!;
    expect(column.position.y).toBe(WATER_DRAGON_SHAPE.columnHeight);
    expect(splash.visible).toBe(false);
    water.update(WATER_DRAGON_FALL_SECONDS - 0.01);
    expect(column.position.y).toBeGreaterThan(0);
    expect(onImpact).not.toHaveBeenCalled();
    water.update(0.02);
    expect(column.position.y).toBe(0);
    expect(splash.visible).toBe(true);
    expect(onImpact).toHaveBeenCalledTimes(1);
    expect(onImpact.mock.calls[0][1]).toBe(target);
    expect(splash.getObjectByName('WaterDragonPointedSplash')).toBeDefined();
    expect(splash.getObjectByName('WaterDragonBrokenImpactArcs')).toBeDefined();
    water.update(1);
    expect(onImpact).toHaveBeenCalledTimes(1);
    expect(water.activeStrikes).toBe(0);
    expect(water.pooledStrikes).toBe(1);
    expect(strike.parent).toBeNull();
    expect(lights.availableCount).toBe(lights.size);
  });

  it('tracks the enemy only during descent and leaves the splash on its landing position', () => {
    const { scene, water, target } = setup();
    const onImpact = vi.fn();
    water.strike({ position: target.position, target, isTargetAlive: () => true, onImpact });
    target.position.x = 2;
    water.update(0.1);
    const strike = scene.getObjectByName('MageWaterDragonSkyStrikeVFX')!;
    expect(strike.position.x).toBe(2);
    target.position.x = 3;
    water.update(0.13);
    expect(onImpact.mock.calls[0][0].x).toBe(3);
    target.position.x = 8;
    water.update(0.1);
    expect(strike.position.x).toBe(3);
    expect(onImpact).toHaveBeenCalledTimes(1);
  });

  it.each(['dead', 'absent'] as const)('still lands safely without hitting a %s target', (state) => {
    const { water, target } = setup();
    const position = new THREE.Vector3(1, 0, 4);
    const onImpact = vi.fn();
    water.strike({ position, target: state === 'absent' ? null : target, isTargetAlive: () => false, onImpact });
    water.update(0.23);
    expect(onImpact).toHaveBeenCalledTimes(1);
    expect(onImpact.mock.calls[0][0].toArray()).toEqual(position.toArray());
    expect(onImpact.mock.calls[0][1]).toBeNull();
  });

  it('does not hit an enemy killed while the column is falling', () => {
    const { water, target } = setup();
    let alive = true;
    const onImpact = vi.fn();
    water.strike({ position: target.position, target, isTargetAlive: () => alive, onImpact });
    water.update(0.1);
    alive = false;
    target.position.x = 20;
    water.update(0.13);
    expect(onImpact).toHaveBeenCalledWith(new THREE.Vector3(0, 0, 5), null);
  });

  it('caps GPU effects without accelerating or dropping hits when the pool is full', () => {
    const { water, target } = setup();
    const callbacks = Array.from({ length: WATER_DRAGON_POOL_LIMITS.strikes + 2 }, () => vi.fn());
    for (const onImpact of callbacks) water.strike({ position: target.position, target, onImpact });
    expect(water.activeStrikes).toBe(WATER_DRAGON_POOL_LIMITS.strikes);
    water.update(0.1);
    for (const callback of callbacks) expect(callback).not.toHaveBeenCalled();
    water.update(0.13);
    for (const callback of callbacks) expect(callback).toHaveBeenCalledTimes(1);
    water.update(2);
    for (const callback of callbacks) expect(callback).toHaveBeenCalledTimes(1);
    expect(water.activeStrikes).toBe(0);
    expect(water.pooledStrikes).toBe(WATER_DRAGON_POOL_LIMITS.strikes);
  });

  it('clears both visible and overflow hits before their impact, returning all lights', () => {
    const { scene, water, caster, target, lights } = setup();
    const onImpact = vi.fn();
    for (let i = 0; i < 9; i += 1) {
      water.charge(caster);
      water.strike({ position: target.position, target, onImpact });
    }
    expect(water.activeCharges).toBe(WATER_DRAGON_POOL_LIMITS.charges);
    water.clear(); water.update(2);
    expect(onImpact).not.toHaveBeenCalled();
    expect(water.activeCharges).toBe(0);
    expect(water.activeStrikes).toBe(0);
    expect(scene.getObjectByName('MageWaterDragonSkyStrikeVFX')).toBeUndefined();
    expect(lights.availableCount).toBe(lights.size);
  });

  it.each(['clear', 'dispose'] as const)('does not resurrect an effect when its damage callback calls %s', (method) => {
    const { water, target } = setup();
    const onImpact = vi.fn(() => water[method]());
    water.strike({ position: target.position, target, onImpact });
    water.update(0.23); water.update(1);
    expect(onImpact).toHaveBeenCalledTimes(1);
    expect(water.activeStrikes).toBe(0);
    if (method === 'dispose') expect(water.pooledStrikes).toBe(0);
  });

  it('reuses a stable number of geometry objects across twenty complete casts', () => {
    const { water, caster, target, lights } = setup();
    const onImpact = vi.fn();
    for (let index = 0; index < 20; index += 1) {
      water.charge(caster)!.release();
      water.strike({ position: target.position, target, onImpact });
      water.update(2);
      expect(water.pooledCharges).toBe(1);
      expect(water.pooledStrikes).toBe(1);
      expect(lights.availableCount).toBe(lights.size);
    }
    expect(onImpact).toHaveBeenCalledTimes(20);
  });

  it('ignores invalid frame times without poisoning the shader or triggering a hit', () => {
    const { scene, water, caster, target } = setup();
    const onImpact = vi.fn();
    water.charge(caster);
    water.strike({ position: target.position, target, onImpact });
    for (const delta of [-1, NaN, Infinity]) water.update(delta);
    expect(onImpact).not.toHaveBeenCalled();
    const ribbon = scene.getObjectByName('WaterDragonBroadRibbon') as THREE.Mesh;
    expect((ribbon.material as THREE.ShaderMaterial).uniforms.uTime.value).toBe(0);
    water.update(0.23);
    expect(onImpact).toHaveBeenCalledTimes(1);
  });

  it('updates the actual splash on XZ only and resets every pooled strike to a fresh descent', () => {
    const { scene, water, target } = setup();
    const onImpact = vi.fn();
    water.strike({ position: target.position, target, onImpact });
    const strike = scene.getObjectByName('MageWaterDragonSkyStrikeVFX')!;
    const column = strike.getObjectByName('WaterDragonDescendingColumn')!;
    const crown = strike.getObjectByName('WaterDragonOutwardSheets')!;
    const rings = strike.getObjectByName('WaterDragonBrokenImpactArcs')!;
    const core = (strike.getObjectByName('WaterDragonWaterfallBody') as THREE.Mesh).material as THREE.ShaderMaterial;
    const veil = (strike.getObjectByName('WaterDragonFallingSheet') as THREE.Mesh).material as THREE.ShaderMaterial;
    water.update(WATER_DRAGON_FALL_SECONDS);
    let scale = crown.scale.clone();
    for (let frame = 0; frame < 32; frame += 1) {
      water.update(1 / 60);
      expect(crown.scale.y).toBeLessThanOrEqual(scale.y);
      expect(crown.scale.x).toBeGreaterThanOrEqual(scale.x);
      expect(crown.scale.z).toBe(crown.scale.x);
      expect(rings.scale.y).toBe(1);
      expect(column.position.y).toBe(0);
      expect(column.rotation.y).toBe(0);
      expect(core.uniforms.uTime.value).toBe(veil.uniforms.uTime.value);
      expect(core.uniforms.uTime.value).toBeGreaterThan(0);
      expect(core.uniforms.uTopCut.value).toBe(veil.uniforms.uTopCut.value);
      scale = crown.scale.clone();
    }
    expect(core.uniforms.uOpacity.value).toBeGreaterThan(0.9);
    water.update(0.5);
    expect(water.activeStrikes).toBe(0);
    water.strike({ position: target.position, target, onImpact });
    expect(scene.getObjectByName('MageWaterDragonSkyStrikeVFX')).toBe(strike);
    expect(column.position.y).toBe(WATER_DRAGON_SHAPE.columnHeight);
    expect(strike.getObjectByName('WaterDragonImpactCrown')!.visible).toBe(false);
    expect(crown.scale.y).toBe(1);
    expect(core.uniforms.uTime.value).toBe(0);
    expect(core.uniforms.uTopCut.value).toBe(1.05);
    expect(veil.uniforms.uTopCut.value).toBe(1.05);
    expect(onImpact).toHaveBeenCalledTimes(1);
    water.update(WATER_DRAGON_FALL_SECONDS);
    expect(onImpact).toHaveBeenCalledTimes(2);
  });

  it('shares one local flow texture across the spiral, core and veil, with minification for the game camera', () => {
    const { scene, resources, water, caster, target } = setup();
    water.charge(caster);
    water.strike({ position: target.position, target, onImpact: vi.fn() });
    for (const name of ['WaterDragonBroadRibbon', 'WaterDragonFoamEdges', 'WaterDragonLongSnout', 'WaterDragonWaterfallBody', 'WaterDragonFallingSheet', 'WaterDragonPointedSplash']) {
      const mesh = scene.getObjectByName(name) as THREE.Mesh;
      const material = mesh.material as THREE.ShaderMaterial;
      expect(material.uniforms.uFlowMap.value).toBe(resources.waterFlow);
      expect(material.uniforms.uTextured.value).toBe(1);
    }
    expect(resources.allTextures().filter((texture) => texture === resources.waterFlow)).toHaveLength(1);
    expect(resources.waterFlow.wrapS).toBe(THREE.RepeatWrapping);
    expect(resources.waterFlow.generateMipmaps).toBe(true);
    expect(resources.waterFlow.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(resources.waterFlow.colorSpace).toBe(THREE.NoColorSpace);
    expect(resources.softGlow.generateMipmaps).toBe(false);
  });

  it('disposes shared body geometry exactly once while leaving the shared texture owner intact', () => {
    const { scene, water, caster, resources } = setup();
    water.charge(caster);
    const body = scene.getObjectByName('WaterDragonBroadRibbon') as THREE.Mesh;
    const foam = scene.getObjectByName('WaterDragonFoamEdges') as THREE.Mesh;
    expect(body.geometry).toBe(foam.geometry);
    const disposeGeometry = vi.spyOn(body.geometry, 'dispose');
    const disposeTexture = vi.spyOn(resources.softGlow, 'dispose');
    const disposeWaterTexture = vi.spyOn(resources.waterFlow, 'dispose');
    water.dispose();
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeTexture).not.toHaveBeenCalled();
    expect(disposeWaterTexture).not.toHaveBeenCalled();
  });
});
