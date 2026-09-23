import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Enemy } from '../entities/Enemy';
import { MAGE_VFX_LIMITS } from './VFXConfig';
import { MageVFX } from './MageVFX';
import { VFXLightPool } from './VFXLightPool';

function countPointLights(scene: THREE.Scene): number {
  let count = 0;
  scene.traverse((object) => {
    if (object instanceof THREE.PointLight) count += 1;
  });
  return count;
}

function createAction(duration = 2, timeScale = 1): { root: THREE.Group; mixer: THREE.AnimationMixer; action: THREE.AnimationAction } {
  const root = new THREE.Group();
  const mixer = new THREE.AnimationMixer(root);
  const clip = new THREE.AnimationClip('vfx light pool test', duration, [
    new THREE.NumberKeyframeTrack('.visible', [0, duration], [1, 1]),
  ]);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.setEffectiveTimeScale(timeScale);
  action.play();
  return { root, mixer, action };
}

describe('VFXLightPool', () => {
  beforeEach(() => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a fixed set of dark lights in the scene from construction', () => {
    const scene = new THREE.Scene();
    const pool = new VFXLightPool(scene, 4);

    expect(pool.size).toBe(4);
    expect(pool.availableCount).toBe(4);
    expect(countPointLights(scene)).toBe(4);
    scene.traverse((object) => {
      if (object instanceof THREE.PointLight) {
        expect(object.intensity).toBe(0);
        expect(object.visible).toBe(true);
      }
    });
    pool.dispose();
    expect(countPointLights(scene)).toBe(0);
  });

  it('hands out each slot once, refuses when exhausted, and recycles on release', () => {
    const scene = new THREE.Scene();
    const pool = new VFXLightPool(scene, 2);

    const first = pool.acquire();
    const second = pool.acquire();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.light).not.toBe(second?.light);
    expect(pool.availableCount).toBe(0);
    expect(pool.acquire()).toBeNull();

    first?.release();
    expect(pool.availableCount).toBe(1);
    expect(first?.light.intensity).toBe(0);

    // Double release is safe and never duplicates the slot.
    first?.release();
    expect(pool.availableCount).toBe(1);

    const third = pool.acquire();
    expect(third?.light).toBe(first?.light);
    expect(third?.isReleased).toBe(false);
    second?.release();
    third?.release();
    expect(pool.availableCount).toBe(2);
    pool.dispose();
  });

  it('ignores releases after dispose', () => {
    const scene = new THREE.Scene();
    const pool = new VFXLightPool(scene, 1);
    const handle = pool.acquire();
    pool.dispose();
    expect(() => handle?.release()).not.toThrow();
    expect(pool.acquire()).toBeNull();
  });

  it('keeps the scene light count fixed across a full Mage skill cast', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene);
    const baseline = countPointLights(scene);
    expect(baseline).toBe(MAGE_VFX_LIMITS.maxTemporaryLights);

    const { root, mixer, action } = createAction(2, 1);
    const target = new THREE.Group();
    target.position.set(0, 0, 5);
    target.userData.enemyBodyScale = 1;
    vfx.cast('lava', {
      caster: root,
      rightHand: null,
      leftHand: null,
      action,
      target,
      fallbackDirection: new THREE.Vector3(0, 0, 1),
      isTargetAlive: () => true,
    });

    for (let step = 0; step < 60; step += 1) {
      mixer.update(0.1);
      vfx.update(0.1);
      expect(countPointLights(scene)).toBe(baseline);
    }
    vfx.clear();
    vfx.dispose();
    expect(countPointLights(scene)).toBe(0);
  });

  it('shares pooled lights with enemy shock auras and releases them when the shock ends', () => {
    const scene = new THREE.Scene();
    const pool = new VFXLightPool(scene, MAGE_VFX_LIMITS.maxTemporaryLights);
    const enemy = new Enemy(
      { position: new THREE.Vector3(0, 0, 4), shockLightPool: pool }
    );
    scene.add(enemy.root);

    enemy.applyMageShockLevitate(1);
    expect(countPointLights(scene)).toBe(MAGE_VFX_LIMITS.maxTemporaryLights);
    expect(pool.availableCount).toBe(MAGE_VFX_LIMITS.maxTemporaryLights - 1);
    expect(enemy.root.getObjectByName('EnemyShockAura')?.visible).toBe(true);

    enemy.update(0.5, new THREE.Vector3(), () => undefined);
    expect(countPointLights(scene)).toBe(MAGE_VFX_LIMITS.maxTemporaryLights);
    enemy.update(0.6, new THREE.Vector3(), () => undefined);
    expect(enemy.root.getObjectByName('EnemyShockAura')?.visible).toBe(false);
    expect(pool.availableCount).toBe(MAGE_VFX_LIMITS.maxTemporaryLights);
    expect(countPointLights(scene)).toBe(MAGE_VFX_LIMITS.maxTemporaryLights);

    enemy.dispose();
    pool.dispose();
  });

  it('falls back to a per-enemy light when no pool is provided', () => {
    const enemy = new Enemy({ position: new THREE.Vector3(0, 0, 4) });
    enemy.applyMageShockLevitate(1);
    const aura = enemy.root.getObjectByName('EnemyShockAura');
    expect(aura?.visible).toBe(true);
    let lightCount = 0;
    aura?.traverse((object) => {
      if (object instanceof THREE.PointLight) lightCount += 1;
    });
    expect(lightCount).toBe(1);
    enemy.dispose();
  });

  it('renders the shock aura unlit instead of adding lights when the pool is exhausted', () => {
    const scene = new THREE.Scene();
    const pool = new VFXLightPool(scene, 1);
    const held = pool.acquire();
    expect(held).not.toBeNull();
    const enemy = new Enemy(
      { position: new THREE.Vector3(0, 0, 4), shockLightPool: pool }
    );
    scene.add(enemy.root);

    enemy.applyMageShockLevitate(1);
    expect(countPointLights(scene)).toBe(1);
    expect(enemy.root.getObjectByName('EnemyShockAura')?.visible).toBe(true);

    enemy.update(1.2, new THREE.Vector3(), () => undefined);
    held?.release();
    enemy.dispose();
    pool.dispose();
  });
});
