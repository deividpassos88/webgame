import * as THREE from 'three';
import { mageQualityProfile, MAGE_VFX_LIMITS } from './VFXConfig';
import { MageVFXResources } from './MageVFXResources';
import { PooledParticleCloud, qualityCount } from './ParticleManager';
import { VFXPool, type PoolableVFX } from './VFXPool';
import type { MageSpellPreset, MageVFXQuality } from './VFXTypes';

interface LightningOptions {
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly preset: MageSpellPreset;
  readonly onImpact?: () => void;
}

const MAX_SEGMENTS = 18;
const MAX_BRANCHES = 7;
const POINTS_PER_LINE = MAX_SEGMENTS + 1;
const TMP = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_SIDE = new THREE.Vector3();
const TMP_UP = new THREE.Vector3(0, 1, 0);

class LightningStrike implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly mainGeometry = new THREE.BufferGeometry();
  private readonly glowGeometry = new THREE.BufferGeometry();
  private readonly branchGeometries: THREE.BufferGeometry[] = [];
  private readonly mainPositions = new Float32Array(POINTS_PER_LINE * 3);
  private readonly glowPositions = new Float32Array(POINTS_PER_LINE * 3);
  private readonly mainAttribute = new THREE.BufferAttribute(this.mainPositions, 3);
  private readonly glowAttribute = new THREE.BufferAttribute(this.glowPositions, 3);
  private readonly mainLine: THREE.Line;
  private readonly glowLine: THREE.Line;
  private readonly branches: THREE.Line[] = [];
  private readonly sparks: PooledParticleCloud;
  private age = 0;
  private duration = 0.2;
  private preset: MageSpellPreset | null = null;
  private start = new THREE.Vector3();
  private end = new THREE.Vector3();
  private impactSent = false;
  private onImpact: (() => void) | undefined;

  public constructor(resources: MageVFXResources, private readonly quality: MageVFXQuality) {
    this.group.name = 'MageLightningVFX';
    this.group.visible = false;
    this.mainGeometry.setAttribute('position', this.mainAttribute);
    this.mainGeometry.setDrawRange(0, POINTS_PER_LINE);
    this.glowGeometry.setAttribute('position', this.glowAttribute);
    this.glowGeometry.setDrawRange(0, POINTS_PER_LINE);

    this.mainLine = new THREE.Line(this.mainGeometry, new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.glowLine = new THREE.Line(this.glowGeometry, new THREE.LineBasicMaterial({
      color: 0x66ddff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));

    for (let index = 0; index < MAX_BRANCHES; index += 1) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
      geometry.setDrawRange(0, 0);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
        color: 0x9fefff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      this.branchGeometries.push(geometry);
      this.branches.push(line);
      this.group.add(line);
    }

    this.sparks = new PooledParticleCloud(42, resources.softGlow);
    this.group.add(this.glowLine, this.mainLine, this.sparks.points);
  }

  public play(options: LightningOptions): void {
    this.preset = options.preset;
    this.start.copy(options.start);
    this.end.copy(options.end);
    this.duration = options.preset.lightning?.duration ?? 0.2;
    this.age = 0;
    this.onImpact = options.onImpact;
    this.impactSent = false;
    this.group.visible = true;
    this.group.position.set(0, 0, 0);
    (this.mainLine.material as THREE.LineBasicMaterial).color.set(options.preset.colors.core);
    (this.glowLine.material as THREE.LineBasicMaterial).color.set(options.preset.colors.glow);
    for (const branch of this.branches) {
      (branch.material as THREE.LineBasicMaterial).color.set(options.preset.colors.secondary);
    }
    this.rebuildBolt(1);
    this.sparks.emit(options.end, {
      color: options.preset.colors.spark,
      count: qualityCount(28, this.quality, options.preset.qualityParticleMultiplier),
      speed: 3.4,
      spread: 1.15,
      lifetime: this.duration,
      upwardBias: 0.2,
    });
  }

  public update(delta: number): boolean {
    if (!this.preset) return false;
    this.age += Math.max(0, delta);
    const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
    const fade = 1 - progress;
    this.rebuildBolt(fade);
    (this.mainLine.material as THREE.LineBasicMaterial).opacity = fade;
    (this.glowLine.material as THREE.LineBasicMaterial).opacity = fade * 0.55;
    for (const branch of this.branches) {
      (branch.material as THREE.LineBasicMaterial).opacity = fade * 0.65;
    }
    this.sparks.update(delta);
    if (!this.impactSent) {
      this.impactSent = true;
      this.onImpact?.();
    }
    return this.age < this.duration;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.preset = null;
    this.onImpact = undefined;
    this.sparks.reset();
    (this.mainLine.material as THREE.LineBasicMaterial).opacity = 0;
    (this.glowLine.material as THREE.LineBasicMaterial).opacity = 0;
    for (const geometry of this.branchGeometries) geometry.setDrawRange(0, 0);
  }

  public dispose(): void {
    this.mainGeometry.dispose();
    this.glowGeometry.dispose();
    (this.mainLine.material as THREE.Material).dispose();
    (this.glowLine.material as THREE.Material).dispose();
    for (const branch of this.branches) {
      branch.geometry.dispose();
      (branch.material as THREE.Material).dispose();
    }
    this.sparks.dispose();
  }

  private rebuildBolt(fade: number): void {
    if (!this.preset) return;
    const segments = Math.min(MAX_SEGMENTS, this.preset.lightning?.segments ?? 12);
    const jitter = (this.preset.lightning?.jitter ?? 0.3) * fade;
    const direction = TMP.subVectors(this.end, this.start);
    const length = Math.max(0.001, direction.length());
    direction.normalize();
    TMP_RIGHT.crossVectors(direction, TMP_UP);
    if (TMP_RIGHT.lengthSq() <= 1e-6) TMP_RIGHT.set(1, 0, 0);
    TMP_RIGHT.normalize();
    TMP_SIDE.crossVectors(direction, TMP_RIGHT).normalize();

    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const offset = index * 3;
      const wobble = index === 0 || index === segments ? 0 : (Math.random() - 0.5) * jitter * length * 0.16;
      const wobble2 = index === 0 || index === segments ? 0 : (Math.random() - 0.5) * jitter * length * 0.12;
      this.mainPositions[offset] = this.start.x + (this.end.x - this.start.x) * t + TMP_RIGHT.x * wobble + TMP_SIDE.x * wobble2;
      this.mainPositions[offset + 1] = this.start.y + (this.end.y - this.start.y) * t + TMP_RIGHT.y * wobble + TMP_SIDE.y * wobble2;
      this.mainPositions[offset + 2] = this.start.z + (this.end.z - this.start.z) * t + TMP_RIGHT.z * wobble + TMP_SIDE.z * wobble2;
      this.glowPositions[offset] = this.mainPositions[offset];
      this.glowPositions[offset + 1] = this.mainPositions[offset + 1];
      this.glowPositions[offset + 2] = this.mainPositions[offset + 2];
    }
    this.mainGeometry.setDrawRange(0, segments + 1);
    this.glowGeometry.setDrawRange(0, segments + 1);
    this.mainAttribute.needsUpdate = true;
    this.glowAttribute.needsUpdate = true;

    const profile = mageQualityProfile(this.quality);
    const branchCount = Math.min(
      MAX_BRANCHES,
      Math.max(0, Math.round((this.preset.lightning?.branches ?? 4) * profile.lightningBranchMultiplier))
    );
    for (let branchIndex = 0; branchIndex < this.branches.length; branchIndex += 1) {
      const geometry = this.branchGeometries[branchIndex];
      if (branchIndex >= branchCount) {
        geometry.setDrawRange(0, 0);
        continue;
      }
      const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      const startIndex = 1 + Math.floor(Math.random() * Math.max(1, segments - 2));
      const sourceOffset = startIndex * 3;
      const branchLength = length * (0.12 + Math.random() * 0.18) * fade;
      const sign = Math.random() < 0.5 ? -1 : 1;
      array[0] = this.mainPositions[sourceOffset];
      array[1] = this.mainPositions[sourceOffset + 1];
      array[2] = this.mainPositions[sourceOffset + 2];
      array[3] = array[0] + TMP_RIGHT.x * branchLength * sign + TMP_SIDE.x * branchLength * 0.25;
      array[4] = array[1] + TMP_RIGHT.y * branchLength * sign + TMP_SIDE.y * branchLength * 0.25 + Math.random() * 0.12;
      array[5] = array[2] + TMP_RIGHT.z * branchLength * sign + TMP_SIDE.z * branchLength * 0.25;
      array[6] = array[3] + (Math.random() - 0.5) * branchLength * 0.4;
      array[7] = array[4] + (Math.random() - 0.5) * branchLength * 0.4;
      array[8] = array[5] + (Math.random() - 0.5) * branchLength * 0.4;
      array[9] = array[6] + TMP_RIGHT.x * branchLength * 0.35 * sign;
      array[10] = array[7] + 0.06;
      array[11] = array[8] + TMP_RIGHT.z * branchLength * 0.35 * sign;
      geometry.setDrawRange(0, 4);
      attribute.needsUpdate = true;
    }
  }
}

export class LightningVFX {
  private readonly pool: VFXPool<LightningStrike>;
  private readonly active: LightningStrike[] = [];

  public constructor(
    private readonly scene: THREE.Scene,
    resources: MageVFXResources,
    quality: MageVFXQuality
  ) {
    this.pool = new VFXPool(() => new LightningStrike(resources, quality), MAGE_VFX_LIMITS.maxLightning);
  }

  public strike(options: LightningOptions): boolean {
    const strike = this.pool.acquire();
    if (!strike) {
      options.onImpact?.();
      return false;
    }
    strike.play(options);
    this.scene.add(strike.group);
    this.active.push(strike);
    return true;
  }

  public update(delta: number): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const strike = this.active[index];
      if (strike.update(delta)) continue;
      this.pool.release(strike);
      this.active.splice(index, 1);
    }
  }

  public clear(): void {
    for (const strike of this.active) this.pool.release(strike);
    this.active.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.pool.dispose();
  }

  public get activeCount(): number { return this.active.length; }
  public get pooledCount(): number { return this.pool.inactiveCount; }
}
