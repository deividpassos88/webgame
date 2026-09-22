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
import type { MageProjectileConfig, MageSpellPreset, MageVFXQuality } from './VFXTypes';

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
const TRAIL_SEGMENTS = 14;

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
  private readonly glow: THREE.Sprite;
  private readonly trail: THREE.Mesh;
  private readonly trailGeometry = new THREE.BufferGeometry();
  private readonly trailPositions = new Float32Array(TRAIL_SEGMENTS * 2 * 3);
  private readonly trailUvs = new Float32Array(TRAIL_SEGMENTS * 2 * 2);
  private readonly trailPositionAttribute = new THREE.BufferAttribute(this.trailPositions, 3);
  private readonly secondaryParticles: PooledParticleCloud;
  private readonly light = new THREE.PointLight(0xffffff, 0, 3.8, 2);
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

  public constructor(
    private readonly resources: MageVFXResources,
    private readonly quality: MageVFXQuality
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
    this.light.castShadow = false;
    this.group.add(this.trail, this.core, this.iceShard, this.lavaInner, this.glow, this.secondaryParticles.points, this.light);
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

    const coreMaterial = this.core.material as THREE.MeshBasicMaterial;
    coreMaterial.color.set(options.preset.colors.core);
    coreMaterial.opacity = options.preset.style === 'ice' ? 0.28 : 0.96;
    this.core.visible = options.preset.style !== 'ice';
    this.core.scale.setScalar(options.preset.projectile.radius * (options.preset.style === 'water' ? 1.25 : 1.15));

    this.iceShard.visible = options.preset.style === 'ice';
    (this.iceShard.material as THREE.MeshBasicMaterial).opacity = options.preset.style === 'ice' ? 0.95 : 0;
    (this.iceShard.material as THREE.MeshBasicMaterial).color.set(options.preset.colors.core);
    this.iceShard.scale.setScalar(options.preset.projectile.radius * 3.3);

    this.lavaInner.visible = options.preset.style === 'lava';
    (this.lavaInner.material as THREE.MeshBasicMaterial).opacity = options.preset.style === 'lava' ? 1 : 0;
    (this.lavaInner.material as THREE.MeshBasicMaterial).color.set(options.preset.colors.core);
    this.lavaInner.scale.setScalar(options.preset.projectile.radius * 2.2);

    const glowMaterial = this.glow.material as THREE.SpriteMaterial;
    glowMaterial.map = this.resources.mageTexture(options.preset.style, 'charge');
    glowMaterial.needsUpdate = true;
    glowMaterial.color.set(options.preset.colors.glow);
    glowMaterial.opacity = options.preset.style === 'lava' ? 0.98 : 0.9;
    this.secondaryParticles.setTexture(this.resources.mageTexture(options.preset.style, 'charge'));
    this.glow.scale.setScalar(options.preset.projectile.radius * (options.preset.style === 'water' ? 4.0 : 3.4));

    const profile = mageQualityProfile(this.quality);
    configureEnergyMaterial(this.trailMaterial, {
      colorA: options.preset.colors.core,
      colorB: options.preset.colors.secondary,
      opacity: options.preset.style === 'water' ? 0.72 : options.preset.style === 'lava' ? 0.94 : 0.82,
      intensity: options.preset.style === 'lava' ? 1.9 : options.preset.style === 'lightning' ? 2.1 : 1.55,
      noiseScale: options.preset.style === 'water' ? 1.1 : 1.45,
      scrollSpeed: options.preset.style === 'lava' ? 1.45 : options.preset.style === 'lightning' ? 2.6 : 1.65,
      thickness: options.preset.id === 'basic' ? 0.8 : 1.08,
      distortion: styleDistortion(options.preset) * profile.distortionMultiplier,
    });
    this.updateTrailGeometry(options.preset.projectile.trailLength, options.preset.projectile.trailWidth);

    this.light.color.set(options.preset.colors.glow);
    this.light.visible = profile.enableSecondaryLights;
    this.light.intensity = this.light.visible ? (options.preset.style === 'lava' ? 0.9 : 0.55) : 0;
    this.light.distance = options.preset.projectile.radius * 8;
    this.light.position.set(0, 0.1, 0);
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

    const pulse = 0.92 + Math.sin(this.age * (this.preset.style === 'water' ? 18 : 28)) * 0.08;
    this.glow.scale.setScalar(this.config.radius * (this.preset.style === 'water' ? 3.6 : 3.1) * pulse);
    this.core.rotation.y += elapsed * (this.preset.style === 'water' ? 4 : 2);
    this.iceShard.rotation.z += elapsed * 5;
    this.lavaInner.rotation.x += elapsed * 7;
    this.light.intensity *= 0.985;

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
    this.light.intensity = 0;
    this.trailMaterial.uniforms.uOpacity.value = 0;
  }

  public dispose(): void {
    (this.core.material as THREE.Material).dispose();
    (this.iceShard.material as THREE.Material).dispose();
    (this.lavaInner.material as THREE.Material).dispose();
    (this.glow.material as THREE.Material).dispose();
    this.trailMaterial.dispose();
    this.trailGeometry.dispose();
    this.secondaryParticles.dispose();
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
    const base = this.preset.style === 'lava' ? 16 : this.preset.style === 'water' ? 16 : this.preset.style === 'ice' ? 12 : 10;
    this.secondaryParticles.emit(new THREE.Vector3(), {
      color: this.preset.style === 'lava' ? (this.preset.colors.smoke ?? this.preset.colors.secondary) : this.preset.colors.spark,
      count: Math.max(1, Math.round(base * profile.particleMultiplier)),
      speed: this.preset.style === 'lava' ? 0.75 : 1.05,
      spread: this.preset.style === 'water' ? 1.2 : 0.82,
      lifetime: this.preset.style === 'lava' ? 0.58 : 0.44,
      upwardBias: this.preset.style === 'lava' ? 0.22 : 0.05,
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
    quality: MageVFXQuality
  ) {
    this.pool = new VFXPool(
      () => new MageProjectile(resources, quality),
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
