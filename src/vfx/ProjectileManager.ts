import * as THREE from 'three';
import { MAGE_SPELL_TRAVEL_METERS } from '../combat/MageSpellFlight';
import { MAGE_VFX_LIMITS, mageQualityProfile } from './VFXConfig';
import { MageVFXResources } from './MageVFXResources';
import { PooledParticleCloud, qualityCount } from './ParticleManager';
import { VFXPool, type PoolableVFX } from './VFXPool';
import {
  configureEnergyMaterial,
  createEnergyTrailMaterial,
  createMagicCircleMaterial,
  setEnergyTime,
  type EnergyShaderMaterial,
} from './VFXMaterials';
import { VFXLightPool, type VFXLightHandle } from './VFXLightPool';
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
/** Where the glow light sat relative to the projectile when it was a child. */
const LIGHT_LOCAL_OFFSET = new THREE.Vector3(0, 0.1, 0);
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
  /** Faixa larga de fumaça incandescente atrás do cometa. */
  private readonly smokeTrail: THREE.Mesh;
  private readonly trailGeometry = new THREE.BufferGeometry();
  private readonly trailPositions = new Float32Array(TRAIL_SEGMENTS * 2 * 3);
  private readonly trailUvs = new Float32Array(TRAIL_SEGMENTS * 2 * 2);
  private readonly trailPositionAttribute = new THREE.BufferAttribute(this.trailPositions, 3);
  private readonly smokeTrailGeometry = new THREE.BufferGeometry();
  private readonly smokeTrailPositions = new Float32Array(TRAIL_SEGMENTS * 2 * 3);
  private readonly smokeTrailUvs = new Float32Array(TRAIL_SEGMENTS * 2 * 2);
  private readonly smokeTrailPositionAttribute = new THREE.BufferAttribute(this.smokeTrailPositions, 3);
  private readonly secondaryParticles: PooledParticleCloud;
  private lightHandle: VFXLightHandle | null = null;
  private readonly trailMaterial: EnergyShaderMaterial;
  private readonly smokeTrailMaterial: EnergyShaderMaterial;
  /** Cabeça do cometa: núcleo esticado no sentido do voo. */
  private headStretch = 1;
  /** Casca 3D da cabeça: dá volume de chama em volta do núcleo. */
  private readonly cometHead: THREE.Mesh;
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
    private readonly quality: MageVFXQuality,
    private readonly lightPool: VFXLightPool
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

    // Casca da cabeça do cometa: uma esfera esticada no eixo do voo, bem mais
    // larga que o núcleo. É o volume de fogo que aparece na imagem.
    this.cometHead = new THREE.Mesh(resources.sphere, new THREE.MeshBasicMaterial({
      color: 0xffa526,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.cometHead.name = 'MageCometHead';
    this.cometHead.visible = false;
    this.cometHead.renderOrder = 3;

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

    // A fumaça incandescente usa a mesma malha de fita, mais larga e atrás do
    // rastro quente: é o que dá o volume de "cometa" em vez de um raio fino.
    for (let segment = 0; segment < TRAIL_SEGMENTS; segment += 1) {
      const t = segment / (TRAIL_SEGMENTS - 1);
      const uvOffset = segment * 4;
      this.smokeTrailUvs[uvOffset] = 0;
      this.smokeTrailUvs[uvOffset + 1] = t;
      this.smokeTrailUvs[uvOffset + 2] = 1;
      this.smokeTrailUvs[uvOffset + 3] = t;
    }
    this.smokeTrailGeometry.setAttribute('position', this.smokeTrailPositionAttribute);
    this.smokeTrailGeometry.setAttribute('uv', new THREE.BufferAttribute(this.smokeTrailUvs, 2));
    this.smokeTrailGeometry.setIndex(buildTrailIndices());
    this.smokeTrailMaterial = createEnergyTrailMaterial({ opacity: 0, intensity: 1.1, thickness: 1.5, depthTest: true });
    this.smokeTrail = new THREE.Mesh(this.smokeTrailGeometry, this.smokeTrailMaterial);
    this.smokeTrail.name = 'MageProjectileSmokeTrail';
    this.smokeTrail.frustumCulled = false;
    this.smokeTrail.renderOrder = 3;

    this.secondaryParticles = new PooledParticleCloud(38, resources.softGlow);
    this.group.add(
      this.trail,
      this.smokeTrail,
      this.cometHead,
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

    // Cometa: a cabeça é o próprio núcleo esticado no sentido do voo (o grupo
    // já está orientado com +Z na direção do disparo) e a cauda de brasa vem do
    // rastro quente + da faixa de fumaça incandescente.
    const comet = options.preset.projectile.comet;
    this.headStretch = comet?.headStretch ?? 1;
    const headRadius = options.preset.projectile.radius * (options.preset.style === 'water' ? 1.25 : 1.15);
    this.core.scale.set(headRadius, headRadius, headRadius * this.headStretch);
    this.cometHead.visible = comet !== undefined;
    if (comet) {
      const headMaterial = this.cometHead.material as THREE.MeshBasicMaterial;
      headMaterial.color.set(options.preset.colors.glow);
      headMaterial.opacity = 0.5;
      // Um pouco maior que o núcleo em todas as direções: o núcleo branco
      // aparece "dentro" da chama, como na imagem.
      this.cometHead.scale.set(
        headRadius * 1.45,
        headRadius * 1.45,
        headRadius * this.headStretch * 1.5
      );
    }

    const glowMaterial = this.glow.material as THREE.SpriteMaterial;
    glowMaterial.map = this.resources.mageTexture(options.preset.style, 'charge');
    glowMaterial.color.set(options.preset.colors.glow);
    glowMaterial.opacity = options.preset.style === 'lava' ? 0.98 : 0.9;
    this.secondaryParticles.setTexture(this.resources.mageTexture(options.preset.style, 'charge'));
    // Halo da cabeça: no cometa ele é GRANDE (é o brilho que domina a leitura
    // do golpe). Nos outros feitiços mantém o tamanho de sempre.
    this.glow.scale.setScalar(
      options.preset.projectile.radius
        * (options.preset.style === 'water' ? 4.0 : comet ? 4.2 : 3.4)
    );

    const profile = mageQualityProfile(this.quality);
    configureEnergyMaterial(this.trailMaterial, {
      // ATENÇÃO à convenção da fita: a coordenada `along` é 0 na CABEÇA (z=0)
      // e 1 na ponta da calda, e o shader pinta `colorB` na cabeça e `colorA`
      // na calda. Por isso, no cometa: núcleo branco-amarelo atrás da cabeça
      // derretendo para o vermelho fundo na ponta — igual à imagem.
      colorA: comet ? options.preset.colors.secondary : options.preset.colors.core,
      colorB: comet ? options.preset.colors.core : options.preset.colors.secondary,
      opacity: options.preset.style === 'water' ? 0.72 : options.preset.style === 'lava' ? 0.94 : options.preset.id === 'basic' ? 0.95 : 0.82,
      intensity: options.preset.style === 'lava' ? 1.9 : options.preset.style === 'lightning' ? 2.1 : 1.55,
      noiseScale: options.preset.style === 'water' ? 1.1 : 1.45,
      scrollSpeed: options.preset.style === 'lava' ? 1.45 : options.preset.style === 'lightning' ? 2.6 : 1.65,
      // O ataque básico é a assinatura da Maga: rastro mais grosso e vivo que
      // o dos feitiços grandes, que já têm corpo próprio.
      thickness: options.preset.id === 'basic' ? 1.25 : 1.08,
      distortion: styleDistortion(options.preset) * profile.distortionMultiplier,
    });
    configureEnergyMaterial(this.smokeTrailMaterial, {
      // Fumaça: quente (laranja) junto da cabeça e escura na ponta.
      colorA: options.preset.colors.smoke ?? options.preset.colors.secondary,
      colorB: options.preset.colors.glow,
      opacity: comet ? 0.55 : 0,
      intensity: 1.2,
      noiseScale: 1.05,
      scrollSpeed: 0.85,
      thickness: 1.7,
      distortion: 1.9,
    });
    this.updateTrailGeometry(
      options.preset.projectile.trailLength * (comet?.tailLength ?? 1),
      options.preset.projectile.trailWidth
    );

    // Borrowed from the shared pool: no scene add/remove, so no recompiles.
    // (The glow map swap above needs no needsUpdate: the sprite is constructed
    // with a map, so texture-to-texture swaps keep the same program.)
    this.lightHandle = profile.enableSecondaryLights ? this.lightPool.acquire() : null;
    if (this.lightHandle) {
      this.lightHandle.light.color.set(options.preset.colors.glow);
      this.lightHandle.light.intensity = options.preset.style === 'lava' ? 0.9 : 0.55;
      this.lightHandle.light.distance = options.preset.projectile.radius * 8;
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
      // Chegou ao alcance máximo sem acertar ninguém: o feitiço se dissipa no
      // ar. Não existe impacto "no vazio" — impacto é só quando acerta um alvo.
      if (this.target && hitDistance <= Math.max(this.config.radius, travel + 0.05)) {
        this.impact();
      }
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
    const cometFade = Math.max(0, 1 - this.age / Math.max(0.001, this.config.lifetime));
    if (this.cometHead.visible) {
      const flicker = 0.94 + Math.sin(this.age * 26) * 0.06;
      const headRadius = this.config.radius * 1.15;
      this.cometHead.scale.set(
        headRadius * 1.45 * flicker,
        headRadius * 1.45 * flicker,
        headRadius * this.headStretch * 1.5 * flicker
      );
      (this.cometHead.material as THREE.MeshBasicMaterial).opacity = 0.5 * cometFade;
    }
    // A fumaça incandescente se dissipa mais rápido que o rastro quente.
    if (this.preset.projectile.comet) {
      this.smokeTrailMaterial.uniforms.uOpacity.value =
        0.5 * cometFade * (0.75 + Math.sin(this.age * 12) * 0.25);
      this.smokeTrailMaterial.uniforms.uThickness.value = 1.55 + Math.sin(this.age * 9) * 0.35;
    }

    if (this.lightHandle) {
      this.lightHandle.light.intensity *= 0.985;
      this.syncLightPosition();
    }

    // O cometa solta brasas sem parar; os outros feitiços mantêm o ritmo antigo.
    if (this.age % (this.preset.projectile.comet ? 0.045 : 0.075) < elapsed) this.emitSecondaryWake();

    if (this.age >= this.config.lifetime) {
      // Mesma regra do fim de alcance: sem alvo, sem impacto.
      if (this.target) this.impact();
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
    this.smokeTrailMaterial.uniforms.uOpacity.value = 0;
    this.cometHead.visible = false;
    (this.cometHead.material as THREE.MeshBasicMaterial).opacity = 0;
    this.headStretch = 1;
    this.lightHandle?.release();
    this.lightHandle = null;
    this.trailMaterial.uniforms.uOpacity.value = 0;
  }

  public dispose(): void {
    (this.core.material as THREE.Material).dispose();

    (this.iceShard.material as THREE.Material).dispose();
    (this.lavaInner.material as THREE.Material).dispose();
    (this.glow.material as THREE.Material).dispose();
    (this.cometHead.material as THREE.Material).dispose();
    this.trailMaterial.dispose();
    this.trailGeometry.dispose();
    this.smokeTrailMaterial.dispose();
    this.smokeTrailGeometry.dispose();
    this.secondaryParticles.dispose();
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

  /**
   * Escreve uma fita de rastro (a quente e a de fumaça) no buffer informado.
   * Ambas saem da cabeça para trás, com ondulação e irregularidade que crescem
   * com a distância — é o que dá o aspecto de rastro de cometa, não de raio.
   */
  private writeTrailGeometry(
    positions: Float32Array,
    attribute: THREE.BufferAttribute,
    geometry: THREE.BufferGeometry,
    length: number,
    width: number,
    turbulence: number,
    rise: number,
    wobble: number
  ): void {
    if (!this.preset) return;
    for (let segment = 0; segment < TRAIL_SEGMENTS; segment += 1) {
      const t = segment / (TRAIL_SEGMENTS - 1);
      const fade = Math.pow(1 - t, 0.72);
      const wave = Math.sin(t * Math.PI * wobble + this.age * (this.preset.style === 'lightning' ? 32 : 10));
      const irregular = Math.sin(t * 17.3 + this.age * 7.1) * width * turbulence;
      const centerX = (wave * width * 0.42 + irregular) * t;
      const y = Math.sin(t * Math.PI) * width * rise;
      const half = Math.max(0.006, width * fade);
      const z = -length * t;
      const left = segment * 6;
      const right = left + 3;
      positions[left] = centerX - half;
      positions[left + 1] = y;
      positions[left + 2] = z;
      positions[right] = centerX + half;
      positions[right + 1] = -y * 0.4;
      positions[right + 2] = z;
    }
    attribute.needsUpdate = true;
    geometry.computeBoundingSphere();
  }

  private updateTrailGeometry(length: number, width: number): void {
    if (!this.preset) return;
    const style = this.preset.style;
    const turbulence = style === 'lava' ? 0.42 : 0.22;
    const rise = style === 'water' ? 0.9 : 0.45;
    const wobble = style === 'water' ? 4.5 : 2.6;
    this.writeTrailGeometry(
      this.trailPositions,
      this.trailPositionAttribute,
      this.trailGeometry,
      length,
      width * (style === 'lava' ? 1.25 : 1),
      turbulence,
      rise,
      wobble
    );

    const comet = this.preset.projectile.comet;
    if (!comet) return;
    // A fumaça é mais larga, mais ondulada e sobe atrás da cabeça.
    this.writeTrailGeometry(
      this.smokeTrailPositions,
      this.smokeTrailPositionAttribute,
      this.smokeTrailGeometry,
      length * 1.35,
      comet.smokeWidth,
      0.55,
      0.85,
      3.2
    );
  }

  private emitSecondaryWake(): void {
    if (!this.preset) return;
    const profile = mageQualityProfile(this.quality);
    const comet = this.preset.projectile.comet;
    if (comet) {
      // Brasas do cometa: nascem atrás da cabeça e ficam para trás, formando o
      // pontilhado de fagulhas que segue o rastro na imagem de referência.
      this.secondaryParticles.emit(new THREE.Vector3(0, 0, -this.config!.trailLength * 0.22), {
        color: this.preset.colors.spark,
        count: Math.max(1, Math.round(comet.emberCount * profile.particleMultiplier)),
        speed: 0.55,
        spread: 1.1,
        lifetime: 0.7,
        upwardBias: -0.04,
        sizeScale: comet.emberSize,
      });
      return;
    }
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
    quality: MageVFXQuality,
    lightPool: VFXLightPool
  ) {
    this.pool = new VFXPool(
      () => new MageProjectile(resources, quality, lightPool),
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
