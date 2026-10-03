import * as THREE from 'three';
import { MAGE_SPELL_TRAVEL_METERS } from '../combat/MageSpellFlight';
import { MAGE_VFX_LIMITS, mageQualityProfile } from './VFXConfig';
import { MageVFXResources } from './MageVFXResources';
import { PooledParticleCloud, qualityCount } from './ParticleManager';
import { VFXPool, type PoolableVFX } from './VFXPool';
import {
  configureEnergyMaterial,
  createEnergyTrailMaterial,
  setEnergyTime,
  type EnergyShaderMaterial,
} from './VFXMaterials';
import { VFXLightPool, type VFXLightHandle } from './VFXLightPool';
import type {
  MageProjectileConfig,
  MageProjectileFrostConfig,
  MageSpellPreset,
  MageVFXQuality,
} from './VFXTypes';

export interface MageProjectileImpact {
  readonly position: THREE.Vector3;
  readonly target: THREE.Object3D | null;
  readonly preset: MageSpellPreset;
}

interface ProjectileFireOptions {
  readonly origin: THREE.Vector3;
  readonly direction: THREE.Vector3;
  readonly target: THREE.Object3D | null;
  readonly preset: MageSpellPreset;
  readonly isTargetAlive?: (target: THREE.Object3D) => boolean;
  readonly queryBodyHit?: (
    from: THREE.Vector3,
    to: THREE.Vector3,
    spellRadius: number
  ) => THREE.Object3D | null;
  readonly onImpact: (impact: MageProjectileImpact) => void;
}

const FORWARD = new THREE.Vector3(0, 0, 1);
const TMP_TARGET = new THREE.Vector3();
const TMP_DIRECTION = new THREE.Vector3();
const TMP_LOCAL = new THREE.Vector3();
const TMP_NEXT = new THREE.Vector3();
/** Where the glow light sat relative to the projectile when it was a child. */
const LIGHT_LOCAL_OFFSET = new THREE.Vector3(0, 0.1, 0);
const TRAIL_SEGMENTS = 14;
/** Particles kept per bullet frost wake, in world space behind the bolt. */
const FROST_CLOUD_SIZE = 48;

/** Halo sprite diameter as a multiple of the projectile radius. */
function resolveHaloScale(preset: MageSpellPreset): number {
  const configured = preset.projectile.haloScale;
  if (typeof configured === 'number' && configured > 0) return configured;
  return preset.style === 'water' ? 4 : 3.4;
}

function resolveHaloOpacity(preset: MageSpellPreset): number {
  const configured = preset.projectile.haloOpacity;
  if (typeof configured === 'number' && configured >= 0) return configured;
  return preset.style === 'lava' ? 0.98 : 0.9;
}

function targetPoint(target: THREE.Object3D, output: THREE.Vector3): THREE.Vector3 {
  target.getWorldPosition(output);
  const bodyScale = Number(target.userData?.enemyBodyScale) || 1;
  output.y += 0.95 * bodyScale;
  return output;
}

function buildTrailIndices(): number[] {
  const indices: number[] = [];
  for (let segment = 0; segment < TRAIL_SEGMENTS - 1; segment += 1) {
    const a = segment * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }
  return indices;
}

function styleDistortion(preset: MageSpellPreset): number {
  switch (preset.style) {
    case 'lava': return 1.35;
    case 'water': return 1.15;
    case 'lightning': return 1.45;
    case 'laser': return 1.25;
    default: return 0.95;
  }
}

class MageProjectile implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly core: THREE.Mesh;
  private readonly iceShard: THREE.Mesh;
  private readonly lavaInner: THREE.Mesh;
  private readonly bulletBody: THREE.Mesh;
  private readonly bulletNose: THREE.Mesh;
  private readonly bulletShockCone: THREE.Mesh;
  private readonly glow: THREE.Sprite;
  private readonly trail: THREE.Mesh;
  private readonly trailGeometry = new THREE.BufferGeometry();
  private readonly trailPositions = new Float32Array(TRAIL_SEGMENTS * 2 * 3);
  private readonly trailUvs = new Float32Array(TRAIL_SEGMENTS * 2 * 2);
  private readonly trailPositionAttribute = new THREE.BufferAttribute(this.trailPositions, 3);
  private readonly secondaryParticles: PooledParticleCloud;
  private lightHandle: VFXLightHandle | null = null;
  private readonly trailMaterial: EnergyShaderMaterial;
  private config: MageProjectileConfig | null = null;
  private preset: MageSpellPreset | null = null;
  private target: THREE.Object3D | null = null;
  private isTargetAlive: ((target: THREE.Object3D) => boolean) | undefined;
  private queryBodyHit: ProjectileFireOptions['queryBodyHit'];
  private onImpact: ((impact: MageProjectileImpact) => void) | null = null;
  private direction = new THREE.Vector3(0, 0, 1);
  private age = 0;
  private traveled = 0;
  private haloScale = 3.4;
  private bullet = false;
  /** World-space frost wake: it must not follow the bolt once it is released. */
  private frostCloud: PooledParticleCloud | null = null;
  private frostConfig: MageProjectileFrostConfig | null = null;
  private frostTimer = 0;

  public constructor(
    private readonly resources: MageVFXResources,
    private readonly quality: MageVFXQuality,
    private readonly lightPool: VFXLightPool,
    private readonly scene: THREE.Scene
  ) {
    this.group.name = 'MageProjectileVFX';
    this.group.visible = false;

    this.core = new THREE.Mesh(resources.projectileSphere, new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.core.name = 'MageProjectileCore';

    this.iceShard = new THREE.Mesh(resources.coneShard, new THREE.MeshBasicMaterial({
      color: 0xdff7ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.iceShard.name = 'MageIceShardProjectile';
    this.iceShard.rotation.x = Math.PI / 2;
    this.iceShard.visible = false;

    this.lavaInner = new THREE.Mesh(resources.ember, new THREE.MeshBasicMaterial({
      color: 0xfff0c4,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.lavaInner.name = 'MageLavaWhiteHotCoreProjectile';
    this.lavaInner.visible = false;

    // Bullet silhouette: a small cylinder body, a cone nose pointing down the
    // flight axis (+Z, the group is aimed with setFromUnitVectors) and an open
    // shock cone bleeding backwards. All three are unit geometries scaled by the
    // projectile radius at fire time, so the same pool serves any spell.
    const bulletMaterial = (name: string): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.bulletBody = new THREE.Mesh(resources.bulletBody, bulletMaterial('MageBulletBody'));
    this.bulletBody.name = 'MageBulletBody';
    this.bulletBody.rotation.x = Math.PI / 2;
    this.bulletBody.visible = false;

    this.bulletNose = new THREE.Mesh(resources.bulletNose, bulletMaterial('MageBulletNose'));
    this.bulletNose.name = 'MageBulletNose';
    this.bulletNose.rotation.x = Math.PI / 2;
    this.bulletNose.visible = false;

    this.bulletShockCone = new THREE.Mesh(resources.bulletShockCone, bulletMaterial('MageBulletShockCone'));
    this.bulletShockCone.name = 'MageBulletShockCone';
    this.bulletShockCone.rotation.x = Math.PI / 2;
    (this.bulletShockCone.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
    this.bulletShockCone.visible = false;

    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: resources.softGlow,
      color: 0xffffff,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.glow.name = 'MageProjectileAuraGlow';

    for (let segment = 0; segment < TRAIL_SEGMENTS; segment += 1) {
      const t = segment / (TRAIL_SEGMENTS - 1);
      const uvOffset = segment * 4;
      this.trailUvs[uvOffset] = 0;
      this.trailUvs[uvOffset + 1] = t;
      this.trailUvs[uvOffset + 2] = 1;
      this.trailUvs[uvOffset + 3] = t;
    }
    this.trailGeometry.setAttribute('position', this.trailPositionAttribute);
    this.trailGeometry.setAttribute('uv', new THREE.BufferAttribute(this.trailUvs, 2));
    this.trailGeometry.setIndex(buildTrailIndices());
    this.trailMaterial = createEnergyTrailMaterial({ opacity: 0, intensity: 1.45, thickness: 1.15, depthTest: true });
    this.trail = new THREE.Mesh(this.trailGeometry, this.trailMaterial);
    this.trail.name = 'MageProjectileRibbonTrail';
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 4;

    this.secondaryParticles = new PooledParticleCloud(38, resources.softGlow);
    this.group.add(
      this.trail,
      this.core,
      this.iceShard,
      this.lavaInner,
      this.bulletShockCone,
      this.bulletBody,
      this.bulletNose,
      this.glow,
      this.secondaryParticles.points
    );
  }

  public fire(options: ProjectileFireOptions): void {
    this.preset = options.preset;
    this.config = options.preset.projectile;
    this.target = options.target;
    this.isTargetAlive = options.isTargetAlive;
    this.queryBodyHit = options.queryBodyHit;
    this.onImpact = options.onImpact;
    this.age = 0;
    this.traveled = 0;
    this.group.visible = true;
    this.group.position.copy(options.origin);
    this.direction.copy(options.direction).setY(options.direction.y);
    if (this.direction.lengthSq() <= 1e-8) this.direction.set(0, 0, 1);
    this.direction.normalize();
    this.group.quaternion.setFromUnitVectors(FORWARD, this.direction);

    const radius = options.preset.projectile.radius;
    this.bullet = options.preset.projectile.shape === 'bullet';
    this.configureBullet(options.preset, radius);

    const coreMaterial = this.core.material as THREE.MeshBasicMaterial;
    coreMaterial.color.set(options.preset.colors.core);
    coreMaterial.opacity = this.bullet ? 1 : options.preset.style === 'ice' ? 0.28 : 0.96;
    this.core.visible = this.bullet || options.preset.style !== 'ice';
    this.core.scale.setScalar(radius * (this.bullet ? 0.75 : options.preset.style === 'water' ? 1.25 : 1.15));
    // On the bullet the core is the white-hot tip at the end of the nose.
    this.core.position.set(0, 0, this.bullet ? radius * 2.8 : 0);

    this.iceShard.visible = options.preset.style === 'ice' && !this.bullet;
    (this.iceShard.material as THREE.MeshBasicMaterial).opacity = this.iceShard.visible ? 0.95 : 0;
    (this.iceShard.material as THREE.MeshBasicMaterial).color.set(options.preset.colors.core);
    this.iceShard.scale.setScalar(radius * 3.3);

    this.lavaInner.visible = options.preset.style === 'lava' && !this.bullet;
    (this.lavaInner.material as THREE.MeshBasicMaterial).opacity = this.lavaInner.visible ? 1 : 0;
    (this.lavaInner.material as THREE.MeshBasicMaterial).color.set(options.preset.colors.core);
    this.lavaInner.scale.setScalar(radius * 2.2);

    const glowMaterial = this.glow.material as THREE.SpriteMaterial;
    glowMaterial.map = this.resources.mageTexture(options.preset.style, 'charge');
    glowMaterial.color.set(options.preset.colors.glow);
    glowMaterial.opacity = resolveHaloOpacity(options.preset);
    this.secondaryParticles.setTexture(this.resources.mageTexture(options.preset.style, 'charge'));
    this.haloScale = resolveHaloScale(options.preset);
    this.glow.scale.setScalar(radius * this.haloScale);
    this.configureFrost(options.preset);

    const profile = mageQualityProfile(this.quality);
    configureEnergyMaterial(this.trailMaterial, {
      colorA: options.preset.colors.core,
      colorB: options.preset.colors.secondary,
      opacity: this.bullet
        ? 0.55
        : options.preset.style === 'water' ? 0.72 : options.preset.style === 'lava' ? 0.94 : 0.82,
      intensity: options.preset.style === 'lava' ? 1.9 : options.preset.style === 'lightning' ? 2.1 : 1.55,
      noiseScale: options.preset.style === 'water' ? 1.1 : 1.45,
      scrollSpeed: options.preset.style === 'lava' ? 1.45 : options.preset.style === 'lightning' ? 2.6 : 1.65,
      thickness: this.bullet ? 0.62 : options.preset.id === 'basic' ? 0.8 : 1.08,
      distortion: styleDistortion(options.preset) * profile.distortionMultiplier,
    });
    this.updateTrailGeometry(options.preset.projectile.trailLength, options.preset.projectile.trailWidth);

    // Borrowed from the shared pool: no scene add/remove, so no recompiles.
    // (The glow map swap above needs no needsUpdate: the sprite is constructed
    // with a map, so texture-to-texture swaps keep the same program.)
    this.lightHandle = profile.enableSecondaryLights ? this.lightPool.acquire() : null;
    if (this.lightHandle) {
      this.lightHandle.light.color.set(options.preset.colors.glow);
      this.lightHandle.light.intensity = options.preset.style === 'lava' ? 0.9 : this.bullet ? 0.32 : 0.55;
      this.lightHandle.light.distance = options.preset.projectile.radius * (this.bullet ? 14 : 8);
      this.syncLightPosition();
    }
    this.emitSecondaryWake();
  }

  public update(delta: number): boolean {
    if (!this.config || !this.preset || !this.onImpact) return false;
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    setEnergyTime(this.trailMaterial, this.age);

    if (this.target && this.isTargetAlive && !this.isTargetAlive(this.target)) {
      this.target = null;
    }

    if (this.target) {
      targetPoint(this.target, TMP_TARGET);
      TMP_DIRECTION.subVectors(TMP_TARGET, this.group.position);
      if (TMP_DIRECTION.lengthSq() > 1e-8) {
        this.direction.copy(TMP_DIRECTION).normalize();
        this.group.quaternion.setFromUnitVectors(FORWARD, this.direction);
      }
    }

    const step = this.config.speed * elapsed;
    const hitDistance = this.target
      ? targetPoint(this.target, TMP_TARGET).distanceTo(this.group.position)
      : Number.POSITIVE_INFINITY;
    if (
      this.target
      && this.traveled < MAGE_SPELL_TRAVEL_METERS
      && hitDistance <= Math.max(this.config.radius, step)
    ) {
      this.group.position.copy(TMP_TARGET);
      this.impact();
      return false;
    }

    const travel = Math.min(step, Math.max(0, MAGE_SPELL_TRAVEL_METERS - this.traveled));
    const next = TMP_NEXT.copy(this.group.position).addScaledVector(this.direction, travel);
    const blocker = this.queryBodyHit?.(this.group.position, next, Math.max(0.35, this.config.radius));
    if (blocker) {
      this.target = blocker;
      this.group.position.copy(targetPoint(blocker, TMP_TARGET));
      this.impact();
      return false;
    }

    const reachedEnd = this.traveled + step >= MAGE_SPELL_TRAVEL_METERS - 1e-4;
    this.group.position.copy(next);
    this.traveled += travel;
    if (reachedEnd) {
      if (!this.target || hitDistance > Math.max(this.config.radius, travel + 0.05)) {
        this.target = null;
      }
      this.impact();
      return false;
    }
    this.updateTrailGeometry(this.config.trailLength, this.config.trailWidth);
    this.secondaryParticles.points.position.copy(TMP_LOCAL.set(0, 0, -this.config.trailLength * 0.26));
    this.secondaryParticles.update(elapsed);
    this.updateFrost(elapsed);

    const pulse = 0.92 + Math.sin(this.age * (this.preset.style === 'water' ? 18 : 28)) * 0.08;
    this.glow.scale.setScalar(this.config.radius * this.haloScale * pulse);
    if (this.bullet) {
      // Slow roll around the flight axis: the bolt keeps its silhouette but
      // never looks like a static decal.
      this.bulletBody.rotation.y += elapsed * 6;
      this.bulletNose.rotation.y += elapsed * 6;
    }
    this.core.rotation.y += elapsed * (this.preset.style === 'water' ? 4 : 2);
    this.iceShard.rotation.z += elapsed * 5;
    this.lavaInner.rotation.x += elapsed * 7;
    if (this.lightHandle) {
      this.lightHandle.light.intensity *= 0.985;
      this.syncLightPosition();
    }

    if (this.age % 0.075 < elapsed) this.emitSecondaryWake();

    if (this.age >= this.config.lifetime) {
      this.impact();
      return false;
    }
    return true;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.target = null;
    this.config = null;
    this.preset = null;
    this.onImpact = null;
    this.isTargetAlive = undefined;
    this.queryBodyHit = undefined;
    this.age = 0;
    this.traveled = 0;
    this.secondaryParticles.reset();
    this.iceShard.visible = false;
    this.lavaInner.visible = false;
    this.core.position.set(0, 0, 0);
    this.bullet = false;
    this.bulletBody.visible = false;
    this.bulletNose.visible = false;
    this.bulletShockCone.visible = false;
    (this.bulletBody.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.bulletNose.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.bulletShockCone.material as THREE.MeshBasicMaterial).opacity = 0;
    this.releaseFrost();
    this.lightHandle?.release();
    this.lightHandle = null;
    this.trailMaterial.uniforms.uOpacity.value = 0;
  }

  public dispose(): void {
    (this.core.material as THREE.Material).dispose();
    (this.iceShard.material as THREE.Material).dispose();
    (this.lavaInner.material as THREE.Material).dispose();
    (this.bulletBody.material as THREE.Material).dispose();
    (this.bulletNose.material as THREE.Material).dispose();
    (this.bulletShockCone.material as THREE.Material).dispose();
    (this.glow.material as THREE.Material).dispose();
    this.trailMaterial.dispose();
    this.trailGeometry.dispose();
    this.secondaryParticles.dispose();
    this.releaseFrost();
    this.frostCloud?.dispose();
    this.frostCloud = null;
  }

  /**
   * Scales the three unit meshes into the small bolt silhouette: nose cone at
   * +Z (flight axis), body behind it, hollow shock cone bleeding backwards.
   */
  private configureBullet(preset: MageSpellPreset, radius: number): void {
    const body = this.bulletBody.material as THREE.MeshBasicMaterial;
    const nose = this.bulletNose.material as THREE.MeshBasicMaterial;
    const shock = this.bulletShockCone.material as THREE.MeshBasicMaterial;

    this.bulletBody.visible = this.bullet;
    this.bulletNose.visible = this.bullet;
    this.bulletShockCone.visible = this.bullet;
    if (!this.bullet) {
      body.opacity = 0;
      nose.opacity = 0;
      shock.opacity = 0;
      return;
    }

    const bodyLength = radius * 3.2;
    const bodyThickness = radius * 1.5;
    this.bulletBody.scale.set(bodyThickness, bodyLength, bodyThickness);
    this.bulletBody.position.set(0, 0, -radius);
    body.color.set(preset.colors.glow);
    body.opacity = 0.95;

    const noseLength = radius * 2.4;
    this.bulletNose.scale.set(bodyThickness, noseLength, bodyThickness);
    this.bulletNose.position.set(0, 0, radius * 1.8);
    nose.color.set(preset.colors.core);
    nose.opacity = 0.98;

    const shockLength = radius * 3.1;
    this.bulletShockCone.scale.set(radius * 2.4, shockLength, radius * 2.4);
    this.bulletShockCone.position.set(0, 0, -radius * 2.1);
    shock.color.set(preset.colors.secondary);
    shock.opacity = 0.22;
  }

  /** Builds (once) and restarts the world-space frost wake of this bolt. */
  private configureFrost(preset: MageSpellPreset): void {
    this.frostConfig = preset.projectile.frost ?? null;
    this.frostTimer = 0;
    if (!this.frostConfig) return;
    if (!this.frostCloud) {
      const blending = this.frostConfig.blending === 'normal' ? 'normal' as const : 'additive' as const;
      this.frostCloud = new PooledParticleCloud(FROST_CLOUD_SIZE, this.resources.smoke, { blending });
    }
    this.frostCloud.reset();
    // The wake lives in the scene, not under the bolt: particles must stay
    // where they were released while the bolt keeps flying (a child cloud would
    // drag the whole trail along).
    this.scene.add(this.frostCloud.points);
  }

  private releaseFrost(): void {
    this.frostConfig = null;
    this.frostTimer = 0;
    this.frostCloud?.reset();
    this.frostCloud?.points.removeFromParent();
  }

  private updateFrost(delta: number): void {
    const frost = this.frostConfig;
    const cloud = this.frostCloud;
    if (!frost || !cloud) return;
    const interval = Math.max(0.008, frost.interval);
    this.frostTimer += delta;
    const perPuff = Math.max(
      1,
      Math.round(frost.count * mageQualityProfile(this.quality).smokeMultiplier)
    );
    let puffs = 0;
    while (this.frostTimer >= interval && puffs < 4) {
      this.frostTimer -= interval;
      puffs += 1;
      cloud.add(this.group.position, {
        color: frost.color,
        count: perPuff,
        speed: frost.speed,
        spread: frost.spread,
        lifetime: frost.lifetime,
        upwardBias: frost.upwardBias ?? 0,
        size: frost.size,
        opacity: frost.opacity,
        growth: frost.growth ?? 1,
      });
    }
    cloud.update(delta);
  }

  /**
   * The pooled light lives at scene level, so mirror the exact world spot the
   * old child light had (group transform applied to its local offset).
   */
  private syncLightPosition(): void {
    if (!this.lightHandle) return;
    this.lightHandle.light.position
      .copy(LIGHT_LOCAL_OFFSET)
      .applyQuaternion(this.group.quaternion)
      .add(this.group.position);
  }

  private updateTrailGeometry(length: number, width: number): void {
    if (!this.preset) return;
    for (let segment = 0; segment < TRAIL_SEGMENTS; segment += 1) {
      const t = segment / (TRAIL_SEGMENTS - 1);
      const fade = Math.pow(1 - t, 0.72);
      const wave = Math.sin(t * Math.PI * (this.preset.style === 'water' ? 4.5 : 2.6) + this.age * (this.preset.style === 'lightning' ? 32 : 10));
      const irregular = Math.sin(t * 17.3 + this.age * 7.1) * width * (this.preset.style === 'lava' ? 0.42 : 0.22);
      const centerX = (wave * width * 0.42 + irregular) * t;
      const y = Math.sin(t * Math.PI) * width * (this.preset.style === 'water' ? 0.9 : 0.45);
      const half = Math.max(0.006, width * fade * (this.preset.style === 'lava' ? 1.25 : 1));
      const z = -length * t;
      const left = segment * 6;
      const right = left + 3;
      this.trailPositions[left] = centerX - half;
      this.trailPositions[left + 1] = y;
      this.trailPositions[left + 2] = z;
      this.trailPositions[right] = centerX + half;
      this.trailPositions[right + 1] = -y * 0.4;
      this.trailPositions[right + 2] = z;
    }
    this.trailPositionAttribute.needsUpdate = true;
    this.trailGeometry.computeBoundingSphere();
  }

  private emitSecondaryWake(): void {
    if (!this.preset) return;
    const profile = mageQualityProfile(this.quality);
    // The bullet already carries a frost wake, so its sparkles stay sparse.
    const base = this.bullet
      ? 4
      : this.preset.style === 'lava' || this.preset.style === 'water'
        ? 16
        : this.preset.style === 'ice'
          ? 12
          : 10;
    this.secondaryParticles.emit(new THREE.Vector3(), {
      color: this.preset.style === 'lava' ? (this.preset.colors.smoke ?? this.preset.colors.secondary) : this.preset.colors.spark,
      count: Math.max(1, Math.round(base * profile.particleMultiplier)),
      speed: this.preset.style === 'lava' ? 0.75 : this.bullet ? 0.7 : 1.05,
      spread: this.preset.style === 'water' ? 1.2 : this.bullet ? 0.7 : 0.82,
      lifetime: this.preset.style === 'lava' ? 0.58 : this.bullet ? 0.3 : 0.44,
      upwardBias: this.preset.style === 'lava' ? 0.22 : 0.05,
      ...(this.bullet ? { size: [0.8, 2] as const } : {}),
    });
  }

  private impact(): void {
    if (!this.preset || !this.onImpact) return;
    this.onImpact({
      position: this.group.position.clone(),
      target: this.target,
      preset: this.preset,
    });
  }
}

export class ProjectileManager {
  private readonly pool: VFXPool<MageProjectile>;
  private readonly active: MageProjectile[] = [];

  public constructor(
    private readonly scene: THREE.Scene,
    resources: MageVFXResources,
    quality: MageVFXQuality,
    lightPool: VFXLightPool
  ) {
    this.pool = new VFXPool(
      // Scene is handed to each bolt so its frost wake can live in world space.
      () => new MageProjectile(resources, quality, lightPool, scene),
      MAGE_VFX_LIMITS.maxProjectiles
    );
  }

  public fire(options: ProjectileFireOptions): boolean {
    const projectile = this.pool.acquire();
    if (!projectile) return false;
    projectile.fire(options);
    this.scene.add(projectile.group);
    this.active.push(projectile);
    return true;
  }

  public update(delta: number): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const projectile = this.active[index];
      if (projectile.update(delta)) continue;
      this.pool.release(projectile);
      this.active.splice(index, 1);
    }
  }

  public clear(): void {
    for (const projectile of this.active) this.pool.release(projectile);
    this.active.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.pool.dispose();
  }

  public get activeCount(): number { return this.active.length; }
  public get pooledCount(): number { return this.pool.inactiveCount; }
}
