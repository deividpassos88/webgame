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
const TMP_PUFF_COLOR = new THREE.Color();
const TMP_PUFF_COLOR_2 = new THREE.Color();
/** Where the glow light sat relative to the projectile when it was a child. */
const LIGHT_LOCAL_OFFSET = new THREE.Vector3(0, 0.1, 0);
const TRAIL_SEGMENTS = 14;
/** Lufadas de chama que formam a cauda (a fita fina é só o núcleo quente). */
const MAX_FLAME_PUFFS = 18;
/** Nuvens de fumaça escura que sobram no fim da cauda. */
const MAX_SMOKE_PUFFS = 10;

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
  /** Cauda de fogo: lufadas alongadas + fumaça escura no fim do rastro. */
  private readonly flamePuffs: THREE.Sprite[] = [];
  private readonly flamePuffAges = new Float32Array(MAX_FLAME_PUFFS);
  private readonly flamePuffLives = new Float32Array(MAX_FLAME_PUFFS);
  private readonly flamePuffScales = new Float32Array(MAX_FLAME_PUFFS);
  private readonly flamePuffRises = new Float32Array(MAX_FLAME_PUFFS);
  private readonly smokePuffs: THREE.Sprite[] = [];
  private readonly smokePuffAges = new Float32Array(MAX_SMOKE_PUFFS);
  private readonly smokePuffLives = new Float32Array(MAX_SMOKE_PUFFS);
  private readonly smokePuffScales = new Float32Array(MAX_SMOKE_PUFFS);
  private puffCursor = 0;
  private smokeCursor = 0;
  private puffTimer = 0;
  private smokeTimer = 0;
  private readonly secondaryParticles: PooledParticleCloud;
  private lightHandle: VFXLightHandle | null = null;
  private readonly trailMaterial: EnergyShaderMaterial;
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

    // Cauda de FOGO: lufadas de chama (aditivas) formando a pluma e nuvens de
    // fumaça escura (blend normal) se dissolvendo no fim do rastro.
    for (let index = 0; index < MAX_FLAME_PUFFS; index += 1) {
      const material = new THREE.SpriteMaterial({
        map: resources.flame,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.name = 'MageProjectileFlamePuff';
      sprite.visible = false;
      sprite.renderOrder = 2;
      this.flamePuffs.push(sprite);
      this.group.add(sprite);
    }
    for (let index = 0; index < MAX_SMOKE_PUFFS; index += 1) {
      const material = new THREE.SpriteMaterial({
        map: resources.smoke,
        color: 0x3a2620,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        // Blend normal: fumaça de verdade escurece o que está atrás, em vez de
        // virar mais uma luz vermelha no rastro.
        blending: THREE.NormalBlending,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.name = 'MageProjectileSmokePuff';
      sprite.visible = false;
      sprite.renderOrder = 1;
      this.smokePuffs.push(sprite);
      this.group.add(sprite);
    }

    this.secondaryParticles = new PooledParticleCloud(38, resources.softGlow);
    this.group.add(
      this.trail,
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
    // A cauda de fogo nasce junto com o disparo: cada lufada é posicionada na
    // cabeça e depois fica para trás sozinha (o grupo anda para a frente).
    this.puffCursor = 0;
    this.smokeCursor = 0;
    this.puffTimer = 0;
    this.smokeTimer = 0;
    for (let index = 0; index < this.flamePuffs.length; index += 1) {
      this.flamePuffs[index].visible = false;
      (this.flamePuffs[index].material as THREE.SpriteMaterial).opacity = 0;
    }
    for (let index = 0; index < this.smokePuffs.length; index += 1) {
      this.smokePuffs[index].visible = false;
      (this.smokePuffs[index].material as THREE.SpriteMaterial).opacity = 0;
    }
    if (comet) {
      // Pré-aquece a cauda com algumas lufadas já atrás da cabeça, para o
      // disparo não começar "careca".
      for (let index = 0; index < 5; index += 1) {
        this.spawnFlamePuff(comet, index * 0.16);
      }
    }
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
    if (this.preset.projectile.comet) this.updateFireTail(elapsed);
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
    for (const sprite of this.flamePuffs) {
      sprite.visible = false;
      (sprite.material as THREE.SpriteMaterial).opacity = 0;
    }
    for (const sprite of this.smokePuffs) {
      sprite.visible = false;
      (sprite.material as THREE.SpriteMaterial).opacity = 0;
    }
    this.puffTimer = 0;
    this.smokeTimer = 0;
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
    for (const sprite of this.flamePuffs) (sprite.material as THREE.Material).dispose();
    for (const sprite of this.smokePuffs) (sprite.material as THREE.Material).dispose();
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
   * Coloca uma lufada de chama na cabeça do cometa. Ela não é "presa" à
   * cabeça: o grupo continua voando e a lufada, parada no espaço local, fica
   * para trás sozinha — é assim que a cauda se forma, sem nenhuma fita.
   */
  private spawnFlamePuff(
    comet: NonNullable<MageProjectileConfig['comet']>,
    backOffset: number
  ): void {
    if (!this.preset || !this.config) return;
    const index = this.puffCursor;
    this.puffCursor = (this.puffCursor + 1) % MAX_FLAME_PUFFS;
    const sprite = this.flamePuffs[index];
    const radius = this.config.radius;
    sprite.visible = true;
    sprite.position.set(
      (Math.random() - 0.5) * radius * 0.5,
      (Math.random() - 0.5) * radius * 0.35,
      -backOffset
    );
    this.flamePuffAges[index] = 0;
    this.flamePuffLives[index] = 0.26 + Math.random() * 0.2;
    this.flamePuffScales[index] = radius * (0.8 + Math.random() * 0.45) * comet.headStretch * 0.6;
    this.flamePuffRises[index] = 0.1 + Math.random() * 0.22;
    const material = sprite.material as THREE.SpriteMaterial;
    material.color.set(this.preset.colors.core);
    material.opacity = 0.9;
  }

  private spawnSmokePuff(backOffset: number): void {
    const index = this.smokeCursor;
    this.smokeCursor = (this.smokeCursor + 1) % MAX_SMOKE_PUFFS;
    const sprite = this.smokePuffs[index];
    const radius = this.config ? this.config.radius : 0.5;
    const base = sprite.material as THREE.SpriteMaterial;
    sprite.visible = true;
    sprite.position.set(
      (Math.random() - 0.5) * radius * 0.55,
      0.04 + Math.random() * radius * 0.3,
      -backOffset
    );
    this.smokePuffAges[index] = 0;
    this.smokePuffLives[index] = 0.6 + Math.random() * 0.35;
    this.smokePuffScales[index] = radius * (1.1 + Math.random() * 0.6);
    base.opacity = 0.34;
  }

  /**
   * Cauda de fogo: lufadas quentes perto da cabeça que vão ficando para trás,
   * esfriam (branco -> laranja -> vermelho), crescem e somem; junto delas,
   * nuvens de fumaça escura se dissolvendo. Nada de fita luminosa.
   */
  private updateFireTail(elapsed: number): void {
    if (!this.preset || !this.config) return;
    const comet = this.preset.projectile.comet;
    if (!comet) return;
    const colors = this.preset.colors;
    const speed = this.config.speed;

    this.puffTimer += elapsed;
    while (this.puffTimer >= 0.02) {
      this.puffTimer -= 0.02;
      this.spawnFlamePuff(comet, 0);
    }
    this.smokeTimer += elapsed;
    while (this.smokeTimer >= 0.075) {
      this.smokeTimer -= 0.075;
      this.spawnSmokePuff(this.config.radius * 0.6);
    }

    for (let index = 0; index < this.flamePuffs.length; index += 1) {
      const sprite = this.flamePuffs[index];
      if (!sprite.visible) continue;
      this.flamePuffAges[index] += elapsed;
      const age = this.flamePuffAges[index];
      const life = this.flamePuffLives[index];
      if (age >= life) {
        sprite.visible = false;
        (sprite.material as THREE.SpriteMaterial).opacity = 0;
        continue;
      }
      const t = age / life;
      // O grupo anda para a frente, então a lufada "fica para trás" sozinha.
      sprite.position.z -= speed * elapsed;
      sprite.position.y += this.flamePuffRises[index] * elapsed;
      const size = this.flamePuffScales[index] * (0.85 + t * 1.5);
      sprite.scale.set(size, size * 0.92, 1);
      const material = sprite.material as THREE.SpriteMaterial;
      // Quente na cabeça, frio no fim, dissolvendo até sumir.
      material.color.copy(
        TMP_PUFF_COLOR.set(colors.core).lerp(TMP_PUFF_COLOR_2.set(colors.glow), Math.min(1, t * 2.1))
      );
      if (t > 0.5) {
        material.color.lerp(TMP_PUFF_COLOR.set(colors.secondary), (t - 0.5) * 2 * 0.85);
      }
      const fade = 1 - t;
      material.opacity = fade * fade * 0.9;
    }

    for (let index = 0; index < this.smokePuffs.length; index += 1) {
      const sprite = this.smokePuffs[index];
      if (!sprite.visible) continue;
      this.smokePuffAges[index] += elapsed;
      const age = this.smokePuffAges[index];
      const life = this.smokePuffLives[index];
      if (age >= life) {
        sprite.visible = false;
        (sprite.material as THREE.SpriteMaterial).opacity = 0;
        continue;
      }
      const t = age / life;
      sprite.position.z -= speed * elapsed * 0.92;
      sprite.position.y += 0.35 * elapsed;
      const size = this.smokePuffScales[index] * (1 + t * 1.7);
      sprite.scale.set(size, size, 1);
      const material = sprite.material as THREE.SpriteMaterial;
      material.opacity = 0.34 * (1 - t) * (1 - t);
    }
  }

  /**
   * Escreve uma fita de rastro (só o núcleo quente, curto) no buffer informado.
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
