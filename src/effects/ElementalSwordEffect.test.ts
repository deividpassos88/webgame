import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ElementalSwordEffect } from './ElementalSwordEffect';

function sword(): THREE.Group {
  const root = new THREE.Group();
  const base = new THREE.Object3D();
  base.name = 'VFX_SwordBase';
  base.position.set(0, 0, 0);
  const tip = new THREE.Object3D();
  tip.name = 'VFX_SwordTip';
  tip.position.set(0, 1.5, 0);
  root.add(base, tip);
  return root;
}

describe('ElementalSwordEffect', () => {
  it('stays hidden for physical attacks and shows only selected fire or ice', () => {
    const effect = new ElementalSwordEffect();
    effect.attach(sword());
    effect.activate(null);
    expect(effect.object.visible).toBe(false);
    effect.activate('fire');
    expect(effect.object.visible).toBe(true);
    expect(effect.element).toBe('fire');
    effect.activate('ice');
    expect(effect.element).toBe('ice');
    effect.clear();
    expect(effect.object.visible).toBe(false);
  });

  it('uses a bounded lightweight object budget and disposes safely', () => {
    const effect = new ElementalSwordEffect();
    effect.attach(sword());
    effect.activate('fire');
    effect.update(1 / 60);
    expect(effect.renderableCount).toBeLessThanOrEqual(8);
    expect(effect.particleCount).toBeLessThanOrEqual(16);
    expect(() => { effect.dispose(); effect.dispose(); }).not.toThrow();
  });
});
