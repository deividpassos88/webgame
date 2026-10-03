import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PooledParticleCloud } from './ParticleManager';
import { MageVFX } from './MageVFX';
import { MAGE_SPELL_PRESETS } from './VFXConfig';

function createAction(duration = 2, timeScale = 1): {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction;
} {
  const root = new THREE.Group();
  const mixer = new THREE.AnimationMixer(root);
  const clip = new THREE.AnimationClip('mage basic attack test', duration, [
    new THREE.NumberKeyframeTrack('.visible', [0, duration], [1, 1]),
  ]);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.setEffectiveTimeScale(timeScale);
  action.play();
  return { root, mixer, action };
}

function castBasic(vfx: MageVFX, steps = 0): { root: THREE.Group; mixer: THREE.AnimationMixer; action: THREE.AnimationAction } {
  const { root, mixer, action } = createAction(2, 1);
  const rightHand = new THREE.Object3D();
  rightHand.name = 'mixamorig:RightHand';
  root.add(rightHand);
  const target = new THREE.Group();
  target.position.set(0, 0, 6);
  target.userData.enemyBodyScale = 1;
  vfx.cast('basic', {
    caster: root,
    rightHand,
    leftHand: null,
    action,
    target,
    fallbackDirection: new THREE.Vector3(0, 0, 1),
    isTargetAlive: () => true,
  });
  for (let step = 0; step < steps; step += 1) {
    mixer.update(0.05);
    vfx.update(0.05);
  }
  return { root, mixer, action };
}

describe('Mage basic attack bullet', () => {
  beforeEach(() => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ships a small bullet preset with a blue aura and a frost wake', () => {
    const preset = MAGE_SPELL_PRESETS.basic;
    expect(preset.projectile.shape).toBe('bullet');
    // Old preset: radius 0.42 with a 1.43 m halo. The bullet has to stay small.
    expect(preset.projectile.radius).toBeLessThanOrEqual(0.22);
    expect(preset.projectile.trailLength).toBeLessThanOrEqual(1);
    expect(preset.projectile.trailWidth).toBeLessThanOrEqual(0.06);
    expect(preset.impact.radius).toBeLessThanOrEqual(0.5);
    expect(preset.impact.shockwaveRadius).toBeLessThanOrEqual(1);
    expect(preset.charge.scale).toBeLessThanOrEqual(0.6);
    // Blue aura around a pale core.
    expect(new THREE.Color(preset.colors.glow).getHex()).toBe(0x3fa6ff);
    expect(new THREE.Color(preset.colors.secondary).getHex()).toBe(0x1c63e8);
    expect(preset.projectile.frost?.color).toBe(0xcfeaff);
    expect(preset.projectile.frost?.blending).toBe('additive');
    // Particle sizes are screen-space units (~0.21 m each): anything above ~3
    // turns the frost wake into the huge fog bank the old effect had.
    expect(preset.projectile.frost?.size[1] ?? 0).toBeLessThanOrEqual(3);
  });

  it('keeps the palm charge of the basic attack under a metre', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    castBasic(vfx, 8);

    const charge = scene.getObjectByName('MageChargeOrbVFX');
    const glow = charge?.getObjectByName('MageChargeOrbGlow') as THREE.Sprite | undefined;
    expect(glow).toBeDefined();
    const worldDiameter = (glow?.scale.x ?? 0) * (charge?.scale.x ?? 1);
    expect(worldDiameter).toBeLessThan(1);
    vfx.dispose();
  });

  it('renders the bolt as a nose + body + shock cone instead of the old orb', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    castBasic(vfx, 16);

    const bolt = scene.getObjectByName('MageProjectileVFX');
    expect(bolt).toBeDefined();
    const nose = bolt?.getObjectByName('MageBulletNose') as THREE.Mesh | undefined;
    const body = bolt?.getObjectByName('MageBulletBody') as THREE.Mesh | undefined;
    const shock = bolt?.getObjectByName('MageBulletShockCone') as THREE.Mesh | undefined;
    expect(nose?.visible).toBe(true);
    expect(body?.visible).toBe(true);
    expect(shock?.visible).toBe(true);
    expect(bolt?.getObjectByName('MageIceShardProjectile')?.visible).toBe(false);

    const { radius, haloScale } = MAGE_SPELL_PRESETS.basic.projectile;
    const halo = bolt?.getObjectByName('MageProjectileAuraGlow') as THREE.Sprite;
    // The halo is a world-space quad: it must stay under ~0.5 m of diameter.
    const haloDiameter = halo.scale.x;
    expect(haloDiameter).toBeLessThan(0.5);
    expect(haloDiameter).toBeCloseTo(radius * (haloScale ?? 3.4), 1);
    expect(bolt?.getObjectByName('MageBulletNose')?.scale.x).toBeLessThan(haloDiameter);
    vfx.dispose();
  });

  it('leaves the frost wake in world space so the trail stays behind the bolt', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    castBasic(vfx, 16);

    const bolt = scene.getObjectByName('MageProjectileVFX');
    const wake = scene.children.find(
      (child) => child instanceof THREE.Points && !bolt?.children.includes(child)
    ) as THREE.Points | undefined;
    expect(wake).toBeDefined();
    expect(bolt?.children.includes(wake as THREE.Object3D)).toBe(false);
    const drawn = (wake?.geometry as THREE.BufferGeometry).drawRange.count;
    expect(drawn).toBeGreaterThan(0);

    // The oldest puff was released when the bolt was further back, so the trail
    // is a line of vapor behind the bullet — proof it is not glued to the mesh.
    const attribute = (wake?.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
    const oldest = new THREE.Vector3().fromBufferAttribute(attribute, 0);
    const boltPosition = bolt?.position.clone() ?? new THREE.Vector3();
    // The bolt already crossed the arena while the first puff stayed put.
    expect(boltPosition.length()).toBeGreaterThan(2);
    expect(boltPosition.distanceTo(oldest)).toBeGreaterThan(0.5);
    vfx.dispose();
  });

  it('keeps the frost wake in the scene while the bolt flies and drops it on reset', () => {
    const scene = new THREE.Scene();
    const vfx = new MageVFX(scene, { quality: 'high' });
    const { mixer } = castBasic(vfx, 16);
    const wakeCount = (): number => scene.children.filter((child) => child instanceof THREE.Points).length;
    expect(wakeCount()).toBeGreaterThan(0);

    for (let step = 0; step < 80; step += 1) {
      mixer.update(0.1);
      vfx.update(0.1);
    }
    vfx.clear();
    expect(wakeCount()).toBe(0);
    vfx.dispose();
  });
});

describe('PooledParticleCloud trail mode', () => {
  it('appends puffs with add() and restarts with emit()', () => {
    const cloud = new PooledParticleCloud(16, new THREE.Texture());
    const origin = new THREE.Vector3();
    cloud.add(origin, {
      color: 0xcfeaff,
      count: 3,
      speed: 0.4,
      spread: 0.7,
      lifetime: 0.5,
      size: [7, 16],
      opacity: 0.42,
      growth: 1.1,
    });
    expect(cloud.points.geometry.drawRange.count).toBe(3);
    cloud.add(origin, { color: 0xcfeaff, count: 2, speed: 0.4, spread: 0.7, lifetime: 0.5, size: [7, 16], opacity: 0.42 });
    expect(cloud.points.geometry.drawRange.count).toBe(5);

    cloud.emit(origin, { color: 0xcfeaff, count: 4, speed: 0.4, spread: 0.7, lifetime: 0.5 });
    expect(cloud.points.geometry.drawRange.count).toBe(4);

    // add() never overflows the fixed buffer.
    for (let burst = 0; burst < 10; burst += 1) {
      cloud.add(origin, { color: 0xcfeaff, count: 8, speed: 0.4, spread: 0.7, lifetime: 0.5 });
    }
    expect(cloud.points.geometry.drawRange.count).toBe(16);
    cloud.dispose();
  });

  it('honours an explicit opacity instead of dimming with the fill ratio', () => {
    const cloud = new PooledParticleCloud(64, new THREE.Texture());
    cloud.add(new THREE.Vector3(), {
      color: 0xcfeaff,
      count: 2,
      speed: 0.4,
      spread: 0.7,
      lifetime: 0.5,
      opacity: 0.42,
    });
    cloud.update(0.016);
    const material = cloud.points.material as THREE.ShaderMaterial;
    expect(material.uniforms.uOpacity.value).toBeCloseTo(0.42, 5);
    cloud.dispose();
  });
});
