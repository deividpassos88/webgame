import * as THREE from 'three';
import { MAGE_SPELL_TRAVEL_METERS } from '../combat/MageSpellFlight';
import { MAGE_VFX_LIMITS, mageQualityProfile } from './VFXConfig';
import { MageVFXResources } from './MageVFXResources';
import { PooledParticleCloud, qualityCount } from './ParticleManager';
import { VFXPool, type PoolableVFX } from './VFXPool';
import {
  configureEnergyMaterial,
  configureFrostBulletMaterial,
  createEnergyTrailMaterial,
  createFrostBulletMaterial,
  setEnergyTime,
  setFrostBulletTime,
  type EnergyShaderMaterial,
  type FrostBulletMaterial,
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
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const TMP_CAMERA = new THREE.Vector3();
const TMP_BASIS_X = new THREE.Vector3();
const TMP_BASIS_Y = new THREE.Vector3();
const TMP_BASIS_Z = new THREE.Vector3();
const TMP_QUATERNION = new THREE.Quaternion();
const TMP_QUATERNION_2 = new THREE.Quaternion();
const COMET_BASIS = new THREE.Matrix4();
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
  private readonly comet: THREE.Mesh;
  private readonly cometMaterial: FrostBulletMaterial;
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
  /** Câmera viva, usada para orientar o sprite do cometa (billboard). */
  private getCamera: (() => THREE.Camera | null) | undefined = undefined;
  /** World-space frost wake: it must not follow the bolt once it is released. */
  private frostCloud: PooledParticleCloud | null = null;
  private frostConfig: MageProjectileFrostConfig | null = null;
  private frostTimer = 0;

  public constructor(
    private readonly resources: MageVFXResources,
    private readonly quality: MageVFXQuality,
    private readonly lightPool: VFXLightPool,
    private readonly scene: THREE.Scene,
    private readonly sceneCamera: () => THREE.Camera | null = () => null
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

    // Sprite do cometa de gelo: dardo + seda + gelo, todo em shader. Ele fica
    // sempre de frente para a câmera e gira para apontar no sentido do voo
    // (stretched billboard), então o desenho aparece igual à referência mesmo
    // com a câmera atrás da Maga.
    this.cometMaterial = createFrostBulletMaterial({ opacity: 0 });
    this.comet = new THREE.Mesh(resources.quad, this.cometMaterial);
    this.comet.name = 'MageFrostBulletComet';
    this.comet.visible = false;
    this.comet.frustumCulled = false;
    this.comet.renderOrder = 5;

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
      this.comet,
      this.trail,
      this.core,
      this.iceShard,
      this.lavaInner,
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
    this.getCamera = this.sceneCamera;
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
    this.configureComet(options.preset, radius);

    const coreMaterial = this.core.material as THREE.MeshBasicMaterial;
    coreMaterial.color.set(options.preset.colors.core);
    coreMaterial.opacity = this.bullet ? 0 : options.preset.style === 'ice' ? 0.28 : 0.96;
    // Na bala quem desenha a ponta é o sprite do cometa.
    this.core.visible = !this.bullet && options.preset.style !== 'ice';
    this.core.scale.setScalar(radius * (this.bullet ? 0.75 : options.preset.style === 'water' ? 1.25 : 1.15));
    this.core.position.set(0, 0, 0);

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
    if (this.bullet) {
      setFrostBulletTime(this.cometMaterial, this.age);
    } else {
      setEnergyTime(this.trailMaterial, this.age);
    }

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
    if (this.bullet) {
      // A cauda da bala é a seda do sprite; a fita de energia fica desligada.
      this.orientComet();
    } else {
      this.updateTrailGeometry(this.config.trailLength, this.config.trailWidth);
    }
    this.secondaryParticles.points.position.copy(TMP_LOCAL.set(0, 0, -this.config.trailLength * 0.26));
    this.secondaryParticles.update(elapsed);
    this.updateFrost(elapsed);

    const pulse = 0.92 + Math.sin(this.age * (this.preset.style === 'water' ? 18 : 28)) * 0.08;
    this.glow.scale.setScalar(this.config.radius * this.haloScale * pulse);
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
    this.comet.visible = false;
    this.cometMaterial.uniforms.uOpacity.value = 0;
    this.trail.visible = true;
    this.releaseFrost();
    this.lightHandle?.release();
    this.lightHandle = null;
    this.trailMaterial.uniforms.uOpacity.value = 0;
  }

  public dispose(): void {
    (this.core.material as THREE.Material).dispose();
    (this.iceShard.material as THREE.Material).dispose();
    (this.lavaInner.material as THREE.Material).dispose();
    (this.glow.material as THREE.Material).dispose();
    this.cometMaterial.dispose();
    this.trailMaterial.dispose();
    this.trailGeometry.dispose();
    this.secondaryParticles.dispose();
    this.releaseFrost();
    this.frostCloud?.dispose();
    this.frostCloud = null;
  }

  /**
   * Liga/desliga o sprite do cometa e o dimensiona a partir do raio: o sprite
   * vai da cauda (u = 0) à ponta (u = 1) no eixo +X local, e o billboard cuida
   * de apontar esse eixo no sentido do voo.
   */
  private configureComet(preset: MageSpellPreset, radius: number): void {
    const comet = preset.projectile.comet;
    this.comet.visible = this.bullet && comet !== undefined;
    if (!this.bullet || !comet) {
      this.cometMaterial.uniforms.uOpacity.value = 0;
      // Bala sem sprite cai de volta na fita de energia (nunca fica sem rastro).
      this.trail.visible = true;
      return;
    }

    const width = radius * comet.widthScale;
    const length = radius * comet.lengthScale;
    this.comet.scale.set(length, width, 1);
    // O grupo marca o ponto de colisão; o sprite recua para a PONTA do cometa
    // cair exatamente nesse ponto (o rastro vem atrás, como na referência).
    this.comet.position.set(0, 0, -length * 0.5);
    configureFrostBulletMaterial(this.cometMaterial, {
      core: preset.colors.core,
      glow: preset.colors.glow,
      deep: preset.colors.secondary,
      opacity: 1,
      intensity: comet.intensity ?? 1.45,
      headLength: comet.headLength ?? 0.3,
      wisp: comet.wisp ?? 1,
      filament: comet.filaments ?? 1,
      sparks: comet.sparkles ?? 5,
      haze: comet.haze ?? 0.35,
      // Seeds diferentes por disparo: a seda de duas balas no ar não é idêntica.
      seed: Math.random(),
      scroll: comet.scroll ?? 1,
    });

    // O rastro de energia antigo pode ficar ligado em intensidade baixa como
    // fumaça extra, ou desligado de vez quando a seda já faz a cauda inteira.
    const trailOpacity = comet.trailOpacity ?? 0;
    this.trail.visible = trailOpacity > 0;
    if (this.trail.visible) this.trailMaterial.uniforms.uOpacity.value = trailOpacity;
  }

  /**
   * Stretched billboard: o sprite fica sempre de frente para a câmera e gira
   * dentro do plano da tela para que o eixo do desenho acompanhe a direção do
   * voo projetada. É assim que a referência aparece de qualquer ângulo de
   * câmera (uma fita presa ao eixo do voo ficaria de perfil).
   */
  private orientComet(): void {
    const camera = this.getCamera?.() ?? null;
    if (camera) {
      TMP_CAMERA.subVectors(camera.position, this.group.position);
    } else {
      // Sem câmera (testes/headless): vista lateral fixa.
      TMP_CAMERA.crossVectors(this.direction, WORLD_UP);
    }
    if (TMP_CAMERA.lengthSq() <= 1e-8) TMP_CAMERA.set(0, 1, 0);
    TMP_CAMERA.normalize();

    // Eixo do desenho = direção do voo projetada no plano da tela.
    TMP_BASIS_X.copy(this.direction)
      .addScaledVector(TMP_CAMERA, -this.direction.dot(TMP_CAMERA));
    if (TMP_BASIS_X.lengthSq() < 1e-4) {
      // Voando direto para dentro/fora da câmera: a projeção some e o sprite
      // fica de topo; usa o "cima" da tela como eixo.
      TMP_BASIS_X.set(0, 1, 0).addScaledVector(TMP_CAMERA, -TMP_CAMERA.y);
      if (TMP_BASIS_X.lengthSq() < 1e-4) TMP_BASIS_X.set(1, 0, 0);
    }
    TMP_BASIS_X.normalize();
    TMP_BASIS_Y.crossVectors(TMP_CAMERA, TMP_BASIS_X).normalize();
    TMP_BASIS_Z.crossVectors(TMP_BASIS_X, TMP_BASIS_Y).normalize();
    // Mantém a face do sprite virada para a câmera (eixo de base à direita).
    if (TMP_BASIS_Z.dot(TMP_CAMERA) < 0) {
      TMP_BASIS_Y.negate();
      TMP_BASIS_Z.negate();
    }

    COMET_BASIS.makeBasis(TMP_BASIS_X, TMP_BASIS_Y, TMP_BASIS_Z);
    TMP_QUATERNION.setFromRotationMatrix(COMET_BASIS);
    // O cometa é filho do grupo (que já aponta o +Z para o voo), então a
    // orientação local é a do mundo desfeita pela rotação do grupo.
    TMP_QUATERNION_2.copy(this.group.quaternion).invert();
    this.comet.quaternion.copy(TMP_QUATERNION_2).multiply(TMP_QUATERNION);
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
    lightPool: VFXLightPool,
    camera: () => THREE.Camera | null = () => null
  ) {
    this.pool = new VFXPool(
      // Scene is handed to each bolt so its frost wake can live in world space,
      // and the camera provider so the comet sprite can billboard.
      () => new MageProjectile(resources, quality, lightPool, scene, camera),
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
