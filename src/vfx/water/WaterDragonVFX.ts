import * as THREE from 'three';
import type { MageVFXResources } from '../MageVFXResources';
import { PooledParticleCloud } from '../ParticleManager';
import { VFXPool, type PoolableVFX } from '../VFXPool';
import { VFXLightPool, type VFXLightHandle } from '../VFXLightPool';
import type { MageVFXQuality } from '../VFXTypes';
import { animateWaterMaterial, bindWaterFlowTexture, createWaterSurfaceMaterial } from './WaterDragonMaterials';
import {
  createWaterColumnBody, createWaterColumnVeil, createWaterCrownPetal, createWaterDragonBody,
  createWaterDragonFin, createWaterDragonHead, createWaterDragonJaw, createWaterOrbit,
  WATER_DRAGON_SHAPE, waterDragonSpine, createWaterWakeFin, createWaterRippleDisc,
} from './WaterDragonGeometry';

import { sampleWaterDragonStrike, WATER_DRAGON_FALL_SECONDS } from './WaterDragonMotion';
export { WATER_DRAGON_FALL_SECONDS, WATER_DRAGON_IMPACT_SECONDS } from './WaterDragonMotion';
export const WATER_DRAGON_POOL_LIMITS = Object.freeze({ charges: 4, strikes: 6 });
const TAU = Math.PI * 2;

export interface WaterDragonChargeHandle { release(): void; }
export interface WaterDragonStrikeOptions {
  readonly position: THREE.Vector3;
  readonly target: THREE.Object3D | null;
  readonly isTargetAlive?: (target: THREE.Object3D) => boolean;
  readonly onImpact: (position: THREE.Vector3, target: THREE.Object3D | null) => void;
}

function sheet(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, name: string, order = 5): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

function disposeMeshes(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

class WaterDragonCharge implements PoolableVFX, WaterDragonChargeHandle {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly dragon = new THREE.Group();
  private readonly skirts = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly bodyMaterial = createWaterSurfaceMaterial('ribbon', false, 1);
  private readonly foamMaterial = createWaterSurfaceMaterial('ribbon', true, 1);
  private readonly glowMaterial = createWaterSurfaceMaterial('ribbon', 'glow', 1);
  private readonly headMaterial = createWaterSurfaceMaterial('head', false, 2);
  private readonly headFoam = createWaterSurfaceMaterial('head', true, 2);
  private readonly headGlow = createWaterSurfaceMaterial('head', 'glow', 2);
  private readonly eyesMaterial = new THREE.MeshBasicMaterial({ color: 0xd3ffff, transparent: true, depthWrite: false, toneMapped: false });
  private readonly dropletMaterial = new THREE.MeshBasicMaterial({ color: 0x88f8ff, transparent: true, depthWrite: false, toneMapped: false });
  private readonly hazeMaterial: THREE.MeshBasicMaterial;
  private readonly droplets: THREE.InstancedMesh;
  private readonly dropletTransform = new THREE.Object3D();
  private light: VFXLightHandle | null = null;
  private caster: THREE.Object3D | null = null;
  private age = 0;
  private releasedAt: number | null = null;
  private yaw = 0;

  public constructor(resources: MageVFXResources, private readonly lights: VFXLightPool, private readonly quality: MageVFXQuality) {
    for (const material of [this.bodyMaterial, this.foamMaterial, this.glowMaterial, this.headMaterial, this.headFoam, this.headGlow]) {
      bindWaterFlowTexture(material, resources.waterFlow);
    }
    this.group.name = 'MageWaterDragonChargeVFX';
    this.group.visible = false;
    this.dragon.name = 'WaterDragonSpiral';
    this.head.name = 'WaterDragonHead';
    this.group.add(this.dragon, this.skirts);
    const segments = quality === 'low' ? 64 : 112;
    const body = createWaterDragonBody(segments);
    sheet(this.dragon, body, this.glowMaterial, 'WaterDragonSoftContour', 4);
    sheet(this.dragon, body, this.bodyMaterial, 'WaterDragonBroadRibbon');
    sheet(this.dragon, body, this.foamMaterial, 'WaterDragonFoamEdges', 6);
    for (let index = 0; index < 4; index += 1) {
      sheet(this.dragon, createWaterWakeFin(0.22 + index * 0.18, 1), this.bodyMaterial, 'WaterDragonTornWake');
    }
    // Two broad, banked water walls instead of seven narrow, wire-like hoops.
    for (let index = 0; index < 2; index += 1) {
      const geometry = createWaterOrbit(2.75 + index * 0.12, 0.5 + index * 0.5, index * 2.8, 5.35, 1.45 - index * 0.12, 0.48, -0.48, segments);
      sheet(this.skirts, geometry, this.glowMaterial, 'WaterDragonLowerGlow', 4);
      sheet(this.skirts, geometry, this.bodyMaterial, 'WaterDragonLowerWave');
      sheet(this.skirts, geometry, this.foamMaterial, 'WaterDragonLowerFoam', 6);
    }
    const headGeometry = createWaterDragonHead();
    sheet(this.head, headGeometry, this.headGlow, 'WaterDragonHeadGlow', 4);
    sheet(this.head, headGeometry, this.headMaterial, 'WaterDragonLongSnout');
    sheet(this.head, headGeometry, this.headFoam, 'WaterDragonHeadCrest', 6);
    sheet(this.head, createWaterDragonJaw(), this.bodyMaterial, 'WaterDragonLowerJaw');
    for (const side of [-1, 1]) {
      sheet(this.head, createWaterDragonFin(side), this.bodyMaterial, 'WaterDragonSweptFin');
      const eye = sheet(this.head, new THREE.SphereGeometry(0.055, 8, 5), this.eyesMaterial, 'WaterDragonEye', 7);
      eye.position.set(0.1, 0.18, side * 0.24);
      eye.scale.set(1.4, 0.2, 0.45);
    }
    this.head.position.copy(waterDragonSpine(1));
    const tangent = waterDragonSpine(1).sub(waterDragonSpine(0.99));
    this.head.rotation.y = -Math.atan2(tangent.z, tangent.x);
    this.dragon.add(this.head);

    this.hazeMaterial = new THREE.MeshBasicMaterial({ map: resources.softGlow, color: 0x008cdb, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const haze = sheet(this.group, new THREE.PlaneGeometry(7, 7), this.hazeMaterial, 'WaterDragonGroundMist', 3);
    haze.rotation.x = -Math.PI / 2;
    haze.position.y = 0.04;
    this.droplets = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4), this.dropletMaterial, quality === 'low' ? 12 : 24);
    this.droplets.name = 'WaterDragonFineDroplets';
    this.droplets.frustumCulled = false;
    this.droplets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.droplets);
  }

  public play(caster: THREE.Object3D): void {
    this.caster = caster;
    this.age = 0;
    this.releasedAt = null;
    this.yaw = caster.rotation.y;
    this.group.visible = true;
    this.group.scale.setScalar(1);
    this.light = this.quality === 'low' ? null : this.lights.acquire();
    if (this.light) {
      this.light.light.color.set(0x28dfff);
      this.light.light.distance = 7;
      this.light.light.intensity = 0;
    }
    this.update(0);
  }

  public release(): void {
    if (this.active && this.releasedAt === null) this.releasedAt = this.age;
  }

  public update(delta: number): boolean {
    if (!this.caster) return false;
    this.age += Math.max(0, delta);
    const ending = this.releasedAt === null ? 0 : (this.age - this.releasedAt) / 0.28;
    const grow = THREE.MathUtils.smoothstep(this.age, 0, 0.18);
    const opacity = grow * (1 - THREE.MathUtils.smoothstep(ending, 0, 1));
    this.caster.getWorldPosition(this.group.position);
    this.dragon.rotation.y = this.yaw - this.age * 1.35;
    this.skirts.rotation.y = this.yaw - this.age * 2.2;
    const expansion = 0.76 + grow * 0.24 + Math.min(1, ending) * 0.12;
    this.dragon.scale.set(expansion, 0.84 + grow * 0.16, expansion);
    this.skirts.scale.setScalar(expansion);
    this.head.scale.setScalar(THREE.MathUtils.smoothstep(this.age, 0.12, 0.28));
    const reveal = Math.min(1.08, 0.14 + this.age * 3.6);
    animateWaterMaterial(this.bodyMaterial, this.age, opacity * 0.92, reveal);
    animateWaterMaterial(this.foamMaterial, this.age, opacity * 0.52, reveal);
    animateWaterMaterial(this.glowMaterial, this.age, opacity, reveal);
    animateWaterMaterial(this.headMaterial, this.age, opacity);
    animateWaterMaterial(this.headFoam, this.age, opacity * 0.85);
    animateWaterMaterial(this.headGlow, this.age, opacity);
    this.eyesMaterial.opacity = opacity * 0.92;
    this.dropletMaterial.opacity = opacity * 0.68;
    this.hazeMaterial.opacity = opacity * 0.32;
    for (let index = 0; index < this.droplets.count; index += 1) {
      const a = index * 2.399 - this.age * 3.2;
      const r = 2.8 + Math.sin(index * 1.7) * 0.2;
      this.dropletTransform.position.set(Math.cos(a) * r, 0.24 + (index % 9) * 0.23 + Math.sin(this.age * 4 + index) * 0.12, Math.sin(a) * r);
      this.dropletTransform.scale.set(0.025, 0.07 + (index % 3) * 0.022, 0.025);
      this.dropletTransform.rotation.set(0, -a, 0.8);
      this.dropletTransform.updateMatrix();
      this.droplets.setMatrixAt(index, this.dropletTransform.matrix);
    }
    this.droplets.instanceMatrix.needsUpdate = true;
    if (this.light) {
      this.light.light.position.copy(this.group.position).y += 1.7;
      this.light.light.intensity = opacity * 0.85;
    }
    return ending < 1;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.caster = null;
    this.light?.release();
    this.light = null;
    this.releasedAt = null;
    this.age = 0;
  }
  public dispose(): void { this.reset(); disposeMeshes(this.group); }
}

class WaterDragonStrike implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly column = new THREE.Group();
  private readonly impact = new THREE.Group();
  private readonly crown = new THREE.Group();
  private readonly rings = new THREE.Group();
  private readonly columnMaterial = createWaterSurfaceMaterial('column', false, 4);
  private readonly columnFoam = createWaterSurfaceMaterial('column', true, 4);
  private readonly veilMaterial = createWaterSurfaceMaterial('veil', false, 5);
  private readonly columnGlow = createWaterSurfaceMaterial('column', 'glow', 4);
  private readonly splashMaterial = createWaterSurfaceMaterial('splash', false, 6);
  private readonly splashFoam = createWaterSurfaceMaterial('splash', true, 6);
  private readonly rippleMaterial = createWaterSurfaceMaterial('ripple', false, 7);
  private readonly hazeMaterial: THREE.MeshBasicMaterial;
  private readonly particles: PooledParticleCloud;
  private readonly fallingDrops: THREE.InstancedMesh;
  private readonly fallingMaterial = new THREE.MeshBasicMaterial({ color: 0x87faff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  private readonly fallingTransform = new THREE.Object3D();
  private light: VFXLightHandle | null = null;
  private options: WaterDragonStrikeOptions | null = null;
  private age = 0;
  public impacted = false;

  public constructor(resources: MageVFXResources, private readonly lights: VFXLightPool, private readonly quality: MageVFXQuality) {
    for (const material of [this.columnMaterial, this.columnFoam, this.columnGlow, this.veilMaterial, this.splashMaterial, this.splashFoam]) {
      bindWaterFlowTexture(material, resources.waterFlow);
    }
    this.group.name = 'MageWaterDragonSkyStrikeVFX';
    this.group.visible = false;
    this.column.name = 'WaterDragonDescendingColumn';
    this.impact.name = 'WaterDragonImpactCrown';
    this.crown.name = 'WaterDragonOutwardSheets';
    this.rings.name = 'WaterDragonBrokenImpactArcs';
    this.group.add(this.column, this.impact);
    this.impact.add(this.crown, this.rings);
    const shape = WATER_DRAGON_SHAPE;
    const tube = createWaterColumnBody(quality === 'low' ? 24 : 40);
    sheet(this.column, tube, this.columnGlow, 'WaterDragonWaterfallGlow', 4);
    sheet(this.column, tube, this.columnMaterial, 'WaterDragonWaterfallBody');
    sheet(this.column, tube, this.columnFoam, 'WaterDragonWaterfallFoam', 6);
    for (let index = 0; index < 6; index += 1) {
      sheet(this.column, createWaterColumnVeil(index / 6 * TAU), this.veilMaterial, 'WaterDragonFallingSheet');
    }
    for (let index = 0; index < 7; index += 1) {
      const geometry = createWaterCrownPetal(index / 7 * TAU + Math.sin(index * 4) * 0.18, index);
      sheet(this.crown, geometry, this.splashMaterial, 'WaterDragonPointedSplash');
      if (index % 2 === 0) sheet(this.crown, geometry, this.splashFoam, 'WaterDragonSplashFoam', 6);
    }
    for (let index = 0; index < 4; index += 1) {
      const geometry = createWaterOrbit(index < 2 ? 1.65 : shape.impactRadius, 0.23 + (index % 2) * 0.035, index * 2.1, 2.1, index < 2 ? 0.70 : 1.02, 0.01, 1.26, 80);
      sheet(this.rings, geometry, this.splashMaterial, 'WaterDragonSlicedGroundWave');
      sheet(this.rings, geometry, this.splashFoam, 'WaterDragonGroundWaveRim', 6);
    }
    // Concentric floor ripples: the clearest "water hit the ground" cue.
    const ripples = sheet(this.rings, createWaterRippleDisc(24, 72), this.rippleMaterial, 'WaterDragonRippleRings', 5);
    ripples.position.y = 0.03;
    ripples.scale.setScalar(2.35);
    this.hazeMaterial = new THREE.MeshBasicMaterial({ map: resources.softGlow, color: 0x009cfa, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const mist = sheet(this.impact, new THREE.PlaneGeometry(7.2, 7.2), this.hazeMaterial, 'WaterDragonImpactMist', 3);
    mist.rotation.x = -Math.PI / 2;
    mist.position.y = 0.04;
    this.particles = new PooledParticleCloud(36, resources.softGlow);
    this.particles.points.name = 'WaterDragonImpactDroplets';
    this.impact.add(this.particles.points);
    this.fallingDrops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 3), this.fallingMaterial, quality === 'low' ? 10 : 22);
    this.fallingDrops.name = 'WaterDragonDownwardDroplets';
    this.fallingDrops.frustumCulled = false;
    this.fallingDrops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.column.add(this.fallingDrops);
  }

  public play(options: WaterDragonStrikeOptions): void {
    this.options = options;
    this.age = 0;
    this.impacted = false;
    this.group.position.copy(options.position);
    this.group.scale.setScalar(1);
    this.group.visible = true;
    this.impact.visible = false;
    this.column.visible = true;
    this.particles.reset();
    this.light = this.quality === 'low' ? null : this.lights.acquire();
    if (this.light) {
      this.light.light.color.set(0x25dfff);
      this.light.light.distance = 8;
      this.light.light.intensity = 0;
    }
    this.update(0);
  }

  public update(delta: number): boolean {
    if (!this.options) return false;
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    const target = this.options.target;
    const alive = target && (!this.options.isTargetAlive || this.options.isTargetAlive(target));
    // Track the marked enemy only during descent; the splash then stays on the floor.
    if (!this.impacted && alive) target.getWorldPosition(this.group.position);
    const frame = sampleWaterDragonStrike(this.age);
    this.column.position.y = frame.columnY;
    this.column.rotation.y = 0;
    if (!this.impacted && frame.landed) {
      this.impacted = true;
      this.impact.visible = true;
      this.particles.emit(new THREE.Vector3(0, 0.28, 0), {
        color: 0xa2f7ff, count: this.quality === 'low' ? 12 : 30,
        speed: 2.8, spread: 1.2, lifetime: 0.3, upwardBias: 0.03,
        size: [0.65, 1.9], opacity: 0.68,
      });
      this.options.onImpact(this.group.position.clone(), alive ? target : null);
      if (!this.active || !this.options) return false;
    }
    const { impactAge, columnOpacity, splashOpacity, topCut } = frame;
    animateWaterMaterial(this.columnMaterial, this.age, columnOpacity * 0.94, 1, topCut);
    animateWaterMaterial(this.columnFoam, this.age, columnOpacity * 0.36, 1, topCut);
    animateWaterMaterial(this.columnGlow, this.age, columnOpacity, 1, topCut);
    animateWaterMaterial(this.veilMaterial, this.age, columnOpacity * 0.66, 1, topCut);
    animateWaterMaterial(this.splashMaterial, this.age, splashOpacity * 0.96);
    animateWaterMaterial(this.splashFoam, this.age, splashOpacity * 0.88);
    animateWaterMaterial(this.rippleMaterial, impactAge, splashOpacity * 0.9);
    // OUTWARD radius increases, vertical extent decreases from first contact.
    this.crown.scale.set(frame.crownRadius, frame.crownHeight, frame.crownRadius);
    this.crown.rotation.y = 0.10;
    this.rings.scale.set(frame.ringRadius, 1, frame.ringRadius);
    this.rings.rotation.y = -impactAge * 0.35;
    this.hazeMaterial.opacity = splashOpacity * 0.42;
    this.particles.update(elapsed);
    this.fallingMaterial.opacity = columnOpacity * 0.56;
    for (let index = 0; index < this.fallingDrops.count; index += 1) {
      const phase = (this.age * 1.9 + index * 0.127) % 1;
      const height = 1 - phase;
      const angle = index * 2.399;
      const radius = 0.77 + Math.sin(index * 3.7) * 0.2;
      this.fallingTransform.position.set(Math.cos(angle) * radius, height * WATER_DRAGON_SHAPE.columnHeight, Math.sin(angle) * radius);
      const visible = height < topCut ? 1 : 0;
      this.fallingTransform.scale.set(0.018 * visible, (0.12 + (index % 4) * 0.04) * visible, 0.018 * visible);
      this.fallingTransform.updateMatrix();
      this.fallingDrops.setMatrixAt(index, this.fallingTransform.matrix);
    }
    this.fallingDrops.instanceMatrix.needsUpdate = true;
    if (this.light) {
      this.light.light.position.copy(this.group.position).y += 0.75;
      this.light.light.intensity = this.impacted ? Math.exp(-impactAge * 5) * 1.55 : 0;
    }
    return frame.alive;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.options = null;
    this.age = 0;
    this.impacted = false;
    this.particles.reset();
    this.light?.release();
    this.light = null;
  }
  public dispose(): void { this.reset(); this.particles.dispose(); disposeMeshes(this.group); }
}

/** Independent pooled water delivery. Never creates a hand orb, laser or soap bubble. */
export class WaterDragonVFX {
  private readonly chargePool: VFXPool<WaterDragonCharge>;
  private readonly strikePool: VFXPool<WaterDragonStrike>;
  private readonly charges: WaterDragonCharge[] = [];
  private readonly strikes: WaterDragonStrike[] = [];
  /** Logical hits still wait for the descent when all GPU slots are occupied. */
  private readonly pendingStrikes: Array<{
    options: WaterDragonStrikeOptions;
    position: THREE.Vector3;
    elapsed: number;
  }> = [];

  public constructor(private readonly scene: THREE.Scene, resources: MageVFXResources, lights: VFXLightPool, quality: MageVFXQuality) {
    this.chargePool = new VFXPool(() => new WaterDragonCharge(resources, lights, quality), WATER_DRAGON_POOL_LIMITS.charges);
    this.strikePool = new VFXPool(() => new WaterDragonStrike(resources, lights, quality), WATER_DRAGON_POOL_LIMITS.strikes);
  }

  public charge(caster: THREE.Object3D): WaterDragonChargeHandle | null {
    const effect = this.chargePool.acquire();
    if (!effect) return null;
    effect.play(caster);
    this.scene.add(effect.group);
    this.charges.push(effect);
    return effect;
  }

  public strike(options: WaterDragonStrikeOptions): void {
    const effect = this.strikePool.acquire();
    if (!effect) {
      // Saturation must neither swallow damage nor apply it before the water lands.
      this.pendingStrikes.push({ options, position: options.position.clone(), elapsed: 0 });
      return;
    }
    effect.play(options);
    this.scene.add(effect.group);
    this.strikes.push(effect);
  }

  public update(delta: number): void {
    const elapsed = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    for (let index = this.pendingStrikes.length - 1; index >= 0; index -= 1) {
      const pending = this.pendingStrikes[index];
      if (!pending) continue;
      pending.elapsed += elapsed;
      const { options } = pending;
      const alive = options.target && (!options.isTargetAlive || options.isTargetAlive(options.target));
      if (alive) options.target!.getWorldPosition(pending.position);
      if (pending.elapsed < WATER_DRAGON_FALL_SECONDS) continue;
      // Remove before the callback: gameplay may synchronously clear/dispose VFX.
      this.pendingStrikes.splice(index, 1);
      options.onImpact(pending.position, alive ? options.target : null);
    }
    for (let index = this.charges.length - 1; index >= 0; index -= 1) {
      const effect = this.charges[index];
      if (!effect || effect.update(elapsed)) continue;
      this.chargePool.release(effect);
      if (this.charges[index] === effect) this.charges.splice(index, 1);
    }
    for (let index = this.strikes.length - 1; index >= 0; index -= 1) {
      const effect = this.strikes[index];
      if (!effect || effect.update(elapsed)) continue;
      if (this.strikes[index] !== effect) continue;
      this.strikePool.release(effect);
      this.strikes.splice(index, 1);
    }
  }

  public clear(): void {
    this.chargePool.clearActive();
    this.strikePool.clearActive();
    this.charges.length = 0;
    this.strikes.length = 0;
    this.pendingStrikes.length = 0;
  }
  public dispose(): void { this.clear(); this.chargePool.dispose(); this.strikePool.dispose(); }
  public get activeCharges(): number { return this.charges.length; }
  public get pooledCharges(): number { return this.chargePool.inactiveCount; }
  public get activeStrikes(): number { return this.strikes.length; }
  public get pooledStrikes(): number { return this.strikePool.inactiveCount; }
  public get activeImpacts(): number { return this.strikes.filter((strike) => strike.impacted).length; }
}
