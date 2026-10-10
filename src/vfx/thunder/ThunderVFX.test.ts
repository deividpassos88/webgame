import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MageVFXResources } from '../MageVFXResources';
import { VFXLightPool } from '../VFXLightPool';
import type { MageVFXQuality } from '../VFXTypes';
import {
  THUNDER_DESCENT_SECONDS, THUNDER_POOL_LIMITS, ThunderVFX,
} from './ThunderVFX';

const cleanup: Array<() => void> = [];

function setup(quality: MageVFXQuality = 'high') {
  const scene = new THREE.Scene();
  const resources = new MageVFXResources();
  const lights = new VFXLightPool(scene, 4);
  const thunder = new ThunderVFX(scene, resources, lights, quality);
  const caster = new THREE.Group();
  caster.position.set(2, 0, 3);
  scene.add(caster);
  const target = new THREE.Group();
  target.position.set(0, 0, 5);
  scene.add(target);
  cleanup.push(() => { thunder.dispose(); lights.dispose(); resources.dispose(); });
  return { scene, resources, lights, thunder, caster, target };
}

beforeEach(() => {
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
});
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
});

describe('Pulo Atacando thunder effects', () => {
  it('declares the pool limits and starts empty', () => {
    expect(THUNDER_POOL_LIMITS).toEqual({ charges: 2, strikes: 4 });
    const { thunder } = setup();
    expect(thunder.pooledCharges).toBe(0);
    expect(thunder.pooledStrikes).toBe(0);
    expect(thunder.activeCharges).toBe(0);
    expect(thunder.activeStrikes).toBe(0);
  });

  it('raises from the staff, drops to the ground at 1.05 s and cracks the floor on contact', () => {
    const { scene, thunder, caster } = setup();
    const staffTip = new THREE.Vector3(caster.position.x + 0.4, 1.5, caster.position.z + 0.2);
    thunder.charge(caster, staffTip);
    const barrier = scene.getObjectByName('MageThunderBarrierVFX')!;
    const dome = barrier.getObjectByName('ThunderBarrierDome')!;
    const domeGroup = dome.parent!;
    const cracks = barrier.getObjectByName('ThunderGroundCracks')! as THREE.Mesh;
    const crackOpacity = () => (cracks.material as THREE.MeshBasicMaterial).opacity;
    const advanceTo = (seconds: number) => {
      let now = 0;
      while (now < seconds - 1e-6) { const step = Math.min(1 / 60, seconds - now); thunder.update(step); now += step; }
    };

    advanceTo(0.2);
    const highAt0_2 = domeGroup.position.y;
    advanceTo(0.8);
    const midAt0_8 = domeGroup.position.y;
    expect(highAt0_2).toBeGreaterThan(midAt0_8);
    expect(midAt0_8).toBeGreaterThan(0);
    expect(crackOpacity()).toBe(0);

    advanceTo(1.1);
    expect(domeGroup.position.y).toBeCloseTo(0, 5);
    expect(crackOpacity()).toBeGreaterThan(0);
  });

  it('builds the barrier at the caster and releases it back to the pool', () => {
    const { scene, thunder, caster } = setup();
    const handle = thunder.charge(caster);
    expect(handle).not.toBeNull();
    thunder.update(0.3);
    const barrier = scene.getObjectByName('MageThunderBarrierVFX')!;
    expect(barrier.position.x).toBeCloseTo(caster.position.x, 5);
    expect(barrier.position.z).toBeCloseTo(caster.position.z, 5);
    expect(thunder.activeCharges).toBe(1);

    handle!.release();
    for (let i = 0; i < 200 && thunder.activeCharges > 0; i += 1) thunder.update(0.02);
    expect(thunder.activeCharges).toBe(0);
    expect(thunder.pooledCharges).toBe(1);
    expect(scene.getObjectByName('MageThunderBarrierVFX')).toBeUndefined();

    // O mesmo objeto é reaproveitado na próxima conjuração.
    const again = thunder.charge(caster);
    expect(again).not.toBeNull();
    expect(thunder.pooledCharges).toBe(0);
  });

  it('refuses extra charges beyond the pool limit instead of allocating more', () => {
    const { thunder, caster } = setup();
    const handles = Array.from({ length: THUNDER_POOL_LIMITS.charges }, () => thunder.charge(caster));
    expect(handles.every((handle) => handle !== null)).toBe(true);
    expect(thunder.charge(caster)).toBeNull();
    expect(thunder.activeCharges).toBe(THUNDER_POOL_LIMITS.charges);
  });

  it('fires the damage callback once, exactly on contact, not during the fall', () => {
    const { scene, thunder, target } = setup();
    const onImpact = vi.fn();
    thunder.strike({ position: target.position.clone(), target, onImpact });
    expect(scene.getObjectByName('MageThunderStrikeVFX')).toBeDefined();

    const steps = Math.floor((THUNDER_DESCENT_SECONDS - 0.05) / 0.02);
    for (let i = 0; i < steps; i += 1) thunder.update(0.02);
    expect(onImpact).not.toHaveBeenCalled();

    thunder.update(0.1);
    expect(onImpact).toHaveBeenCalledTimes(1);
    expect(onImpact.mock.calls[0][1]).toBe(target);

    for (let i = 0; i < 200; i += 1) thunder.update(0.02);
    expect(onImpact).toHaveBeenCalledTimes(1);
    expect(thunder.activeStrikes).toBe(0);
    expect(thunder.pooledStrikes).toBe(1);
  });

  it('reports a null target when the marked enemy is no longer alive at contact', () => {
    const { thunder, target } = setup();
    const onImpact = vi.fn();
    thunder.strike({ position: target.position.clone(), target, isTargetAlive: () => false, onImpact });
    thunder.update(THUNDER_DESCENT_SECONDS + 0.01);
    expect(onImpact).toHaveBeenCalledTimes(1);
    expect(onImpact.mock.calls[0][1]).toBeNull();
  });

  it('queues strikes beyond the pool and still resolves each of them exactly once', () => {
    const { thunder, target } = setup();
    const callbacks = Array.from({ length: THUNDER_POOL_LIMITS.strikes + 2 }, () => vi.fn());
    for (const onImpact of callbacks) {
      thunder.strike({ position: target.position.clone(), target: null, onImpact });
    }
    expect(thunder.activeStrikes).toBe(THUNDER_POOL_LIMITS.strikes);

    for (let i = 0; i < 400; i += 1) thunder.update(0.02);
    for (const onImpact of callbacks) expect(onImpact).toHaveBeenCalledTimes(1);
    expect(thunder.activeStrikes).toBe(0);
  });

  it('clear drops active and queued effects without firing their callbacks', () => {
    const { scene, thunder, caster, target } = setup();
    thunder.charge(caster);
    const callbacks = Array.from({ length: THUNDER_POOL_LIMITS.strikes + 1 }, () => vi.fn());
    for (const onImpact of callbacks) {
      thunder.strike({ position: target.position.clone(), target: null, onImpact });
    }
    thunder.clear();
    expect(thunder.activeCharges).toBe(0);
    expect(thunder.activeStrikes).toBe(0);
    expect(scene.getObjectByName('MageThunderBubbleVFX')).toBeUndefined();
    expect(scene.getObjectByName('MageThunderStrikeVFX')).toBeUndefined();

    thunder.update(THUNDER_DESCENT_SECONDS * 3);
    for (const onImpact of callbacks) expect(onImpact).not.toHaveBeenCalled();
  });

  it('dispose empties the scene and tolerates a second call', () => {
    const { scene, thunder, caster, target } = setup();
    thunder.charge(caster);
    thunder.strike({ position: target.position.clone(), target: null, onImpact: vi.fn() });
    thunder.dispose();
    expect(scene.getObjectByName('MageThunderBubbleVFX')).toBeUndefined();
    expect(scene.getObjectByName('MageThunderStrikeVFX')).toBeUndefined();
    expect(() => thunder.dispose()).not.toThrow();
  });
});
