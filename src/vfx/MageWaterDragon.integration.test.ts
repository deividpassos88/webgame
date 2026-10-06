import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MageVFX } from './MageVFX';
import { MAGE_SPELL_PRESETS } from './VFXConfig';
import { firstColumnHit, MAGE_SPELL_TRAVEL_METERS } from '../combat/MageSpellFlight';
import type { MageCastContext, MageSpellId } from './VFXTypes';
import { WATER_DRAGON_FALL_SECONDS } from './water/WaterDragonVFX';
import { MAGE_BASIC_ATTACK_PLAYBACK_RATE } from '../entities/Player';

const dispose: Array<() => void> = [];
function setup(spellId: MageSpellId = 'water', overrides: Partial<MageCastContext> = {}) {
  const scene = new THREE.Scene();
  const caster = new THREE.Group();
  scene.add(caster);
  const target = new THREE.Group();
  target.position.z = 5;
  scene.add(target);
  const duration = spellId === 'basic' ? 1.8 : 3;
  const mixer = new THREE.AnimationMixer(caster);
  const action = mixer.clipAction(new THREE.AnimationClip('authored mage cast', duration, [
    new THREE.NumberKeyframeTrack('.visible', [0, duration], [1, 1]),
  ]));
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.setEffectiveTimeScale(spellId === 'basic' ? MAGE_BASIC_ATTACK_PLAYBACK_RATE : 1.8).play();
  const vfx = new MageVFX(scene, { quality: 'low' });
  let now = 0;
  const launchTimes: number[] = [];
  const impactTimes: number[] = [];
  const onLaunch = vi.fn(() => { launchTimes.push(now); });
  const onImpact = vi.fn(() => { impactTimes.push(now); });
  vfx.cast(spellId, {
    caster, rightHand: null, leftHand: null, action, target,
    fallbackDirection: new THREE.Vector3(0, 0, 1),
    isTargetAlive: () => true, onLaunch, onImpact, ...overrides,
  });
  const advance = (seconds: number) => {
    let remaining = seconds;
    while (remaining > 1e-8) {
      const dt = Math.min(1 / 120, remaining);
      now += dt;
      mixer.update(dt); vfx.update(dt);
      remaining -= dt;
    }
  };
  dispose.push(() => vfx.dispose());
  return { scene, caster, target, mixer, action, vfx, onLaunch, onImpact, launchTimes, impactTimes, advance };
}

beforeEach(() => {
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
});
afterEach(() => {
  dispose.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});

describe('Mage water-dragon animation / gameplay bridge', () => {
  it('conjures the spiral, releases the sky column and applies damage only once at landing', () => {
    const { scene, vfx, onLaunch, onImpact, launchTimes, impactTimes, advance } = setup();
    advance(0.6);
    expect(vfx.diagnostics()).toMatchObject({ activeWaterCharges: 1, activeCharges: 0, activeBarriers: 0, activeProjectiles: 0, activeMagicCircles: 0 });
    expect(scene.getObjectByName('WaterDragonSpiral')).toBeDefined();
    expect(onLaunch).not.toHaveBeenCalled();
    expect(onImpact).not.toHaveBeenCalled();

    advance(0.3);
    expect(onLaunch).toHaveBeenCalledTimes(1);
    expect(vfx.diagnostics().activeWaterStrikes).toBe(1);
    expect(onImpact).not.toHaveBeenCalled();
    advance(0.15);
    expect(onImpact).not.toHaveBeenCalled();
    advance(0.08);
    expect(onImpact).toHaveBeenCalledTimes(1);
    const nominalRelease = 3 / 1.8 * MAGE_SPELL_PRESETS.water.timeline.launch;
    expect(launchTimes[0]).toBeCloseTo(nominalRelease, 1);
    expect(impactTimes[0] - launchTimes[0]).toBeCloseTo(WATER_DRAGON_FALL_SECONDS, 1);
    // Only the water crown plays: no old projectile, departure explosion or bubble.
    expect(vfx.diagnostics()).toMatchObject({ pooledProjectiles: 0, pooledImpacts: 0, pooledBarriers: 0, activeCharges: 0 });
    advance(3);
    expect(onImpact).toHaveBeenCalledTimes(1);
    expect(vfx.diagnostics()).toMatchObject({ activeCasts: 0, activeWaterCharges: 0, activeWaterStrikes: 0 });
  });

  it('releases the basic projectile on the accelerated Mage basic clock', () => {
    const { onLaunch, launchTimes, advance } = setup('basic');
    advance(0.2);
    expect(onLaunch).not.toHaveBeenCalled();
    advance(0.2);
    expect(onLaunch).toHaveBeenCalledTimes(1);
    expect(launchTimes[0]).toBeCloseTo(1.8 / MAGE_BASIC_ATTACK_PLAYBACK_RATE * MAGE_SPELL_PRESETS.basic.timeline.launch, 1);
  });

  it('cancels an interrupted charge without launching a stray water column', () => {
    const { vfx, action, onLaunch, onImpact, advance } = setup();
    advance(0.3);
    expect(vfx.diagnostics().activeWaterCharges).toBe(1);
    action.stop();
    advance(0.4);
    expect(vfx.diagnostics()).toMatchObject({ activeCasts: 0, activeWaterCharges: 0, activeWaterStrikes: 0 });
    expect(onLaunch).not.toHaveBeenCalled();
    expect(onImpact).not.toHaveBeenCalled();
  });

  it('lands in the forward direction without a target, querying bodies vertically instead of firing a bolt', () => {
    const queryBodyHit = vi.fn(() => null);
    const { scene, onImpact, advance } = setup('water', { target: null, queryBodyHit });
    advance(0.9);
    const strike = scene.getObjectByName('MageWaterDragonSkyStrikeVFX')!;
    expect(strike.position.z).toBeCloseTo(MAGE_SPELL_TRAVEL_METERS);
    expect(queryBodyHit).toHaveBeenCalledTimes(1);
    const [top, ground] = queryBodyHit.mock.calls[0] as unknown as [THREE.Vector3, THREE.Vector3];
    expect(top.x).toBe(ground.x);
    expect(top.z).toBe(ground.z);
    expect(top.y).toBeGreaterThan(ground.y + 8);
    advance(2);
    expect(onImpact).not.toHaveBeenCalled();
  });

  it('hits an unmarked body beneath the free-aim landing point using the real vertical body query', () => {
    const enemy = new THREE.Group();
    enemy.position.z = MAGE_SPELL_TRAVEL_METERS;
    const { onImpact, advance } = setup('water', {
      target: null,
      queryBodyHit: (from, to) => firstColumnHit(from, to, [{
        target: enemy, x: 0, z: MAGE_SPELL_TRAVEL_METERS, minY: 0, maxY: 1.8, radius: 0.6,
      }])?.target ?? null,
    });
    advance(0.9);
    expect(onImpact).not.toHaveBeenCalled();
    advance(0.3);
    expect(onImpact).toHaveBeenCalledTimes(1);
    expect(onImpact).toHaveBeenCalledWith(enemy);
  });

  it('does not track or damage a marked enemy outside the existing spell range', () => {
    const far = new THREE.Group(); far.position.z = 50;
    const { scene, onImpact, advance } = setup('water', { target: far });
    advance(0.9);
    expect(scene.getObjectByName('MageWaterDragonSkyStrikeVFX')!.position.z).toBeCloseTo(MAGE_SPELL_TRAVEL_METERS);
    advance(1);
    expect(onImpact).not.toHaveBeenCalled();
  });

  it('suppresses the gameplay callback when the enemy dies during the fall', () => {
    let alive = true;
    const { onImpact, advance } = setup('water', { isTargetAlive: () => alive });
    advance(0.92);
    alive = false;
    advance(2);
    expect(onImpact).not.toHaveBeenCalled();
  });
});
