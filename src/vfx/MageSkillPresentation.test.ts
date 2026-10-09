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

  it('wraps the Maga in an invocation bubble while she casts, with no hand orb or magic seal', () => {
    const { scene, root, vfx, step } = setupCast('lightning', 2.1);
    try {
      step(0.4);
      step(0.04);
      const bubble = scene.getObjectByName('MageThunderBubbleVFX')!;
      expect(bubble).toBeDefined();
      expect(scene.getObjectByName('MageChargeOrbVFX')).toBeUndefined();
      expect(vfx.diagnostics().activeThunderCharges).toBe(1);
      expect(vfx.diagnostics().activeMagicCircles).toBe(0);
      // A bolha acompanha a Maga, não a mão.
      root.position.x += 0.6;
      step(0.04);
      expect(bubble.position.x).toBeCloseTo(root.position.x, 3);
    } finally {
      vfx.dispose();
    }
  });

  it('keeps the invocation bubble finite and centred on the caster when no hand is available', () => {
    const { scene, vfx, step } = setupCast('lightning', 2.1, false);
    try {
      step(0.4);
      const bubble = scene.getObjectByName('MageThunderBubbleVFX')!;
      expect(bubble).toBeDefined();
      expect([bubble.position.x, bubble.position.y, bubble.position.z].every(Number.isFinite)).toBe(true);
    } finally {
      vfx.dispose();
    }
  });

  it('drops thunder onto the marked enemy once, with the damage on contact and no explosion on the caster', () => {
    const { scene, vfx, step, onLaunch, onImpact } = setupCast('lightning', 2.1);
    try {
      // Lançamento no gesto autoral (≈0,6 s reais com 2,1x); o dano só chega no contato da queda.
      for (let frame = 0; frame < 32; frame += 1) step(0.02);
      expect(onLaunch).toHaveBeenCalledTimes(1);
      expect(onImpact).toHaveBeenCalledTimes(0);
      expect(vfx.diagnostics().activeMagicCircles).toBe(0);
      expect(vfx.diagnostics().activeThunderStrikes).toBe(1);
      // O raio é desenhado pelo próprio efeito de queda: nenhuma explosão de impacto na Maga.
      const impacts = scene.children.filter((child) => child.name === 'MageImpactVFX');
      expect(impacts).toHaveLength(0);
      expect(scene.getObjectByName('MageThunderStrikeVFX')).toBeDefined();
      for (let frame = 0; frame < 30; frame += 1) step(0.02);
      expect(onImpact).toHaveBeenCalledTimes(1);
      for (let frame = 0; frame < 120; frame += 1) step(0.02);
      expect(onImpact).toHaveBeenCalledTimes(1);
      expect(onLaunch).toHaveBeenCalledTimes(1);
      expect(vfx.diagnostics().activeThunderCharges).toBe(0);
      expect(vfx.diagnostics().activeThunderStrikes).toBe(0);
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
        activeThunderStrikes: 0, activeThunderCharges: 0, activeImpacts: 0, activeBarriers: 0,
      });
    } finally {
      vfx.dispose();
    }
  });
});
