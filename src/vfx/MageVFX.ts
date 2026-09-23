import * as THREE from 'three';
import { MAGE_SPELL_TRAVEL_METERS } from '../combat/MageSpellFlight';
import { CameraShake } from './CameraShake';
import { DEFAULT_MAGE_VFX_QUALITY, MAGE_SPELL_PRESETS, MAGE_VFX_LIMITS, mageQualityProfile } from './VFXConfig';
import { ImpactVFX } from './ImpactVFX';
import { LaserVFX } from './LaserVFX';
import { LightningVFX } from './LightningVFX';
import { MageVFXResources } from './MageVFXResources';
import { MagicCircleVFX } from './MagicCircleVFX';
import { PooledParticleCloud, qualityCount } from './ParticleManager';
import { ProjectileManager, type MageProjectileImpact } from './ProjectileManager';
import { VFXPool, type PoolableVFX } from './VFXPool';
import { VFXLightPool, type VFXLightHandle } from './VFXLightPool';
import { VFXTimeline } from './VFXTimeline';
import type {
  MageCastContext,
  MageSpellId,
  MageSpellPreset,
  MageVFXDiagnostics,
  MageVFXQuality,
} from './VFXTypes';

const HAND_OFFSET = new THREE.Vector3(0, 0.04, 0.02);
const TMP_WORLD = new THREE.Vector3();
const TMP_WORLD_2 = new THREE.Vector3();
const TMP_DIRECTION = new THREE.Vector3();
const TMP_CASTER = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const TMP_COLOR = new THREE.Color();
const TMP_COLOR_2 = new THREE.Color();

type MageTimelineEvent = 'charge' | 'secondary-charge' | 'magic-circle' | 'launch' | 'stop-charge' | 'recover';

class ChargeOrbEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly core: THREE.Mesh;
  private readonly glow: THREE.Sprite;
  private readonly orbitParticles: PooledParticleCloud;
  private readonly sparks: PooledParticleCloud;
  private readonly accents: THREE.Mesh[] = [];
  private lightHandle: VFXLightHandle | null = null;
  private age = 0;
  private intensity = 0;
  private preset: MageSpellPreset | null = null;

  public constructor(
    private readonly resources: MageVFXResources,
    private readonly quality: MageVFXQuality,
    private readonly lightPool: VFXLightPool
  ) {
    this.group.name = 'MageChargeOrbVFX';
    this.group.visible = false;
    this.group.position.copy(HAND_OFFSET);

    this.core = new THREE.Mesh(resources.sphere, new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.core.name = 'MageChargeOrbCore';

    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: resources.softGlow,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.glow.name = 'MageChargeOrbGlow';

    for (let index = 0; index < 12; index += 1) {
      const geometry = index % 3 === 0
        ? resources.iceShard
        : index % 3 === 1
          ? resources.droplet
          : resources.ember;
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      mesh.name = 'MageChargeAccent';
      mesh.visible = false;
      this.accents.push(mesh);
      this.group.add(mesh);
    }

    this.orbitParticles = new PooledParticleCloud(42, resources.softGlow);
    this.sparks = new PooledParticleCloud(28, resources.softGlow);
    this.group.add(this.glow, this.core, this.orbitParticles.points, this.sparks.points);
  }

  public play(preset: MageSpellPreset): void {
    this.preset = preset;
    this.age = 0;
    this.intensity = 0;
    this.group.visible = true;
    this.group.scale.setScalar(0.28 * preset.charge.scale);

    (this.core.material as THREE.MeshBasicMaterial).color.set(preset.colors.core);
    (this.core.material as THREE.MeshBasicMaterial).opacity = 0.65;
    const glowMaterial = this.glow.material as THREE.SpriteMaterial;
    glowMaterial.map = this.resources.mageTexture(preset.style, 'charge');
    glowMaterial.color.set(preset.colors.glow);
    glowMaterial.opacity = 0.72;
    this.orbitParticles.setTexture(this.resources.mageTexture(preset.style, 'charge'));
    this.sparks.setTexture(this.resources.mageTexture(preset.style, 'charge'));
    // Borrowed from the shared pool: no scene add/remove, so no recompiles.
    // (The glow map swap above needs no needsUpdate: the sprite is constructed
    // with a map, so texture-to-texture swaps keep the same program.)
    this.lightHandle = mageQualityProfile(this.quality).enableSecondaryLights
      ? this.lightPool.acquire()
      : null;
    if (this.lightHandle) {
      this.lightHandle.light.color.set(preset.colors.glow);
      this.lightHandle.light.intensity = 0;
      this.lightHandle.light.distance = preset.style === 'laser' ? 4.2 : 3.2;
      this.lightHandle.light.position.copy(this.group.position);
    }

    this.orbitParticles.emit(new THREE.Vector3(), {
      color: preset.colors.secondary,
      count: qualityCount(preset.charge.particleCount, this.quality, preset.qualityParticleMultiplier),
      speed: preset.style === 'water' ? 0.52 : 0.32,
      spread: preset.style === 'water' ? 0.72 : 0.48,
      lifetime: 999,
    });
    this.sparks.reset();
    this.configureAccents(preset);
  }

  public update(delta: number): void {
    if (!this.active || !this.preset) return;
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    this.intensity = THREE.MathUtils.clamp(this.intensity + elapsed * (this.preset.style === 'laser' ? 1.8 : 2.8), 0, 1);
    const pulseRate = this.preset.style === 'lightning' ? 34 : this.preset.style === 'water' ? 12 : 18;
    const pulse = 1 + Math.sin(this.age * pulseRate) * (this.preset.style === 'lightning' ? 0.14 : 0.08);
    const scale = (0.45 + this.intensity * (this.preset.style === 'laser' ? 1.05 : 0.75)) * this.preset.charge.scale * pulse;
    this.group.scale.setScalar(scale);
    this.group.rotation.y += elapsed * (this.preset.style === 'water' ? 6.2 : 4.2);
    this.group.rotation.z -= elapsed * (this.preset.style === 'lava' ? 3.5 : 1.9);

    TMP_COLOR.set(this.preset.colors.core).lerp(TMP_COLOR_2.set(this.preset.colors.glow), this.intensity * 0.65);
    (this.core.material as THREE.MeshBasicMaterial).color.copy(TMP_COLOR);
    (this.core.material as THREE.MeshBasicMaterial).opacity = 0.65 + this.intensity * 0.3;
    (this.glow.material as THREE.SpriteMaterial).opacity = 0.32 + this.intensity * 0.5;
    this.glow.scale.setScalar(2.2 + this.intensity * (this.preset.style === 'laser' ? 2.8 : 1.6));
    if (this.lightHandle) {
      this.lightHandle.light.intensity = this.preset.charge.lightIntensity * this.intensity;
      this.lightHandle.light.position.copy(this.group.position);
    }

    this.updateOrbitParticles();
    this.updateAccents(elapsed);
    const sparkInterval = this.preset.style === 'lightning' ? 0.05 : this.preset.style === 'lava' ? 0.09 : 0.12;
    if (this.age % sparkInterval < elapsed) {
      this.sparks.emit(new THREE.Vector3(), {
        color: this.preset.colors.spark,
        count: qualityCount(this.preset.charge.sparkCount, this.quality, this.preset.qualityParticleMultiplier),
        speed: this.preset.style === 'lightning' ? 1.2 : 0.58,
        spread: this.preset.style === 'lightning' ? 1.05 : 0.75,
        lifetime: this.preset.style === 'lava' ? 0.32 : 0.24,
        upwardBias: this.preset.style === 'lava' ? 0.35 : 0,
      });
    }
    this.sparks.update(elapsed);
  }

  public setWorldPosition(position: THREE.Vector3): void {
    this.group.position.copy(position);
  }

  public worldPosition(output: THREE.Vector3): THREE.Vector3 {
    this.group.getWorldPosition(output);
    return output;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.intensity = 0;
    this.preset = null;
    this.lightHandle?.release();
    this.lightHandle = null;
    this.orbitParticles.reset();
    this.sparks.reset();
    (this.core.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.glow.material as THREE.SpriteMaterial).opacity = 0;
    for (const mesh of this.accents) {
      mesh.visible = false;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
    }
  }

  public dispose(): void {
    (this.core.material as THREE.Material).dispose();
    (this.glow.material as THREE.Material).dispose();
    for (const mesh of this.accents) (mesh.material as THREE.Material).dispose();
    this.orbitParticles.dispose();
    this.sparks.dispose();
  }

  private configureAccents(preset: MageSpellPreset): void {
    const profile = mageQualityProfile(this.quality);
    const visibleCount = preset.style === 'ice'
      ? Math.round(8 * profile.iceShardMultiplier)
      : preset.style === 'water'
        ? Math.round(10 * profile.particleMultiplier)
        : preset.style === 'lava'
          ? Math.round(8 * profile.particleMultiplier)
          : preset.style === 'laser'
            ? Math.round(10 * profile.particleMultiplier)
            : 0;
    for (let index = 0; index < this.accents.length; index += 1) {
      const mesh = this.accents[index];
      const visible = index < visibleCount;
      mesh.visible = visible;
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = visible ? 0.82 : 0;
      material.color.set(preset.style === 'lava' ? preset.colors.spark : preset.style === 'water' ? preset.colors.glow : preset.colors.core);
      mesh.scale.setScalar((preset.style === 'ice' ? 0.9 : 0.65) * (0.7 + Math.random() * 0.5));
    }
  }

  private updateOrbitParticles(): void {
    if (!this.preset) return;
    const points = this.orbitParticles.points;
    const geometry = points.geometry as THREE.BufferGeometry;
    const attribute = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!attribute) return;
    const positions = attribute.array as Float32Array;
    const count = Math.min(attribute.count, qualityCount(this.preset.charge.particleCount, this.quality, this.preset.qualityParticleMultiplier));
    geometry.setDrawRange(0, count);
    const water = this.preset.style === 'water';
    const laser = this.preset.style === 'laser';
    for (let index = 0; index < count; index += 1) {
      const phase = this.age * (water ? 4.8 : laser ? -3.6 : 2.4 + index * 0.035) + index * 2.399;
      const radius = (water ? 0.34 : laser ? 0.42 - this.intensity * 0.18 : 0.2) + (index % 5) * 0.018;
      const offset = index * 3;
      positions[offset] = Math.cos(phase) * radius;
      positions[offset + 1] = Math.sin(phase * (water ? 0.8 : 1.7)) * (water ? 0.16 : 0.08);
      positions[offset + 2] = Math.sin(phase) * radius;
      if (laser) {
        positions[offset] *= 1 - this.intensity * 0.38;
        positions[offset + 2] *= 1 - this.intensity * 0.38;
      }
    }
    attribute.needsUpdate = true;
    points.visible = true;
    this.orbitParticles.setOpacity(water ? 0.62 : 0.75);
  }

  private updateAccents(delta: number): void {
    if (!this.preset) return;
    for (let index = 0; index < this.accents.length; index += 1) {
      const mesh = this.accents[index];
      if (!mesh.visible) continue;
      const phase = this.age * (this.preset.style === 'water' ? 5.5 : 2.8) + index * 0.9;
      const radius = this.preset.style === 'laser' ? 0.34 - this.intensity * 0.12 : 0.28 + (index % 4) * 0.025;
      mesh.position.set(Math.cos(phase) * radius, Math.sin(phase * 1.3) * 0.12, Math.sin(phase) * radius);
      mesh.rotation.x += delta * (1.5 + index * 0.1);
      mesh.rotation.y += delta * (2.2 + index * 0.07);
    }
  }
}


const MAGE_BARRIER_POST_SKILL_PROTECTION_SECONDS = 1;
const MAGE_BARRIER_BREAK_SECONDS = 0.35;

class BarrierAuraEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly shell: THREE.Mesh;
  private readonly shellMaterial: THREE.MeshPhysicalMaterial;
  private readonly rim: THREE.Sprite;
  private readonly rimMaterial: THREE.SpriteMaterial;
  private readonly particles: PooledParticleCloud;
  private caster: THREE.Object3D | null = null;
  private action: THREE.AnimationAction | null = null;
  private preset: MageSpellPreset | null = null;
  private age = 0;
  private postEndAge = 0;
  private breakParticlesEmitted = false;
  private shimmerAge = 0;

  public constructor(
    private readonly resources: MageVFXResources,
    private readonly quality: MageVFXQuality
  ) {
    this.group.name = 'MageSkillSoapBubbleBarrierVFX';
    this.group.visible = false;

    this.shellMaterial = new THREE.MeshPhysicalMaterial({
      map: resources.barrierFilm,
      color: 0xdffcff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      roughness: 0.035,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      // Transmission forces Three.js to render an additional refraction pass for
      // the whole scene; on the Mage protection skill that doubled the visible
      // triangle cost and caused multi-second stalls. Keep the soap-bubble look
      // with transparency/clearcoat/iridescence, but avoid the transmission pass.
      transmission: 0,
      thickness: 0,
      ior: 1.08,
      reflectivity: 0.85,
      iridescence: 0.78,
      iridescenceIOR: 1.28,
      iridescenceThicknessRange: [120, 420],
      toneMapped: false,
    });

    this.shell = new THREE.Mesh(resources.barrierSphere, this.shellMaterial);
    this.shell.name = 'MageSkillThinSoapBubbleFilm';
    this.shell.scale.set(1.08, 1.42, 1.08);
    this.shell.frustumCulled = false;

    this.rimMaterial = new THREE.SpriteMaterial({
      map: resources.barrierAura,
      color: 0xe8fdff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.rim = new THREE.Sprite(this.rimMaterial);
    this.rim.name = 'MageSkillBubbleMirrorRim';

    this.particles = new PooledParticleCloud(48, resources.barrierAura);
    this.group.add(this.shell, this.rim, this.particles.points);
  }

  public play(caster: THREE.Object3D, preset: MageSpellPreset): void {
    this.caster = caster;
    this.action = null;
    this.preset = preset;
    this.age = 0;
    this.postEndAge = 0;
    this.breakParticlesEmitted = false;
    this.shimmerAge = 0;
    this.group.visible = true;
    this.group.scale.setScalar(1);
    this.shell.visible = true;
    this.rim.visible = true;
    this.shell.rotation.set(0, 0, 0);
    this.rimMaterial.rotation = 0;
    this.shellMaterial.color.set(0xdffcff).lerp(TMP_COLOR.set(preset.colors.glow), 0.18);
    this.rimMaterial.color.set(0xffffff).lerp(TMP_COLOR.set(preset.colors.core), 0.18);
    this.particles.setTexture(this.resources.barrierAura);
    this.followCaster();
    this.emitShieldShimmer(preset);
  }

  public bindAction(action: THREE.AnimationAction): void {
    this.action = action;
  }

  public update(delta: number): boolean {
    if (!this.caster || !this.preset) return false;
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    this.shimmerAge += elapsed;
    this.followCaster();

    const actionProtecting = this.isActionStillProtecting();
    if (!actionProtecting) this.postEndAge += elapsed;

    const breakProgress = actionProtecting
      ? 0
      : THREE.MathUtils.clamp(
          (this.postEndAge - MAGE_BARRIER_POST_SKILL_PROTECTION_SECONDS) / MAGE_BARRIER_BREAK_SECONDS,
          0,
          1
        );
    if (breakProgress > 0 && !this.breakParticlesEmitted) {
      this.emitShieldBreak(this.preset);
      this.breakParticlesEmitted = true;
    } else if (actionProtecting && this.shimmerAge >= 0.85) {
      this.emitShieldShimmer(this.preset);
      this.shimmerAge = 0;
    }

    const intro = THREE.MathUtils.smoothstep(this.age, 0, 0.28);
    const fade = 1 - THREE.MathUtils.smoothstep(breakProgress, 0.15, 1);
    const breakPulse = Math.sin(breakProgress * Math.PI) * 0.18;
    const breathe = Math.sin(this.age * 5.2) * 0.012;
    const shimmer = 0.5 + Math.sin(this.age * 8.7) * 0.5;

    this.group.scale.setScalar(1 + breathe + breakPulse + breakProgress * 0.12);
    this.shell.rotation.y += elapsed * (0.18 + breakProgress * 2.2);
    this.shell.rotation.x += elapsed * 0.07;
    this.rimMaterial.rotation -= elapsed * (0.32 + breakProgress * 4.4);
    this.rim.scale.setScalar(2.56 + breakPulse * 1.3 + breakProgress * 0.5);

    this.shellMaterial.opacity = (0.105 + shimmer * 0.018) * intro * fade;
    this.shellMaterial.iridescence = 0.65 + shimmer * 0.25;
    this.rimMaterial.opacity = (0.16 + shimmer * 0.045 + breakPulse * 0.28) * intro * fade;

    this.particles.update(elapsed);
    return actionProtecting
      || this.postEndAge < MAGE_BARRIER_POST_SKILL_PROTECTION_SECONDS + MAGE_BARRIER_BREAK_SECONDS;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.caster = null;
    this.action = null;
    this.preset = null;
    this.age = 0;
    this.postEndAge = 0;
    this.breakParticlesEmitted = false;
    this.shimmerAge = 0;
    this.particles.reset();
    this.shellMaterial.opacity = 0;
    this.rimMaterial.opacity = 0;
  }

  public dispose(): void {
    this.shellMaterial.dispose();
    this.rimMaterial.dispose();
    this.particles.dispose();
  }

  private followCaster(): void {
    if (!this.caster) return;
    this.caster.getWorldPosition(this.group.position);
    this.group.position.y += 1.08;
  }

  private isActionStillProtecting(): boolean {
    if (!this.action) return false;
    const duration = this.action.getClip().duration || 1;
    return this.action.isRunning() && this.action.time < duration - 1e-3;
  }

  private emitShieldShimmer(preset: MageSpellPreset): void {
    this.particles.emit(new THREE.Vector3(0, 0, 0), {
      color: 0xe8fdff,
      count: qualityCount(10, this.quality, preset.qualityParticleMultiplier),
      speed: 0.18,
      spread: 1.05,
      lifetime: 0.85,
      upwardBias: 0.08,
    });
  }

  private emitShieldBreak(preset: MageSpellPreset): void {
    this.particles.emit(new THREE.Vector3(0, 0, 0), {
      color: preset.colors.glow,
      count: qualityCount(42, this.quality, preset.qualityParticleMultiplier),
      speed: 0.92,
      spread: 1.2,
      lifetime: 0.42,
      upwardBias: 0.24,
    });
  }
}

interface ActiveMageCast {
  readonly spellId: MageSpellId;
  readonly preset: MageSpellPreset;
  readonly context: MageCastContext;
  readonly timeline: VFXTimeline<MageTimelineEvent>;
  charge: ChargeOrbEffect | null;
  launched: boolean;
  impactDelivered: boolean;
}

export interface MageVFXOptions {
  readonly quality?: MageVFXQuality;
  readonly debug?: boolean;
  /**
   * Shared scene-level pool for every temporary VFX light. When omitted,
   * MageVFX creates (and owns) its own pool sized by maxTemporaryLights.
   */
  readonly lightPool?: VFXLightPool;
}

export class MageVFX {
  private readonly resources = new MageVFXResources();
  private readonly quality: MageVFXQuality;
  private readonly charges: VFXPool<ChargeOrbEffect>;
  private readonly barriers: VFXPool<BarrierAuraEffect>;
  private readonly activeBarriers: BarrierAuraEffect[] = [];
  private readonly activeCasts: ActiveMageCast[] = [];
  private readonly projectiles: ProjectileManager;
  private readonly lightning: LightningVFX;
  private readonly lasers: LaserVFX;
  private readonly impacts: ImpactVFX;
  private readonly magicCircles: MagicCircleVFX;
  private readonly cameraShake = new CameraShake();
  private debug = false;
  private warmedUp = false;
  private readonly lightPool: VFXLightPool;
  private readonly ownsLightPool: boolean;

  public constructor(
    private readonly scene: THREE.Scene,
    options: MageVFXOptions = {}
  ) {
    this.quality = options.quality ?? DEFAULT_MAGE_VFX_QUALITY;
    this.debug = options.debug === true;
    this.lightPool = options.lightPool ?? new VFXLightPool(scene, MAGE_VFX_LIMITS.maxTemporaryLights);
    this.ownsLightPool = options.lightPool === undefined;
    this.charges = new VFXPool(
      () => new ChargeOrbEffect(this.resources, this.quality, this.lightPool),
      MAGE_VFX_LIMITS.maxCharges
    );
    this.barriers = new VFXPool(
      () => new BarrierAuraEffect(this.resources, this.quality),
      MAGE_VFX_LIMITS.maxBarriers
    );
    this.projectiles = new ProjectileManager(scene, this.resources, this.quality, this.lightPool);
    this.lightning = new LightningVFX(scene, this.resources, this.quality);
    this.lasers = new LaserVFX(scene, this.resources, this.quality, this.lightPool);
    this.impacts = new ImpactVFX(scene, this.resources, this.quality, this.lightPool);
    this.magicCircles = new MagicCircleVFX(this.resources);
  }

  public cast(spellId: MageSpellId, context: MageCastContext): void {
    const preset = MAGE_SPELL_PRESETS[spellId];
    if (!preset) return;
    const events = [
      { at: preset.timeline.chargeStart, name: 'charge' as const },
      ...(preset.timeline.secondaryCharge !== undefined
        ? [{ at: preset.timeline.secondaryCharge, name: 'secondary-charge' as const }]
        : []),
      ...(preset.timeline.magicCircle !== undefined
        ? [{ at: preset.timeline.magicCircle, name: 'magic-circle' as const }]
        : []),
      { at: preset.timeline.launch, name: 'launch' as const },
      { at: preset.timeline.chargeEnd, name: 'stop-charge' as const },
      { at: preset.timeline.recover, name: 'recover' as const },
    ];
    const timeline = new VFXTimeline<MageTimelineEvent>(context.action, events);
    this.activeCasts.push({
      spellId,
      preset,
      context,
      timeline,
      charge: null,
      launched: false,
      impactDelivered: false,
    });
    if (spellId !== 'basic') this.startSkillBarrier(context, preset);
    this.emitAudio(context, preset, 'charge');
  }

  public update(delta: number): void {
    const elapsed = Math.max(0, delta);
    for (let index = this.activeCasts.length - 1; index >= 0; index -= 1) {
      const cast = this.activeCasts[index];
      if (cast.charge) {
        cast.charge.setWorldPosition(this.resolveCastSocketWorldPosition(cast, this.resolveHand(cast), TMP_WORLD));
        cast.charge.update(elapsed);
      }
      const alive = cast.timeline.update((name) => this.handleTimelineEvent(cast, name));
      const actionStoppedBeforeLaunch = !cast.context.action.isRunning()
        && !cast.launched
        && cast.context.action.time <= 0.02;
      if (alive && !actionStoppedBeforeLaunch) continue;
      this.releaseCharge(cast);
      this.activeCasts.splice(index, 1);
    }
    this.updateBarriers(elapsed);
    this.projectiles.update(elapsed);
    this.lightning.update(elapsed);
    this.lasers.update(elapsed);
    this.impacts.update(elapsed);
    this.magicCircles.update(elapsed);
  }

  public applyCameraShake(camera: THREE.Camera, delta: number): void {
    this.cameraShake.apply(camera, delta);
  }

  public clear(): void {
    for (const cast of this.activeCasts) this.releaseCharge(cast);
    this.activeCasts.length = 0;
    for (const barrier of this.activeBarriers) this.barriers.release(barrier);
    this.activeBarriers.length = 0;
    this.projectiles.clear();
    this.lightning.clear();
    this.lasers.clear();
    this.impacts.clear();
    this.magicCircles.clear();
    this.cameraShake.clear();
  }

  public dispose(): void {
    this.clear();
    this.charges.dispose();
    this.barriers.dispose();
    this.projectiles.dispose();
    this.lightning.dispose();
    this.lasers.dispose();
    this.impacts.dispose();
    this.magicCircles.dispose();
    this.resources.dispose();
    if (this.ownsLightPool) this.lightPool.dispose();
  }

  /**
   * Allocates and compiles the Mage VFX materials during loading instead of on
   * the first skill input. Compiles are staged across charge, delivery and
   * impact (plus one staggered volley) so every mid-flight program is baked
   * before gameplay — a single tail compile would miss them all.
   */
  public warmUp(renderer?: THREE.WebGLRenderer, camera?: THREE.Camera): void {
    if (this.warmedUp) return;
    this.warmedUp = true;

    const caster = new THREE.Group();
    caster.name = 'MageVFXWarmupCaster';
    const rightHand = new THREE.Object3D();
    rightHand.name = 'mixamorig:RightHand';
    const leftHand = new THREE.Object3D();
    leftHand.name = 'mixamorig:LeftHand';
    caster.add(rightHand, leftHand);
    this.scene.add(caster);
    const compile = (): void => {
      renderer?.compile?.(this.scene, camera ?? new THREE.PerspectiveCamera());
    };

    try {
      for (const texture of this.resources.allTextures()) renderer?.initTexture?.(texture);

      for (const spellId of Object.keys(MAGE_SPELL_PRESETS) as MageSpellId[]) {
        const mixer = new THREE.AnimationMixer(caster);
        const clip = new THREE.AnimationClip(`mage-vfx-warmup-${spellId}`, 1.2, [
          new THREE.NumberKeyframeTrack('.visible', [0, 1.2], [1, 1]),
        ]);
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();

        this.cast(spellId, {
          caster,
          rightHand,
          leftHand,
          action,
          target: null,
          fallbackDirection: new THREE.Vector3(0, 0, 1),
        });

        // renderer.compile only sees objects currently in the scene, so one
        // tail compile would miss every mid-flight program. Compile once per
        // stage instead: charge (orb + barrier + seals), delivery (projectile
        // / beam / lightning + muzzle glow) and impact. The pooled lights are
        // always in the scene, so these compiles also bake the real in-combat
        // light count into every lit program.
        const compiledStage = { charge: false, delivery: false, impact: false };
        for (let step = 0; step < 30; step += 1) {
          mixer.update(0.12);
          this.update(0.12);
          const diagnostics = this.diagnostics();
          if (!compiledStage.charge && diagnostics.activeCharges > 0) {
            compile();
            compiledStage.charge = true;
          }
          const deliveryActive = diagnostics.activeProjectiles
            + diagnostics.activeLasers
            + diagnostics.activeLightning;
          if (!compiledStage.delivery && deliveryActive > 0) {
            compile();
            compiledStage.delivery = true;
          }
          if (!compiledStage.impact && diagnostics.activeImpacts > 0) {
            compile();
            compiledStage.impact = true;
          }
          if (
            compiledStage.charge
            && compiledStage.delivery
            && compiledStage.impact
            && diagnostics.activeCasts === 0
          ) {
            break;
          }
        }
        compile();
        this.clear();
        mixer.uncacheRoot(caster);
      }

      // Staggered volley: overlap three basic casts so the projectile/impact
      // pools grow to depth 3 and compile once with several borrowed lights
      // live at the same time, like a real multi-cast fight.
      const volley: { mixer: THREE.AnimationMixer; action: THREE.AnimationAction }[] = [];
      for (let round = 0; round < 3; round += 1) {
        const mixer = new THREE.AnimationMixer(caster);
        const clip = new THREE.AnimationClip(`mage-vfx-warmup-volley-${round}`, 1.2, [
          new THREE.NumberKeyframeTrack('.visible', [0, 1.2], [1, 1]),
        ]);
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        this.cast('basic', {
          caster,
          rightHand,
          leftHand,
          action,
          target: null,
          fallbackDirection: new THREE.Vector3(0, 0, 1),
        });
        volley.push({ mixer, action });
        for (let step = 0; step < 3; step += 1) {
          for (const entry of volley) entry.mixer.update(0.12);
          this.update(0.12);
        }
      }
      let volleyCompiled = false;
      for (let step = 0; step < 30; step += 1) {
        for (const entry of volley) entry.mixer.update(0.12);
        this.update(0.12);
        const diagnostics = this.diagnostics();
        if (!volleyCompiled && diagnostics.activeProjectiles >= 2) {
          compile();
          volleyCompiled = true;
        }
        if (
          diagnostics.activeCasts === 0
          && diagnostics.activeProjectiles === 0
          && diagnostics.activeImpacts === 0
        ) {
          break;
        }
      }
      compile();
      for (const entry of volley) entry.mixer.uncacheRoot(caster);
    } finally {
      this.clear();
      caster.removeFromParent();
    }
  }

  public diagnostics(): MageVFXDiagnostics {
    return {
      activeCasts: this.activeCasts.length,
      activeCharges: this.charges.activeCount,
      pooledCharges: this.charges.inactiveCount,
      activeProjectiles: this.projectiles.activeCount,
      pooledProjectiles: this.projectiles.pooledCount,
      activeImpacts: this.impacts.activeCount,
      pooledImpacts: this.impacts.pooledCount,
      activeMagicCircles: this.magicCircles.activeCount,
      pooledMagicCircles: this.magicCircles.pooledCount,
      activeLightning: this.lightning.activeCount,
      pooledLightning: this.lightning.pooledCount,
      activeLasers: this.lasers.activeCount,
      pooledLasers: this.lasers.pooledCount,
      activeBarriers: this.activeBarriers.length,
      pooledBarriers: this.barriers.inactiveCount,
    };
  }

  public setDebug(enabled: boolean): void {
    this.debug = enabled;
  }

  private startSkillBarrier(context: MageCastContext, preset: MageSpellPreset): void {
    const barrier = this.barriers.acquire();
    if (!barrier) return;
    barrier.play(context.caster, preset);
    barrier.bindAction(context.action);
    this.scene.add(barrier.group);
    this.activeBarriers.push(barrier);
  }

  private updateBarriers(delta: number): void {
    for (let index = this.activeBarriers.length - 1; index >= 0; index -= 1) {
      const barrier = this.activeBarriers[index];
      if (barrier.update(delta)) continue;
      this.barriers.release(barrier);
      this.activeBarriers.splice(index, 1);
    }
  }

  private handleTimelineEvent(cast: ActiveMageCast, event: MageTimelineEvent): void {
    switch (event) {
      case 'charge':
        this.startCharge(cast);
        break;
      case 'secondary-charge':
        this.spawnSecondaryCharge(cast);
        break;
      case 'magic-circle':
        this.spawnMagicCircle(cast);
        break;
      case 'launch':
        this.launch(cast);
        break;
      case 'stop-charge':
      case 'recover':
        this.releaseCharge(cast);
        break;
      default:
        break;
    }
  }

  private startCharge(cast: ActiveMageCast): void {
    if (cast.charge) return;
    const charge = this.charges.acquire();
    if (!charge) return;
    charge.play(cast.preset);
    charge.setWorldPosition(this.resolveCastSocketWorldPosition(cast, this.resolveHand(cast), TMP_WORLD));
    this.scene.add(charge.group);
    cast.charge = charge;
  }

  private spawnSecondaryCharge(cast: ActiveMageCast): void {
    const hand = cast.preset.hand === 'both' ? this.resolveOtherHand(cast) : this.resolveHand(cast);
    if (!mageQualityProfile(this.quality).enableDecorativeCircles && cast.preset.style !== 'laser') return;
    this.magicCircles.play({
      parent: this.scene,
      position: this.resolveCastSocketWorldPosition(cast, hand, TMP_WORLD).clone(),
      color: cast.preset.colors.glow,
      radius: cast.preset.style === 'laser' ? 0.82 : 0.48,
      duration: cast.preset.style === 'laser' ? 0.58 : 0.32,
      followParent: false,
      groundAligned: false,
    });
  }

  private spawnMagicCircle(cast: ActiveMageCast): void {
    const hand = this.resolveHand(cast);
    this.magicCircles.play({
      parent: this.scene,
      position: this.resolveCastSocketWorldPosition(cast, hand, TMP_WORLD).clone(),
      color: cast.preset.colors.secondary,
      radius: cast.preset.style === 'laser' ? 0.95 : cast.preset.style === 'water' ? 0.62 : 0.55,
      duration: cast.preset.style === 'laser' ? 0.72 : 0.36,
      followParent: false,
      groundAligned: false,
    });
  }

  private launch(cast: ActiveMageCast): void {
    if (cast.launched) return;
    cast.launched = true;
    // The cast motion climaxes here: gameplay frees the caster's movement
    // while the projectile, impact and monster-side effects still play out.
    cast.context.onLaunch?.();
    const origin = cast.charge
      ? cast.charge.worldPosition(TMP_WORLD).clone()
      : this.resolveHandWorldPosition(cast, TMP_WORLD).clone();
    this.releaseCharge(cast);

    const direction = this.resolveLaunchDirection(cast, origin, TMP_DIRECTION).clone();
    this.impacts.play({
      position: origin,
      preset: cast.preset,
      scale: cast.preset.style === 'laser' ? 0.5 : 0.35,
      lightIntensity: cast.preset.impact.lightIntensity * 0.45,
    });
    this.emitAudio(cast.context, cast.preset, 'cast', origin);

    if (cast.preset.delivery === 'instant-lightning') {
      const aimed = this.resolveTargetPoint(cast, origin, direction, MAGE_SPELL_TRAVEL_METERS);
      const stopped = this.stopOnBody(cast, origin, aimed);
      this.lightning.strike({
        start: origin,
        end: stopped.point,
        preset: cast.preset,
        onImpact: () => {
          this.handleDirectImpact(stopped.point, cast, stopped.target);
        },
      });
      return;
    }

    if (cast.preset.delivery === 'beam') {
      const aimed = this.resolveTargetPoint(cast, origin, direction, MAGE_SPELL_TRAVEL_METERS);
      const stopped = this.stopOnBody(cast, origin, aimed);
      this.lasers.fire({
        startAnchor: null,
        startProvider: (output) => this.resolveCastSocketWorldPosition(cast, this.resolveHand(cast), output),
        fallbackStart: origin,
        target: stopped.target,
        fallbackDirection: direction,
        preset: cast.preset,
        isTargetAlive: cast.context.isTargetAlive,
        queryBodyHit: cast.context.queryBodyHit,
        onImpact: (target) => this.handleDirectImpact(
          this.bodyImpactPoint(target, aimed),
          cast,
          target
        ),
        onFinalImpact: (position, target) => this.handleDirectImpact(position, cast, target),
      });
      return;
    }

    const fired = this.projectiles.fire({
      origin,
      direction,
      target: cast.context.target,
      preset: cast.preset,
      isTargetAlive: cast.context.isTargetAlive,
      queryBodyHit: cast.context.queryBodyHit,
      onImpact: (impact) => this.handleProjectileImpact(impact, cast),
    });

    if (!fired) {
      const aimed = this.resolveTargetPoint(cast, origin, direction, MAGE_SPELL_TRAVEL_METERS);
      const stopped = this.stopOnBody(cast, origin, aimed);
      this.handleDirectImpact(stopped.point, cast, stopped.target);
    }
  }

  private handleProjectileImpact(impact: MageProjectileImpact, cast: ActiveMageCast): void {
    this.handleDirectImpact(impact.position, cast, impact.target);
  }

  private handleDirectImpact(position: THREE.Vector3, cast: ActiveMageCast, target: THREE.Object3D | null): void {
    const impactPoint = target ? this.bodyImpactPoint(target, position) : position;
    if (!cast.impactDelivered) {
      this.impacts.play({ position: impactPoint, preset: cast.preset });
      this.cameraShake.add(
        cast.preset.impact.cameraShakeIntensity,
        cast.preset.impact.cameraShakeDuration
      );
      this.emitAudio(cast.context, cast.preset, 'impact', impactPoint);
    }
    if (cast.impactDelivered) return;
    if (target && (!cast.context.isTargetAlive || cast.context.isTargetAlive(target))) {
      cast.impactDelivered = true;
      cast.context.onImpact?.(target);
      return;
    }
    if (!target) cast.impactDelivered = true;
  }

  /** Chest point so the explosion finishes on the body, not behind it. */
  private bodyImpactPoint(target: THREE.Object3D, fallback: THREE.Vector3): THREE.Vector3 {
    const point = target.getWorldPosition(new THREE.Vector3());
    const bodyScale = Number(target.userData?.enemyBodyScale) || 1;
    point.y += 0.95 * bodyScale;
    if (!Number.isFinite(point.x)) return fallback.clone();
    return point;
  }

  private stopOnBody(
    cast: ActiveMageCast,
    origin: THREE.Vector3,
    end: THREE.Vector3
  ): { point: THREE.Vector3; target: THREE.Object3D | null } {
    const blocker = cast.context.queryBodyHit?.(origin, end, Math.max(0.2, cast.preset.projectile.radius));
    if (blocker) return { point: this.bodyImpactPoint(blocker, end), target: blocker };
    // Without a body query the aimed target still receives the impact. With a
    // query, a miss must not damage a monster the bolt never reached.
    if (cast.context.queryBodyHit) return { point: end.clone(), target: null };
    return { point: end.clone(), target: cast.context.target };
  }

  /** Ground seal for the shock impact. Body lightning is owned by the monsters. */
  public playShockImpact(position: THREE.Vector3): void {
    const preset = MAGE_SPELL_PRESETS.lightning;
    this.magicCircles.play({
      parent: this.scene,
      position: position.clone().setY(position.y + 0.05),
      color: preset.colors.glow,
      radius: 2,
      duration: 0.7,
      groundAligned: true,
    });
  }

  /**
   * Floor seal and departure glow for the blink. The beam that used to connect
   * the two points stays out — that was the blue light between them.
   */
  public playTeleport(from: THREE.Vector3, to: THREE.Vector3): void {
    const preset = MAGE_SPELL_PRESETS.basic;
    const departure = from.clone();
    departure.y += 1.05;
    this.impacts.play({ position: departure, preset, scale: 0.55, lightIntensity: 0.45 });
    this.magicCircles.play({
      parent: this.scene,
      position: to.clone().setY(to.y + 0.05),
      color: preset.colors.glow,
      radius: 1.15,
      duration: 0.5,
      groundAligned: true,
    });
  }

  private releaseCharge(cast: ActiveMageCast): void {
    if (!cast.charge) return;
    this.charges.release(cast.charge);
    cast.charge = null;
  }

  private resolveHand(cast: ActiveMageCast): THREE.Object3D | null {
    if (cast.preset.hand === 'left') return cast.context.leftHand ?? cast.context.rightHand ?? cast.context.caster;
    return cast.context.rightHand ?? cast.context.leftHand ?? cast.context.caster;
  }

  private resolveOtherHand(cast: ActiveMageCast): THREE.Object3D | null {
    return cast.context.leftHand ?? cast.context.rightHand ?? cast.context.caster;
  }

  private resolveHandWorldPosition(cast: ActiveMageCast, output: THREE.Vector3): THREE.Vector3 {
    return this.resolveCastSocketWorldPosition(cast, this.resolveHand(cast), output);
  }

  private resolveCastSocketWorldPosition(
    cast: ActiveMageCast,
    hand: THREE.Object3D | null,
    output: THREE.Vector3
  ): THREE.Vector3 {
    cast.context.caster.getWorldPosition(TMP_CASTER);
    this.resolveVisualCastForward(cast, TMP_DIRECTION);
    TMP_RIGHT.crossVectors(WORLD_UP, TMP_DIRECTION);
    if (TMP_RIGHT.lengthSq() <= 1e-8) TMP_RIGHT.set(1, 0, 0);
    TMP_RIGHT.normalize();

    const anchor = cast.preset.hand === 'both'
      ? this.resolveBothHandAnchorPosition(cast, output)
      : this.resolveSingleHandAnchorPosition(hand, output);
    if (!anchor) this.resolveFallbackSocket(cast, output);

    const distanceFromCaster = output.distanceTo(TMP_CASTER);
    const invalidHand = !Number.isFinite(output.x)
      || !Number.isFinite(output.y)
      || !Number.isFinite(output.z)
      || distanceFromCaster > 8;
    if (invalidHand) this.resolveFallbackSocket(cast, output);

    // Critical rule: the spell may never start behind the visible chest. Use the
    // animated finger/palm when valid, then clamp it to the front half-space.
    // This preserves the palm feel but fixes Mixamo/GLB axes that evaluate a hand
    // behind the gameplay root in some clips.
    const minimumForward = cast.preset.style === 'laser' ? 0.86 : 0.7;
    const relativeForward = TMP_WORLD_2.subVectors(output, TMP_CASTER).dot(TMP_DIRECTION);
    if (relativeForward < minimumForward) {
      output.addScaledVector(TMP_DIRECTION, minimumForward - relativeForward);
    }

    const minimumHeight = TMP_CASTER.y + (cast.preset.style === 'laser' ? 1.24 : 1.02);
    if (output.y < minimumHeight) output.y = minimumHeight;

    TMP_WORLD_2.subVectors(output, TMP_CASTER);
    TMP_WORLD_2.y = 0;
    if (TMP_WORLD_2.lengthSq() <= 0.0025) {
      const side = cast.preset.hand === 'left' ? -1 : 1;
      TMP_WORLD_2.copy(TMP_RIGHT).multiplyScalar(side);
    } else {
      TMP_WORLD_2.normalize();
    }
    output.addScaledVector(TMP_WORLD_2, cast.preset.style === 'laser' ? 0.14 : 0.09);
    output.addScaledVector(TMP_DIRECTION, 0.08);
    output.y += cast.preset.style === 'laser' ? 0.1 : 0.06;
    return output;
  }

  private resolveBothHandAnchorPosition(cast: ActiveMageCast, output: THREE.Vector3): boolean {
    const right = this.resolveDetailedHandAnchor(cast.context.rightHand);
    const left = this.resolveDetailedHandAnchor(cast.context.leftHand);
    if (right && left) {
      right.getWorldPosition(output);
      left.getWorldPosition(TMP_WORLD_2);
      output.add(TMP_WORLD_2).multiplyScalar(0.5);
      return true;
    }
    return this.resolveSingleHandAnchorPosition(right ?? left ?? this.resolveHand(cast), output);
  }

  private resolveSingleHandAnchorPosition(hand: THREE.Object3D | null, output: THREE.Vector3): boolean {
    const anchor = this.resolveDetailedHandAnchor(hand);
    if (!anchor) return false;
    anchor.getWorldPosition(output);
    return true;
  }

  private resolveDetailedHandAnchor(hand: THREE.Object3D | null): THREE.Object3D | null {
    if (!hand) return null;
    const isLeft = /LeftHand/i.test(hand.name);
    const prefix = isLeft ? 'mixamorig:LeftHand' : 'mixamorig:RightHand';
    return hand.getObjectByName(`${prefix}Index2`)
      ?? hand.getObjectByName(`${prefix}Index1`)
      ?? hand.getObjectByName(`${prefix}Index3`)
      ?? hand.getObjectByName(`${prefix}Thumb2`)
      ?? hand.getObjectByName(`${prefix}Thumb1`)
      ?? hand;
  }

  private resolveFallbackSocket(cast: ActiveMageCast, output: THREE.Vector3): THREE.Vector3 {
    const twoHanded = cast.preset.hand === 'both' || cast.preset.charge.twoHanded;
    const side = twoHanded ? 0 : cast.preset.hand === 'left' ? -1 : 1;
    output.copy(TMP_CASTER)
      .addScaledVector(TMP_DIRECTION, cast.preset.style === 'laser' ? 0.95 : 0.78)
      .addScaledVector(TMP_RIGHT, side * (twoHanded ? 0 : 0.32));
    output.y += cast.preset.style === 'laser' ? 1.34 : 1.14;
    return output;
  }

  private resolveVisualCastForward(cast: ActiveMageCast, output: THREE.Vector3): THREE.Vector3 {
    const target = cast.context.target;
    if (target && (!cast.context.isTargetAlive || cast.context.isTargetAlive(target))) {
      target.getWorldPosition(TMP_WORLD_2);
      output.subVectors(TMP_WORLD_2, TMP_CASTER);
    } else {
      output.copy(cast.context.fallbackDirection);
    }
    output.y = 0;
    if (output.lengthSq() <= 1e-8) cast.context.caster.getWorldDirection(output);
    output.y = 0;
    if (output.lengthSq() <= 1e-8) output.set(0, 0, 1);
    return output.normalize();
  }

  private resolveLaunchForward(cast: ActiveMageCast, output: THREE.Vector3): THREE.Vector3 {
    cast.context.caster.getWorldPosition(TMP_CASTER);
    return this.resolveVisualCastForward(cast, output);
  }

  private resolveTargetPoint(
    cast: ActiveMageCast,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    fallbackDistance: number
  ): THREE.Vector3 {
    const reach = Math.min(Math.max(0.5, fallbackDistance), MAGE_SPELL_TRAVEL_METERS);
    const target = cast.context.target;
    if (target && (!cast.context.isTargetAlive || cast.context.isTargetAlive(target))) {
      target.getWorldPosition(TMP_WORLD_2);
      const bodyScale = Number(target.userData?.enemyBodyScale) || 1;
      TMP_WORLD_2.y += 0.95 * bodyScale;
      const offset = TMP_DIRECTION.subVectors(TMP_WORLD_2, origin);
      const distance = offset.length();
      if (distance > reach && distance > 1e-6) {
        return origin.clone().addScaledVector(offset.multiplyScalar(1 / distance), reach);
      }
      return TMP_WORLD_2.clone();
    }
    return origin.clone().addScaledVector(direction, reach);
  }

  private resolveLaunchDirection(
    cast: ActiveMageCast,
    origin: THREE.Vector3,
    output: THREE.Vector3
  ): THREE.Vector3 {
    const target = cast.context.target;
    if (target && (!cast.context.isTargetAlive || cast.context.isTargetAlive(target))) {
      target.getWorldPosition(TMP_WORLD_2);
      const bodyScale = Number(target.userData?.enemyBodyScale) || 1;
      TMP_WORLD_2.y += 0.95 * bodyScale;
      output.subVectors(TMP_WORLD_2, origin);
    } else {
      output.copy(cast.context.fallbackDirection);
    }
    if (output.lengthSq() <= 1e-8) output.set(0, 0, 1);
    return output.normalize();
  }

  private emitAudio(
    context: MageCastContext,
    preset: MageSpellPreset,
    phase: 'charge' | 'cast' | 'projectile' | 'impact' | 'loop-start' | 'loop-end',
    position?: THREE.Vector3
  ): void {
    if (!context.emitAudioEvent) return;
    const soundId = phase === 'charge'
      ? preset.audio?.charge
      : phase === 'cast'
        ? preset.audio?.cast
        : phase === 'impact'
          ? preset.audio?.impact
          : phase === 'projectile'
            ? preset.audio?.projectile
            : preset.audio?.loop;
    context.emitAudioEvent({
      spellId: preset.id,
      phase,
      soundId,
      position: position?.clone() ?? context.caster.getWorldPosition(new THREE.Vector3()),
    });
  }
}
