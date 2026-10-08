import * as THREE from 'three';
import { MAGE_VFX_LIMITS, mageQualityProfile } from './VFXConfig';
import type { MageVFXQuality } from './VFXTypes';
import { VFXPool, type PoolableVFX } from './VFXPool';
import { VFXLightPool, type VFXLightHandle } from './VFXLightPool';
import { PooledParticleCloud } from './ParticleManager';
import { createCrackedGroundTexture, createFrozenGroundTexture } from './GroundDecalTextures';

/**
 * Impacto de CHÃO das skills 1 (água) e 2 (gelo) da Maga.
 *
 * - `cracked` (skill 1, água): o chão racha no ponto de impacto — desenho de
 *   fissuras projetado no piso, poeira e torrões levantando. É só imagem: o
 *   cenário, a altura do chão e as colisões não mudam em nada.
 * - `frozen` (skill 2, gelo): uma poça de gelo se forma no ponto de impacto,
 *   com névoa fria — nada de chão quebrado. O gelo refinado da onda
 *   (`IceCrystalWaveVFX`) continua intacto; este decalque só acrescenta o piso
 *   congelado onde o feitiço bateu.
 *
 * O raio do desenho é o MESMO raio de dano da skill (3 m): o que o jogador vê
 * é exatamente a área que leva o dano. O decalque é temporário — aparece no
 * impacto, segura um instante e some — e usa as mesmas regras de desempenho do
 * resto dos efeitos da Maga: pool de objetos, uma luz do pool por impacto e
 * partículas com o multiplicador de qualidade.
 */

export type MageGroundDecalStyle = 'cracked' | 'frozen';

export interface GroundImpactDecalOptions {
  /** Ponto de impacto no nível do chão (o feitiço acerta o corpo; o decalque vai no piso). */
  readonly position: THREE.Vector3;
  /** Raio coberto pelo desenho, em metros (o mesmo raio do dano em área). */
  readonly radius: number;
  readonly style: MageGroundDecalStyle;
  readonly duration?: number;
}

interface GroundDecalStyleDefinition {
  readonly color: number;
  readonly lightColor: number;
  readonly lightIntensity: number;
  readonly duration: number;
  readonly dustColor: number;
  readonly dustCount: number;
  readonly dustSpeed: number;
  readonly dustLifetime: number;
  readonly dustOpacity: number;
  readonly dustSize: readonly [number, number];
  readonly dustUpwardBias: number;
}

const GROUND_DECAL_STYLES: Readonly<Record<MageGroundDecalStyle, GroundDecalStyleDefinition>> = {
  cracked: {
    color: 0x9d8f80,
    lightColor: 0xffe3b8,
    lightIntensity: 1.6,
    duration: 1.45,
    dustColor: 0xd9c8ad,
    dustCount: 34,
    dustSpeed: 0.95,
    dustLifetime: 0.42,
    dustOpacity: 0.42,
    dustSize: [0.7, 2.1],
    dustUpwardBias: 0.5,
  },
  frozen: {
    color: 0xcfeaff,
    lightColor: 0x9fe0ff,
    lightIntensity: 1.9,
    duration: 1.9,
    dustColor: 0xdff4ff,
    dustCount: 40,
    dustSpeed: 0.55,
    dustLifetime: 0.75,
    dustOpacity: 0.38,
    dustSize: [0.8, 2.4],
    dustUpwardBias: 0.3,
  },
};

/** O decalque fica logo acima do piso (o mesmo truque do gelo da onda). */
const DECAL_GROUND_OFFSET = 0.045;

class GroundImpactDecalEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();

  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly dust: PooledParticleCloud;
  private readonly particleMultiplier: number;
  private lightHandle: VFXLightHandle | null = null;
  private style: MageGroundDecalStyle = 'cracked';
  private mappedStyle: MageGroundDecalStyle | null = null;
  private age = 0;
  private duration = GROUND_DECAL_STYLES.cracked.duration;
  private radius = 3;
  private opacity = 1;

  public constructor(
    geometry: THREE.BufferGeometry,
    glowTexture: THREE.Texture,
    private readonly lightPool: VFXLightPool,
    private readonly quality: MageVFXQuality,
    private readonly resolveTexture: (style: MageGroundDecalStyle) => THREE.Texture
  ) {
    this.particleMultiplier = mageQualityProfile(quality).particleMultiplier;
    this.group.name = 'MageGroundImpactDecal';
    this.group.visible = false;
    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      opacity: 0,
      // O decalque fica colado no piso: o offset de polígono evita o serrilhado
      // de z-fighting com o chão da sala.
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'MageGroundImpactDecalSheet';
    this.mesh.renderOrder = 4;
    // O grupo é reposicionado a cada impacto; nada de recorte de frustum com
    // esfera envolvente velha.
    this.mesh.frustumCulled = false;
    this.dust = new PooledParticleCloud(96, glowTexture, { blending: 'normal' });
    this.dust.points.name = 'MageGroundImpactDust';
    this.dust.points.frustumCulled = false;
    this.group.add(this.mesh, this.dust.points);
  }

  public play(options: GroundImpactDecalOptions): void {
    const definition = GROUND_DECAL_STYLES[options.style] ?? GROUND_DECAL_STYLES.cracked;
    this.style = options.style;
    this.age = 0;
    this.duration = Math.max(0.15, options.duration ?? definition.duration);
    this.radius = Math.max(0.2, options.radius);
    this.opacity = 1;
    this.group.visible = true;
    this.group.position.copy(options.position);
    this.group.position.y += DECAL_GROUND_OFFSET;
    this.group.scale.setScalar(1);
    this.mesh.scale.setScalar(this.radius * 2);

    this.material.map = this.resolveTexture(this.style);
    // Trocar de mapa (o pool é compartilhado pelos dois estilos) exige recompilar
    // o material uma vez; os dois programas já ficam prontos no warmUp.
    if (this.mappedStyle !== this.style) {
      this.material.needsUpdate = true;
      this.mappedStyle = this.style;
    }
    this.material.color.set(definition.color);
    this.material.opacity = 0;

    this.dust.reset();
    this.dust.emit(options.position, {
      color: definition.dustColor,
      count: Math.max(6, Math.round(definition.dustCount * this.particleMultiplier)),
      speed: definition.dustSpeed * Math.min(1.6, this.radius / 2),
      spread: Math.min(0.95, this.radius * 0.3),
      lifetime: definition.dustLifetime,
      upwardBias: definition.dustUpwardBias,
      size: definition.dustSize,
      opacity: definition.dustOpacity,
      growth: 0.35,
    });

    this.lightHandle = this.lightPool.acquire();
    const light = this.lightHandle?.light;
    if (light) {
      light.color.set(definition.lightColor);
      light.distance = 3.5 + this.radius;
      light.intensity = definition.lightIntensity;
      light.position.set(options.position.x, options.position.y + 0.8, options.position.z);
    }
  }

  public update(delta: number): boolean {
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
    const definition = GROUND_DECAL_STYLES[this.style];
    // Entra rápido (impacto), segura e desaparece: é efeito temporário.
    const intro = THREE.MathUtils.smoothstep(progress, 0, 0.08);
    const fade = 1 - THREE.MathUtils.smoothstep(progress, 0.55, 1);
    this.opacity = intro * fade;
    this.material.opacity = this.opacity;
    // O desenho abre do ponto de impacto, como o resto dos impactos da Maga.
    const grow = 0.72 + 0.28 * THREE.MathUtils.smoothstep(progress, 0, 0.22);
    this.mesh.scale.setScalar(this.radius * 2 * grow);
    this.dust.update(elapsed);
    if (this.lightHandle) {
      this.lightHandle.light.intensity = definition.lightIntensity * this.opacity;
    }
    return this.age < this.duration;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.material.opacity = 0;
    this.dust.reset();
    this.lightHandle?.release();
    this.lightHandle = null;
  }

  public dispose(): void {
    this.material.dispose();
    this.dust.dispose();
    this.lightHandle?.release();
    this.lightHandle = null;
  }
}

export class GroundImpactDecalVFX {
  private readonly geometry: THREE.PlaneGeometry;
  private readonly textures = new Map<MageGroundDecalStyle, THREE.DataTexture>();
  private readonly pool: VFXPool<GroundImpactDecalEffect>;
  private readonly active: GroundImpactDecalEffect[] = [];

  public constructor(
    private readonly scene: THREE.Scene,
    glowTexture: THREE.Texture,
    private readonly lightPool: VFXLightPool,
    quality: MageVFXQuality
  ) {
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.geometry.rotateX(-Math.PI / 2);
    this.pool = new VFXPool(
      () => new GroundImpactDecalEffect(
        this.geometry,
        glowTexture,
        this.lightPool,
        quality,
        (style) => this.ensureTexture(style)
      ),
      MAGE_VFX_LIMITS.maxGroundDecals
    );
  }

  public play(options: GroundImpactDecalOptions): void {
    const decal = this.pool.acquire();
    if (!decal) return;
    decal.play(options);
    this.scene.add(decal.group);
    this.active.push(decal);
  }

  public update(delta: number): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const decal = this.active[index];
      if (decal.update(delta)) continue;
      this.pool.release(decal);
      this.active.splice(index, 1);
    }
  }

  public clear(): void {
    for (const decal of this.active) this.pool.release(decal);
    this.active.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.pool.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.geometry.dispose();
  }

  /**
   * Gera (uma vez por estilo) o desenho do decalque em 512² já preparado para a
   * GPU. O custo é pago no primeiro uso — que é o `warmUp` da Maga, durante o
   * carregamento.
   */
  public ensureTexture(style: MageGroundDecalStyle): THREE.DataTexture {
    const existing = this.textures.get(style);
    if (existing) return existing;
    const texture = style === 'frozen'
      ? createFrozenGroundTexture(512)
      : createCrackedGroundTexture(512);
    texture.colorSpace = THREE.SRGBColorSpace;
    // O decalque é um plano grande visto de cima e de raspão: mipmap + filtro
    // trilinear seguram a cintilação do desenho em perspectiva (as texturas de
    // sprite, pequenas, continuam sem mipmap).
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 4;
    texture.name = style === 'frozen' ? 'MageGroundDecalFrozen' : 'MageGroundDecalCracked';
    this.textures.set(style, texture);
    return texture;
  }

  public get activeCount(): number {
    return this.active.length;
  }

  public get pooledCount(): number {
    return this.pool.inactiveCount;
  }
}
