import * as THREE from 'three';
import { MAGE_SPELL_TRAVEL_METERS } from '../combat/MageSpellFlight';
import { MAGE_VFX_LIMITS, mageQualityProfile } from './VFXConfig';
import { MageVFXResources } from './MageVFXResources';
import { PooledParticleCloud, qualityCount } from './ParticleManager';
import { VFXPool, type PoolableVFX } from './VFXPool';
import {
  configureEnergyMaterial,
  createBeamMaterial,
  setEnergyTime,
  type EnergyShaderMaterial,
} from './VFXMaterials';
import type { MageSpellPreset, MageVFXQuality } from './VFXTypes';

interface LaserOptions {
  readonly startAnchor: THREE.Object3D | null;
  readonly startProvider?: (output: THREE.Vector3) => THREE.Vector3;
  readonly fallbackStart: THREE.Vector3;
  readonly target: THREE.Object3D | null;
  readonly fallbackDirection: THREE.Vector3;
  readonly preset: MageSpellPreset;
  readonly isTargetAlive?: (target: THREE.Object3D) => boolean;
  readonly queryBodyHit?: (
    from: THREE.Vector3,
    to: THREE.Vector3,
    spellRadius: number
  ) => THREE.Object3D | null;
  readonly onImpact?: (target: THREE.Object3D) => void;
  readonly onFinalImpact?: (position: THREE.Vector3, target: THREE.Object3D | null) => void;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const TMP_START = new THREE.Vector3();
const TMP_END = new THREE.Vector3();
const TMP_DIR = new THREE.Vector3();
const TMP_MID = new THREE.Vector3();
const TMP_SIDE = new THREE.Vector3();
const DISCHARGE_POINTS = 8;

function targetPoint(target: THREE.Object3D, output: THREE.Vector3): THREE.Vector3 {
  target.getWorldPosition(output);
  const bodyScale = Number(target.userData?.enemyBodyScale) || 1;
  output.y += 0.95 * bodyScale;
  return output;
}

class LaserBeam implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly outer: THREE.Mesh;
  private readonly body: THREE.Mesh;
  private readonly core: THREE.Mesh;
  private readonly outerMaterial: EnergyShaderMaterial;
  private readonly bodyMaterial: EnergyShaderMaterial;
  private readonly coreMaterial: EnergyShaderMaterial;
  private readonly discharge: THREE.Line;
  private readonly dischargePositions = new Float32Array(DISCHARGE_POINTS * 3);
  private readonly dischargeAttribute = new THREE.BufferAttribute(this.dischargePositions, 3);
  private readonly originGlow: THREE.Sprite;
  private readonly impactGlow: THREE.Sprite;
  private readonly particles: PooledParticleCloud;
  private readonly impactLight = new THREE.PointLight(0xffffff, 0, 5, 2);
  private age = 0;
  private duration = 0.5;
  private impactCooldown = 0;
  private preset: MageSpellPreset | null = null;
  private startAnchor: THREE.Object3D | null = null;
  private startProvider: ((output: THREE.Vector3) => THREE.Vector3) | undefined;
  private target: THREE.Object3D | null = null;
  private fallbackStart = new THREE.Vector3();
  private fallbackDirection = new THREE.Vector3(0, 0, 1);
  private isTargetAlive: ((target: THREE.Object3D) => boolean) | undefined;
  private queryBodyHit: LaserOptions['queryBodyHit'];
  private onImpact: ((target: THREE.Object3D) => void) | undefined;
  private onFinalImpact: ((position: THREE.Vector3, target: THREE.Object3D | null) => void) | undefined;
  private impactSent = false;

  public constructor(private readonly resources: MageVFXResources, private readonly quality: MageVFXQuality) {
    this.group.name = 'MageLaserPremiumVFX';
    this.group.visible = false;
    this.outerMaterial = createBeamMaterial({ opacity: 0, intensity: 1.15, thickness: 1.25, distortion: 1.15, scrollSpeed: 0.8 });
    this.bodyMaterial = createBeamMaterial({ opacity: 0, intensity: 1.75, thickness: 0.72, distortion: 1.35, scrollSpeed: 1.25 });
    this.coreMaterial = createBeamMaterial({ opacity: 0, intensity: 2.25, thickness: 0.38, distortion: 0.65, scrollSpeed: 1.9 });
    this.outer = new THREE.Mesh(resources.beamCylinder, this.outerMaterial);
    this.body = new THREE.Mesh(resources.beamCylinder, this.bodyMaterial);
    this.core = new THREE.Mesh(resources.beamCylinder, this.coreMaterial);
    this.outer.name = 'MageLaserOuterShaderGlow';
    this.body.name = 'MageLaserUnstableBody';
    this.core.name = 'MageLaserWhiteHotCore';

    const dischargeGeometry = new THREE.BufferGeometry();
    dischargeGeometry.setAttribute('position', this.dischargeAttribute);
    this.discharge = new THREE.Line(dischargeGeometry, new THREE.LineBasicMaterial({
      color: 0xdcb7ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.discharge.name = 'MageLaserSideDischarge';
    this.discharge.frustumCulled = false;
    this.discharge.renderOrder = 8;

    this.originGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: resources.softGlow,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.impactGlow = this.originGlow.clone();
    this.impactGlow.material = (this.originGlow.material as THREE.SpriteMaterial).clone();
    this.originGlow.name = 'MageLaserOriginFlash';
    this.impactGlow.name = 'MageLaserImpactBloom';
    this.particles = new PooledParticleCloud(48, resources.softGlow);
    this.impactLight.castShadow = false;
    this.group.add(this.outer, this.body, this.core, this.discharge, this.originGlow, this.impactGlow, this.particles.points, this.impactLight);
  }

  public play(options: LaserOptions): void {
    this.preset = options.preset;
    this.startAnchor = options.startAnchor;
    this.startProvider = options.startProvider;
    this.target = options.target;
    this.fallbackStart.copy(options.fallbackStart);
    this.fallbackDirection.copy(options.fallbackDirection).normalize();
    this.isTargetAlive = options.isTargetAlive;
    this.queryBodyHit = options.queryBodyHit;
    this.onImpact = options.onImpact;
    this.onFinalImpact = options.onFinalImpact;
    this.duration = options.preset.laser?.duration ?? 0.5;
    this.age = 0;
    this.impactCooldown = 0;
    this.impactSent = false;
    this.group.visible = true;

    const profile = mageQualityProfile(this.quality);
    configureEnergyMaterial(this.outerMaterial, {
      colorA: options.preset.colors.core,
      colorB: options.preset.colors.glow,
      opacity: 0,
      distortion: 1.05 * profile.distortionMultiplier,
    });
    configureEnergyMaterial(this.bodyMaterial, {
      colorA: options.preset.colors.glow,
      colorB: options.preset.colors.secondary,
      opacity: 0,
      distortion: 1.35 * profile.distortionMultiplier,
    });
    configureEnergyMaterial(this.coreMaterial, {
      colorA: options.preset.colors.core,
      colorB: options.preset.colors.spark,
      opacity: 0,
      distortion: 0.65 * profile.distortionMultiplier,
    });
    (this.discharge.material as THREE.LineBasicMaterial).color.set(options.preset.colors.spark);
    const chargeTexture = this.resources.mageTexture(options.preset.style, 'charge');
    const impactTexture = this.resources.mageTexture(options.preset.style, 'impact');
    const originMaterial = this.originGlow.material as THREE.SpriteMaterial;
    originMaterial.map = chargeTexture;
    originMaterial.needsUpdate = true;
    originMaterial.color.set(options.preset.colors.glow);
    const impactMaterial = this.impactGlow.material as THREE.SpriteMaterial;
    impactMaterial.map = impactTexture;
    impactMaterial.needsUpdate = true;
    impactMaterial.color.set(options.preset.colors.spark);
    this.particles.setTexture(impactTexture);
    this.impactLight.color.set(options.preset.colors.glow);
    this.impactLight.visible = profile.enableSecondaryLights;
    this.updateTransform(0);
  }

  public update(delta: number): boolean {
    if (!this.preset) return false;
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    this.impactCooldown = Math.max(0, this.impactCooldown - elapsed);
    const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
    const intro = THREE.MathUtils.smoothstep(progress, 0, 0.16);
    const outro = 1 - THREE.MathUtils.smoothstep(progress, 0.78, 1);
    const intensity = intro * outro;
    this.updateTransform(intensity);
    for (const [material, multiplier] of [[this.outerMaterial, 0.32], [this.bodyMaterial, 0.68], [this.coreMaterial, 0.98]] as const) {
      setEnergyTime(material, this.age);
      material.uniforms.uOpacity.value = multiplier * intensity;
    }
    (this.originGlow.material as THREE.SpriteMaterial).opacity = 0.85 * intensity;
    (this.impactGlow.material as THREE.SpriteMaterial).opacity = 0.95 * intensity;
    (this.discharge.material as THREE.LineBasicMaterial).opacity = 0.58 * intensity * (0.45 + Math.random() * 0.55);
    this.impactLight.intensity = this.impactLight.visible
      ? this.preset.impact.lightIntensity * 0.65 * intensity
      : 0;
    this.particles.update(elapsed);

    if (!this.impactSent && this.target && (!this.isTargetAlive || this.isTargetAlive(this.target))) {
      this.impactSent = true;
      this.onImpact?.(this.target);
    }
    if (this.impactCooldown <= 0) {
      this.impactCooldown = this.preset.laser?.impactPulseInterval ?? 0.12;
      this.particles.emit(TMP_END, {
        color: this.preset.colors.spark,
        count: qualityCount(18, this.quality, this.preset.qualityParticleMultiplier),
        speed: 2.4,
        spread: 1.05,
        lifetime: 0.2,
        upwardBias: 0.16,
      });
    }

    if (this.age >= this.duration) {
      this.onFinalImpact?.(TMP_END.clone(), this.target);
      return false;
    }
    return true;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.preset = null;
    this.startAnchor = null;
    this.startProvider = undefined;
    this.target = null;
    this.isTargetAlive = undefined;
    this.queryBodyHit = undefined;
    this.onImpact = undefined;
    this.onFinalImpact = undefined;
    this.particles.reset();
    this.impactLight.intensity = 0;
    this.outerMaterial.uniforms.uOpacity.value = 0;
    this.bodyMaterial.uniforms.uOpacity.value = 0;
    this.coreMaterial.uniforms.uOpacity.value = 0;
    (this.discharge.material as THREE.LineBasicMaterial).opacity = 0;
    (this.originGlow.material as THREE.SpriteMaterial).opacity = 0;
    (this.impactGlow.material as THREE.SpriteMaterial).opacity = 0;
  }

  public dispose(): void {
    this.outerMaterial.dispose();
    this.bodyMaterial.dispose();
    this.coreMaterial.dispose();
    this.discharge.geometry.dispose();
    (this.discharge.material as THREE.Material).dispose();
    (this.originGlow.material as THREE.Material).dispose();
    (this.impactGlow.material as THREE.Material).dispose();
    this.particles.dispose();
  }

  private updateTransform(intensity: number): void {
    if (!this.preset) return;
    if (this.startProvider) this.startProvider(TMP_START);
    else if (this.startAnchor) this.startAnchor.getWorldPosition(TMP_START);
    else TMP_START.copy(this.fallbackStart);
    TMP_START.y += 0.08;

    if (this.target && this.isTargetAlive && !this.isTargetAlive(this.target)) this.target = null;
    if (this.target) targetPoint(this.target, TMP_END);
    else TMP_END.copy(TMP_START).addScaledVector(this.fallbackDirection, MAGE_SPELL_TRAVEL_METERS);
    const blocker = this.queryBodyHit?.(TMP_START, TMP_END, this.preset.projectile.radius);
    if (blocker) {
      this.target = blocker;
      targetPoint(blocker, TMP_END);
    }

    TMP_DIR.subVectors(TMP_END, TMP_START);
    const length = Math.max(0.01, TMP_DIR.length());
    TMP_DIR.normalize();
    TMP_MID.copy(TMP_START).addScaledVector(TMP_DIR, length * 0.5);

    const profile = mageQualityProfile(this.quality);
    const outerWidth = (this.preset.laser?.outerWidth ?? 0.56) * profile.laserLayerMultiplier;
    const bodyWidth = (this.preset.laser?.bodyWidth ?? 0.26) * profile.laserLayerMultiplier;
    const coreWidth = this.preset.laser?.coreWidth ?? 0.08;
    this.placeBeam(this.outer, TMP_MID, TMP_DIR, length, outerWidth * (0.88 + intensity * 0.28));
    this.placeBeam(this.body, TMP_MID, TMP_DIR, length, bodyWidth * (0.92 + intensity * 0.2));
    this.placeBeam(this.core, TMP_MID, TMP_DIR, length, coreWidth * (0.9 + Math.sin(this.age * 48) * 0.12));
    this.updateDischarge(length);
    this.originGlow.position.copy(TMP_START);
    this.originGlow.scale.setScalar(1.2 + intensity * 1.1);
    this.impactGlow.position.copy(TMP_END);
    this.impactGlow.scale.setScalar(1.5 + intensity * 1.5);
    this.impactLight.position.copy(TMP_END);
  }

  private placeBeam(mesh: THREE.Mesh, midpoint: THREE.Vector3, direction: THREE.Vector3, length: number, width: number): void {
    mesh.position.copy(midpoint);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, direction);
    mesh.scale.set(width, length, width);
  }

  private updateDischarge(length: number): void {
    TMP_SIDE.crossVectors(TMP_DIR, Y_AXIS);
    if (TMP_SIDE.lengthSq() <= 1e-8) TMP_SIDE.set(1, 0, 0);
    TMP_SIDE.normalize();
    for (let index = 0; index < DISCHARGE_POINTS; index += 1) {
      const t = index / (DISCHARGE_POINTS - 1);
      const base = TMP_START.clone().addScaledVector(TMP_DIR, length * t);
      const jitter = Math.sin(this.age * 42 + index * 2.1) * 0.18 + (Math.random() - 0.5) * 0.12;
      base.addScaledVector(TMP_SIDE, jitter);
      base.y += Math.sin(index * 1.7 + this.age * 24) * 0.08;
      const offset = index * 3;
      this.dischargePositions[offset] = base.x;
      this.dischargePositions[offset + 1] = base.y;
      this.dischargePositions[offset + 2] = base.z;
    }
    this.dischargeAttribute.needsUpdate = true;
  }
}

export class LaserVFX {
  private readonly pool: VFXPool<LaserBeam>;
  private readonly active: LaserBeam[] = [];

  public constructor(
    private readonly scene: THREE.Scene,
    resources: MageVFXResources,
    quality: MageVFXQuality
  ) {
    this.pool = new VFXPool(() => new LaserBeam(resources, quality), MAGE_VFX_LIMITS.maxLasers);
  }

  public fire(options: LaserOptions): boolean {
    const beam = this.pool.acquire();
    if (!beam) {
      if (options.target) options.onImpact?.(options.target);
      options.onFinalImpact?.(options.fallbackStart.clone().addScaledVector(options.fallbackDirection, 8), options.target);
      return false;
    }
    beam.play(options);
    this.scene.add(beam.group);
    this.active.push(beam);
    return true;
  }

  public update(delta: number): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const beam = this.active[index];
      if (beam.update(delta)) continue;
      this.pool.release(beam);
      this.active.splice(index, 1);
    }
  }

  public clear(): void {
    for (const beam of this.active) this.pool.release(beam);
    this.active.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.pool.dispose();
  }

  public get activeCount(): number { return this.active.length; }
  public get pooledCount(): number { return this.pool.inactiveCount; }
}
