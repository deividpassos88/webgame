import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MageVFX } from './MageVFX';
import { MAGE_SPELL_PRESETS } from './VFXConfig';
import type { MageSpellId } from './VFXTypes';

function setupCast(spellId: MageSpellId, timeScale = 1.8, hasHand = true) {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  const hand = new THREE.Object3D();
  hand.name = 'mixamorig:RightHand';
  hand.position.set(0.35, 1.3, 1);
  root.add(hand);
  scene.add(root);
  const target = new THREE.Group();
  target.position.set(0, 0, 6);
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(new THREE.AnimationClip('mage skill look', 3.3, [
    new THREE.NumberKeyframeTrack('.visible', [0, 3.3], [1, 1]),
  ]));
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.setEffectiveTimeScale(timeScale).play();
  const vfx = new MageVFX(scene, { quality: 'high' });
  const onLaunch = vi.fn();
  const onImpact = vi.fn();
  vfx.cast(spellId, {
    caster: root,
    rightHand: hasHand ? hand : null,
    leftHand: null,
    action,
    target,
    fallbackDirection: new THREE.Vector3(0, 0, 1),
    isTargetAlive: () => true,
    onLaunch,
    onImpact,
  });
  const step = (delta: number) => { mixer.update(delta); vfx.update(delta); };
  return { scene, root, hand, target, mixer, action, vfx, onLaunch, onImpact, step };
}

describe('Mage faster skill presentation', () => {
  beforeEach(() => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it.each(['water', 'ice', 'lightning', 'laser', 'lava'] as const)(
    'uses small sparks instead of screen-filling additive particles for %s', (spellId) => {
      const { scene, vfx, step, onLaunch, onImpact } = setupCast(spellId);
      let checkedClouds = 0;
      try {
        for (let frame = 0; frame < 100; frame += 1) {
          step(0.04);
          scene.traverse((object) => {
            if (!(object instanceof THREE.Points) || !object.visible || !object.parent?.visible) return;
            const sizes = object.geometry.getAttribute('aSize');
            if (!sizes) return;
            const count = Math.min(sizes.count, object.geometry.drawRange.count);
            if (count > 0) checkedClouds += 1;
            for (let index = 0; index < count; index += 1) {
              expect(sizes.getX(index), `${spellId}: ${object.name || object.parent?.name}`).toBeLessThanOrEqual(4);
            }
          });
        }
        expect(checkedClouds).toBeGreaterThan(0);
        expect(onLaunch).toHaveBeenCalledTimes(1);
        expect(onImpact).toHaveBeenCalledTimes(1);
      } finally {
        vfx.dispose();
      }
    }
  );

  it('keeps lightning charge compact, attached to one hand and free of overlapping seals', () => {
    const { scene, hand, vfx, step } = setupCast('lightning', 2.1);
    try {
      step(0.4);
      step(0.04);
      const charge = scene.getObjectByName('MageChargeOrbVFX')!;
      expect(charge).toBeDefined();
      const glow = charge.getObjectByName('MageChargeOrbGlow') as THREE.Sprite;
      expect(glow.scale.x * charge.scale.x).toBeLessThan(1.3);
      expect(vfx.diagnostics().activeMagicCircles).toBe(0);
      expect(MAGE_SPELL_PRESETS.lightning.charge.twoHanded).toBe(false);
      expect(MAGE_SPELL_PRESETS.lightning.charge.particleCount).toBe(0);

      const previousPosition = charge.position.clone();
      hand.position.x += 0.3;
      step(0.04);
      expect(charge.position.x - previousPosition.x).toBeGreaterThan(0.25);
      expect(charge.position.distanceTo(hand.getWorldPosition(new THREE.Vector3()))).toBeLessThan(0.3);
    } finally {
      vfx.dispose();
    }
  });

  it('follows the real shock gesture instead of clamping a retracted palm in front of the legs', () => {
    const { scene, hand, vfx, step } = setupCast('lightning', 2.1);
    try {
      hand.position.set(0.25, 0.9, -0.3);
      step(0.4);
      step(0.04);
      const charge = scene.getObjectByName('MageChargeOrbVFX')!;
      const palm = hand.getWorldPosition(new THREE.Vector3());
      expect(charge.position.distanceTo(palm)).toBeLessThan(0.12);
      const glow = charge.getObjectByName('MageChargeOrbGlow') as THREE.Sprite;
      expect(glow.material.depthTest).toBe(true);

      hand.position.set(NaN, 1, 0);
      step(0.04);
      expect([charge.position.x, charge.position.y, charge.position.z].every(Number.isFinite)).toBe(true);
      expect(charge.position.z).toBeGreaterThan(0.7);
    } finally {
      vfx.dispose();
    }
  });

  it.each(['mixamorig:RightHand', 'mixamorigRightHand'])(
    'attaches lightning to the animated fingers under %s', (handName) => {
      const { scene, hand, vfx, step } = setupCast('lightning', 2.1);
      try {
        hand.name = handName;
        const finger = new THREE.Object3D();
        finger.name = `${handName}Index2`;
        finger.position.set(0.18, 0.05, 0.08);
        hand.add(finger);
        step(0.4);
        const charge = scene.getObjectByName('MageChargeOrbVFX')!;
        const expected = finger.getWorldPosition(new THREE.Vector3());
        expect(charge.position.distanceTo(expected)).toBeLessThan(0.12);
      } finally {
        vfx.dispose();
      }
    }
  );

  it('uses a safe chest-height socket when neither hand is available', () => {
    const { scene, vfx, step } = setupCast('lightning', 2.1, false);
    try {
      step(0.4);
      const charge = scene.getObjectByName('MageChargeOrbVFX')!;
      expect(charge.position.y).toBeGreaterThan(1);
      expect(charge.position.z).toBeGreaterThan(0.7);
      expect([charge.position.x, charge.position.y, charge.position.z].every(Number.isFinite)).toBe(true);
    } finally {
      vfx.dispose();
    }
  });

  it('releases lightning in under 0.65 s with one target impact and no explosion on the caster', () => {
    const { scene, root, vfx, step, onLaunch, onImpact } = setupCast('lightning', 2.1);
    try {
      for (let frame = 0; frame < 32; frame += 1) step(0.02);
      expect(onLaunch).toHaveBeenCalledTimes(1);
      expect(onImpact).toHaveBeenCalledTimes(1);
      expect(vfx.diagnostics().activeCharges).toBe(0);
      expect(vfx.diagnostics().activeMagicCircles).toBe(0);
      const impacts = scene.children.filter((child) => child.name === 'MageImpactVFX');
      expect(impacts).toHaveLength(1);
      expect(impacts[0].position.distanceTo(root.position)).toBeGreaterThan(4);
      for (let frame = 0; frame < 60; frame += 1) step(0.02);
      expect(onImpact).toHaveBeenCalledTimes(1);
      expect(vfx.diagnostics().activeLightning).toBe(0);
      expect(vfx.diagnostics().activeImpacts).toBe(0);
    } finally {
      vfx.dispose();
    }
  });

  it('does not leave charges behind when one slow frame crosses the entire fast cast', () => {
    const { vfx, step, onLaunch, onImpact } = setupCast('lightning', 2.1 * 1.3);
    try {
      step(1.5);
      expect(onLaunch).toHaveBeenCalledTimes(1);
      expect(onImpact).toHaveBeenCalledTimes(1);
      expect(vfx.diagnostics().activeCharges).toBe(0);
      step(1.5);
      expect(onLaunch).toHaveBeenCalledTimes(1);
      expect(onImpact).toHaveBeenCalledTimes(1);
      vfx.clear();
      expect(vfx.diagnostics()).toMatchObject({
        activeCasts: 0, activeCharges: 0, activeMagicCircles: 0,
        activeLightning: 0, activeImpacts: 0, activeBarriers: 0,
      });
    } finally {
      vfx.dispose();
    }
  });
});
