import * as THREE from 'three';
import { MAGE_VFX_LIMITS, mageQualityProfile } from './VFXConfig';
import { MageVFXResources } from './MageVFXResources';
import { PooledParticleCloud, qualityCount } from './ParticleManager';
import { VFXPool, type PoolableVFX } from './VFXPool';
import {
  configureEnergyMaterial,
  createMagicCircleMaterial,
  setEnergyTime,
  type EnergyShaderMaterial,
} from './VFXMaterials';
import { VFXLightPool, type VFXLightHandle } from './VFXLightPool';
import type { MageImpactConfig, MageSpellPreset, MageVFXQuality } from './VFXTypes';

interface ImpactPlayOptions {
  readonly position: THREE.Vector3;
  readonly preset: MageSpellPreset;
  readonly scale?: number;
  readonly lightIntensity?: number;
  /**
   * Sobrescreve a quantidade de partículas do preset. Usado pelo clarão de
   * disparo, que precisa de um estouro pequeno mesmo herdando o preset de um
   * impacto grande.
   */
  readonly particleCount?: number;
  /**
   * Clarão curto na mão do conjurador no disparo. Ele usa o mesmo preset do
   * impacto, então as camadas "de assinatura" (pilar, estilhaços, jatos)
   * ficam desligadas: o disparo é só o acender do feitiço na mão.
   */
  readonly muzzleFlash?: boolean;
}

const MAX_DEBRIS = 14;
const MAX_SPIKES = 9;
/** Jatos de plasma do impacto (riscos alongados que rasgam para fora). */
const MAX_JETS = 8;
/** Fração da duração em que a segunda onda de choque entra. */
const SECOND_WAVE_DELAY = 0.18;
const TMP_DIR = new THREE.Vector3();

class ImpactEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly flash: THREE.Sprite;
  private readonly burst: THREE.Sprite;
  private readonly core: THREE.Mesh;
  private readonly shockwave: THREE.Mesh;
  private readonly shockwaveMaterial: EnergyShaderMaterial;
  /** Segunda onda de choque, atrasada: dá o "trovão" duplo do impacto. */
  private readonly shockwaveTwo: THREE.Mesh;
  private readonly shockwaveTwoMaterial: EnergyShaderMaterial;
  /** Coluna de luz vertical do impacto. */
  private readonly pillar: THREE.Mesh;
  private readonly pillarMaterial: THREE.MeshBasicMaterial;
  /** Estilhaços rúnicos em estrela. */
  private readonly spikes: THREE.Mesh[] = [];
  private readonly spikeVelocities: THREE.Vector3[] = [];
  /** Jatos de plasma: sprites alongados que dão a leitura elétrica. */
  private readonly jets: THREE.Sprite[] = [];
  private readonly jetMaterials: THREE.SpriteMaterial[] = [];
  private readonly jetDirections: THREE.Vector3[] = [];
  private readonly jetLengths: number[] = [];
  private jetCount = 0;
  private muzzleFlash = false;
  private readonly particles: PooledParticleCloud;
  private readonly smoke: PooledParticleCloud;
  private readonly debris: THREE.Mesh[] = [];
  private readonly debrisVelocities: THREE.Vector3[] = [];
  private lightHandle: VFXLightHandle | null = null;
  private age = 0;
  private duration = 0.5;
  private config: MageImpactConfig | null = null;
  private preset: MageSpellPreset | null = null;
  private baseScale = 1;

  public constructor(
    private readonly resources: MageVFXResources,
    private readonly quality: MageVFXQuality,
    private readonly lightPool: VFXLightPool
  ) {
    this.group.name = 'MageImpactVFX';
    this.group.visible = false;

    this.core = new THREE.Mesh(
      resources.sphere,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
    );
    this.core.name = 'MageImpactCore';

    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: resources.impactFlare,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.flash.name = 'MageImpactFlash';

    this.burst = new THREE.Sprite(new THREE.SpriteMaterial({
      map: resources.impactFlare,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.burst.name = 'MageImpactExplosionTexture';

    this.shockwaveMaterial = createMagicCircleMaterial({
      opacity: 0,
      intensity: 1.35,
      thickness: 0.72,
      distortion: 1.1,
      depthTest: true,
    });
    this.shockwave = new THREE.Mesh(resources.quad, this.shockwaveMaterial);
    this.shockwave.name = 'MageImpactShaderShockwave';
    this.shockwave.rotation.x = -Math.PI / 2;
    this.shockwave.renderOrder = 3;

    this.shockwaveTwoMaterial = createMagicCircleMaterial({
      opacity: 0,
      intensity: 1.1,
      thickness: 1.2,
      distortion: 0.9,
      depthTest: true,
    });
    this.shockwaveTwo = new THREE.Mesh(resources.quad, this.shockwaveTwoMaterial);
    this.shockwaveTwo.name = 'MageImpactSecondShockwave';
    this.shockwaveTwo.rotation.x = -Math.PI / 2;
    this.shockwaveTwo.position.y = 0.03;
    this.shockwaveTwo.renderOrder = 3;
    this.shockwaveTwo.visible = false;

    this.pillarMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.pillar = new THREE.Mesh(resources.beamCylinder, this.pillarMaterial);
    this.pillar.name = 'MageImpactLightPillar';
    this.pillar.visible = false;
    this.pillar.renderOrder = 2;

    for (let index = 0; index < MAX_SPIKES; index += 1) {
      const mesh = new THREE.Mesh(resources.coneShard, new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      mesh.name = 'MageImpactRuneSpike';
      mesh.visible = false;
      this.spikes.push(mesh);
      this.spikeVelocities.push(new THREE.Vector3());
      this.group.add(mesh);
    }

    this.group.add(this.shockwaveTwo, this.pillar);

    for (let index = 0; index < MAX_JETS; index += 1) {
      // Um material por jato: cada risco precisa do próprio ângulo (o sprite é
      // um retângulo girado na tela, então `material.rotation` é por material).
      const material = new THREE.SpriteMaterial({
        map: resources.impactFlare,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.name = 'MageImpactFlameJet';
      sprite.visible = false;
      sprite.renderOrder = 6;
      this.jets.push(sprite);
      this.jetMaterials.push(material);
      this.jetDirections.push(new THREE.Vector3(1, 0, 0));
      this.jetLengths.push(1);
      this.group.add(sprite);
    }

    this.particles = new PooledParticleCloud(64, resources.softGlow);
    this.smoke = new PooledParticleCloud(34, resources.smoke);
    for (let index = 0; index < MAX_DEBRIS; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(index % 2 === 0 ? resources.iceShard : resources.ember, material);
      mesh.name = 'MageImpactDebris';
      mesh.visible = false;
      this.debris.push(mesh);
      this.debrisVelocities.push(new THREE.Vector3());
      this.group.add(mesh);
    }
    this.group.add(this.core, this.burst, this.flash, this.shockwave, this.particles.points, this.smoke.points);
  }

  public play(options: ImpactPlayOptions): void {
    const { preset, position } = options;
    this.preset = preset;
    this.config = preset.impact;
    this.duration = preset.impact.duration;
    this.baseScale = options.scale ?? 1;
    this.age = 0;
    this.group.visible = true;
    this.group.position.copy(position);
    this.group.scale.setScalar(1);

    const coreMaterial = this.core.material as THREE.MeshBasicMaterial;
    coreMaterial.color.set(preset.colors.core);
    coreMaterial.opacity = 0.95;
    this.core.scale.setScalar(preset.impact.radius * this.baseScale);

    const impactTexture = this.resources.mageTexture(preset.style, 'impact');
    const flashMaterial = this.flash.material as THREE.SpriteMaterial;
    flashMaterial.map = impactTexture;
    flashMaterial.color.set(preset.colors.glow);
    flashMaterial.opacity = preset.style === 'lava' ? 1 : 0.92;
    this.flash.scale.setScalar(preset.impact.radius * (preset.style === 'laser' ? 3.2 : preset.style === 'lava' ? 3 : 2.45) * this.baseScale);

    const burstMaterial = this.burst.material as THREE.SpriteMaterial;
    burstMaterial.map = impactTexture;
    burstMaterial.color.set(preset.style === 'lava' ? preset.colors.core : preset.colors.secondary);
    burstMaterial.opacity = preset.style === 'water' ? 0.55 : preset.style === 'ice' ? 0.72 : 0.82;
    this.burst.scale.setScalar(preset.impact.radius * (preset.style === 'lava' ? 4.4 : preset.style === 'laser' ? 4.1 : 3.3) * this.baseScale);

    configureEnergyMaterial(this.shockwaveMaterial, {
      colorA: preset.colors.core,
      colorB: preset.colors.secondary,
      opacity: preset.style === 'water' ? 0.5 : 0.68,
      intensity: preset.style === 'lava' ? 1.75 : preset.style === 'lightning' ? 1.95 : 1.45,
      thickness: preset.style === 'lava' ? 1.05 : 0.78,
      distortion: preset.style === 'lava' ? 1.35 : preset.style === 'water' ? 1.1 : 0.95,
      scrollSpeed: preset.style === 'lightning' ? 2.2 : 1.15,
    });
    this.shockwave.position.y = 0.025;
    this.shockwave.scale.setScalar(0.25 * this.baseScale);

    // The flash light is borrowed from the shared pool: the scene light count
    // never changes, so the impact can never trigger a shader recompile.
    // (Map swaps above need no needsUpdate: both sprites are constructed with
    // a map, so texture-to-texture swaps keep the same compiled program.)
    const targetIntensity = options.lightIntensity ?? preset.impact.lightIntensity;
    this.lightHandle = mageQualityProfile(this.quality).enableSecondaryLights && targetIntensity > 0
      ? this.lightPool.acquire()
      : null;
    if (this.lightHandle) {
      this.lightHandle.light.color.set(preset.colors.glow);
      this.lightHandle.light.intensity = targetIntensity;
      this.lightHandle.light.distance = (preset.style === 'lava' ? 5.8 : 4.5) * this.baseScale;
      this.lightHandle.light.position.copy(this.group.position);
    }

    this.particles.setTexture(this.resources.mageTexture(preset.style, 'impact'));
    this.smoke.setTexture(preset.style === 'lava' ? this.resources.flame : this.resources.mageTexture(preset.style, 'impact'));
    this.particles.emit(new THREE.Vector3(), {
      color: preset.colors.spark,
      count: options.particleCount ?? qualityCount(preset.impact.particleCount, this.quality, preset.qualityParticleMultiplier),
      speed: (preset.style === 'lava' ? 3.6 : preset.style === 'water' ? 2.4 : 2.8) * this.baseScale,
      spread: preset.style === 'water' ? 1.55 : 1.25,
      lifetime: this.duration,
      upwardBias: preset.style === 'water' ? 0.55 : 0.32,
    });
    if (preset.style === 'lava' || preset.style === 'water' || preset.style === 'ice') {
      const profile = mageQualityProfile(this.quality);
      this.smoke.emit(new THREE.Vector3(), {
        color: preset.colors.smoke ?? preset.colors.secondary,
        count: Math.round((preset.style === 'lava' ? 24 : 16) * profile.smokeMultiplier),
        speed: preset.style === 'lava' ? 1.2 : 0.9,
        spread: 1,
        lifetime: this.duration * 1.15,
        upwardBias: preset.style === 'lava' ? 0.65 : 0.35,
      });
    } else {
      this.smoke.reset();
    }
    this.muzzleFlash = options.muzzleFlash === true;
    this.configureJets(preset, this.muzzleFlash);
    // Coluna de luz: a leitura mais forte do impacto, visível de longe.
    const pillar = this.muzzleFlash ? undefined : preset.impact.pillar;
    this.pillar.visible = pillar !== undefined;
    if (pillar) {
      this.pillarMaterial.color.set(preset.colors.core);
      this.pillarMaterial.opacity = 0;
      this.pillar.scale.set(
        pillar.radius * this.baseScale,
        pillar.height * this.baseScale * 0.25,
        pillar.radius * this.baseScale
      );
      // Nasce na altura do impacto e desce até o chão, como um clarão que
      // atravessa o monstro.
      this.pillar.position.set(0, -options.position.y + pillar.height * this.baseScale * 0.5, 0);
    }

    const spikes = this.muzzleFlash ? undefined : preset.impact.spikes;
    for (let index = 0; index < this.spikes.length; index += 1) {
      const mesh = this.spikes[index];
      if (!spikes || index >= spikes.count) {
        mesh.visible = false;
        continue;
      }
      const angle = (index / Math.max(1, spikes.count)) * Math.PI * 2 + Math.random() * 0.35;
      const length = spikes.length * this.baseScale * (0.75 + Math.random() * 0.5);
      mesh.visible = true;
      mesh.position.set(0, 0, 0);
      // Deitados no plano do chão, apontando para fora em estrela.
      mesh.rotation.set(Math.PI / 2, 0, -angle);
      mesh.scale.set(length * 0.5, length, length * 0.5);
      (mesh.material as THREE.MeshBasicMaterial).color.set(preset.colors.spark);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
      this.spikeVelocities[index]
        .set(Math.cos(angle), 0.12 + Math.random() * 0.2, Math.sin(angle))
        .multiplyScalar(2.4 + Math.random() * 1.4);
    }

    // Segunda onda de choque (só na versão completa do impacto).
    this.shockwaveTwo.visible = !this.muzzleFlash;
    this.shockwaveTwoMaterial.uniforms.uOpacity.value = 0;

    this.spawnDebris(preset);
  }

  public update(delta: number): boolean {
    if (!this.active || !this.config || !this.preset) return false;
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
    const fade = 1 - progress;

    (this.core.material as THREE.MeshBasicMaterial).opacity = fade * 0.95;
    (this.flash.material as THREE.SpriteMaterial).opacity = fade * (this.preset.style === 'lava' ? 1 : 0.92);
    (this.burst.material as THREE.SpriteMaterial).opacity = fade * (this.preset.style === 'water' ? 0.55 : this.preset.style === 'ice' ? 0.72 : 0.82);
    setEnergyTime(this.shockwaveMaterial, this.age * 1.35);
    this.shockwaveMaterial.uniforms.uOpacity.value = fade * (this.preset.style === 'water' ? 0.5 : 0.68);
    this.core.scale.setScalar(this.config.radius * this.baseScale * (1 + progress * (this.preset.style === 'lava' ? 1.7 : 1.3)));
    this.flash.scale.setScalar(this.config.radius * this.baseScale * (2.45 + progress * (this.preset.style === 'laser' ? 2.6 : 1.8)));
    this.burst.scale.setScalar(this.config.radius * this.baseScale * ((this.preset.style === 'lava' ? 4.4 : 3.3) + progress * 2.2));
    this.burst.material.rotation = progress * Math.PI * (this.preset.style === 'lightning' ? 2.5 : 0.7);
    this.shockwave.scale.setScalar(this.config.shockwaveRadius * this.baseScale * (0.25 + progress * 0.85));
    const secondWave = Math.max(0, progress - SECOND_WAVE_DELAY) / (1 - SECOND_WAVE_DELAY);
    if (this.shockwaveTwo.visible && secondWave > 0) {
      const secondFade = 1 - secondWave;
      setEnergyTime(this.shockwaveTwoMaterial, -this.age * 1.1);
      this.shockwaveTwoMaterial.uniforms.uOpacity.value = secondFade * 0.55;
      this.shockwaveTwo.scale.setScalar(
        this.config.shockwaveRadius * this.baseScale * (0.3 + secondWave * 1.25)
      );
      this.shockwaveTwo.visible = secondFade > 0.02;
    }

    if (this.pillar.visible) {
      const spikeProgress = Math.min(1, progress * 1.7);
      const spikeFade = 1 - spikeProgress;
      this.pillarMaterial.opacity = spikeFade * 0.85;
      const height = (this.preset.impact.pillar?.height ?? 1) * this.baseScale;
      const radiusGrow = 0.35 + spikeProgress * 0.9;
      this.pillar.scale.set(
        (this.preset.impact.pillar?.radius ?? 0.4) * this.baseScale * radiusGrow,
        height * (0.35 + spikeProgress * 0.75),
        (this.preset.impact.pillar?.radius ?? 0.4) * this.baseScale * radiusGrow
      );
      this.pillar.visible = spikeFade > 0.02;
    }

    for (let index = 0; index < this.spikes.length; index += 1) {
      const mesh = this.spikes[index];
      if (!mesh.visible) continue;
      const velocity = this.spikeVelocities[index];
      mesh.position.addScaledVector(velocity, elapsed);
      velocity.multiplyScalar(0.9);
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, material.opacity - elapsed * 2.6);
      if (material.opacity <= 0.03) mesh.visible = false;
    }

    if (this.jetCount > 0) this.updateJets();

    if (this.lightHandle) this.lightHandle.light.intensity *= Math.max(0, 1 - elapsed * 8);
    this.particles.update(elapsed);
    this.smoke.update(elapsed);
    this.updateDebris(elapsed, fade);
    return this.age < this.duration;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.config = null;
    this.preset = null;
    this.lightHandle?.release();
    this.lightHandle = null;
    this.particles.reset();
    this.smoke.reset();
    (this.core.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.flash.material as THREE.SpriteMaterial).opacity = 0;
    (this.burst.material as THREE.SpriteMaterial).opacity = 0;
    this.shockwaveMaterial.uniforms.uOpacity.value = 0;
    this.shockwaveTwo.visible = false;
    this.shockwaveTwoMaterial.uniforms.uOpacity.value = 0;
    this.pillar.visible = false;
    this.pillarMaterial.opacity = 0;
    for (const mesh of this.spikes) {
      mesh.visible = false;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    this.muzzleFlash = false;
    this.jetCount = 0;
    for (let index = 0; index < this.jets.length; index += 1) {
      this.jets[index].visible = false;
      this.jetMaterials[index].opacity = 0;
    }
    for (const mesh of this.debris) {
      mesh.visible = false;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
    }
  }

  public dispose(): void {
    (this.core.material as THREE.Material).dispose();
    (this.flash.material as THREE.Material).dispose();
    (this.burst.material as THREE.Material).dispose();
    this.shockwaveMaterial.dispose();
    for (const material of this.jetMaterials) material.dispose();
    this.shockwaveTwoMaterial.dispose();
    this.pillarMaterial.dispose();
    for (const mesh of this.spikes) (mesh.material as THREE.Material).dispose();
    for (const mesh of this.debris) (mesh.material as THREE.Material).dispose();
    this.particles.dispose();
    this.smoke.dispose();
  }

  private spawnDebris(preset: MageSpellPreset): void {
    const profile = mageQualityProfile(this.quality);
    const count = Math.min(
      this.debris.length,
      Math.round(preset.impact.debrisCount * profile.iceShardMultiplier)
    );
    for (let index = 0; index < this.debris.length; index += 1) {
      const mesh = this.debris[index];
      if (index >= count) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      mesh.scale.setScalar((preset.style === 'lava' ? 0.8 : 1) * this.baseScale * (0.55 + Math.random() * 0.8));
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.color.set(preset.style === 'lava' ? preset.colors.spark : preset.colors.core);
      material.opacity = 0.9;
      TMP_DIR.set(Math.random() - 0.5, 0.35 + Math.random() * 0.75, Math.random() - 0.5).normalize();
      this.debrisVelocities[index].copy(TMP_DIR).multiplyScalar((preset.style === 'lava' ? 2.3 : 2.0) * (0.5 + Math.random() * 0.7));
    }
  }

  /**
   * Distribui os jatos de plasma em estrela. O sprite é um retângulo girado na
   * tela, então o ângulo do mundo (plano XZ) é convertido para o ângulo de
   * tela: para a câmera do jogo, +X da tela é +X do mundo e +Y da tela é -Z.
   */
  private configureJets(preset: MageSpellPreset, muzzleFlash: boolean): void {
    const jets = muzzleFlash ? undefined : preset.impact.jets;
    const count = Math.min(MAX_JETS, jets?.count ?? 0);
    this.jetCount = count;
    for (let index = 0; index < MAX_JETS; index += 1) {
      const sprite = this.jets[index];
      const material = this.jetMaterials[index];
      const active = index < count;
      sprite.visible = active;
      if (!active) continue;
      const angle = (index / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const length = (jets?.length ?? 1) * this.baseScale * (0.75 + Math.random() * 0.55);
      this.jetLengths[index] = length;
      this.jetDirections[index].set(Math.cos(angle), 0.1 + Math.random() * 0.18, Math.sin(angle)).normalize();
      material.color.set(preset.colors.glow);
      material.opacity = 0.95;
      material.rotation = Math.atan2(-Math.sin(angle), Math.cos(angle)) - Math.PI / 2;
      sprite.position.set(Math.cos(angle) * 0.1 * this.baseScale, 0, Math.sin(angle) * 0.1 * this.baseScale);
      sprite.scale.set(0.06 * this.baseScale, length * 0.3);
    }
  }

  private updateJets(): void {
    for (let index = 0; index < this.jets.length; index += 1) {
      const sprite = this.jets[index];
      if (!sprite.visible) continue;
      const length = this.jetLengths[index];
      // Os jatos são a parte mais rápida do impacto: somem em ~60% do tempo.
      const progress = THREE.MathUtils.clamp(this.age / Math.max(0.001, this.duration * 0.6), 0, 1);
      const travel = length * (0.1 + progress * 0.95);
      const direction = this.jetDirections[index];
      sprite.position.set(
        direction.x * travel,
        direction.y * travel * 0.35,
        direction.z * travel
      );
      sprite.scale.set((0.05 + progress * 0.05) * this.baseScale, length * (0.3 + progress * 0.75));
      const fade = 1 - progress;
      this.jetMaterials[index].opacity = fade * fade * 0.95;
      if (fade <= 0.02) sprite.visible = false;
    }
  }

  private updateDebris(delta: number, fade: number): void {
    for (let index = 0; index < this.debris.length; index += 1) {
      const mesh = this.debris[index];
      if (!mesh.visible) continue;
      const velocity = this.debrisVelocities[index];
      mesh.position.addScaledVector(velocity, delta);
      velocity.y -= 1.8 * delta;
      mesh.rotation.x += delta * 4;
      mesh.rotation.y += delta * 3.3;
      (mesh.material as THREE.MeshBasicMaterial).opacity = fade * 0.9;
      if (fade <= 0.02) mesh.visible = false;
    }
  }
}

export class ImpactVFX {
  private readonly pool: VFXPool<ImpactEffect>;
  private readonly active: ImpactEffect[] = [];

  public constructor(
    private readonly scene: THREE.Scene,
    resources: MageVFXResources,
    quality: MageVFXQuality,
    lightPool: VFXLightPool
  ) {
    this.pool = new VFXPool(
      () => new ImpactEffect(resources, quality, lightPool),
      MAGE_VFX_LIMITS.maxImpacts
    );
  }

  public play(options: ImpactPlayOptions): void {
    const effect = this.pool.acquire();
    if (!effect) return;
    // No per-impact light gate here: the shared VFXLightPool already degrades
    // gracefully (renders unlit) when every slot is busy.
    effect.play(options);
    this.scene.add(effect.group);
    this.active.push(effect);
  }

  public update(delta: number): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const effect = this.active[index];
      if (effect.update(delta)) continue;
      this.pool.release(effect);
      this.active.splice(index, 1);
    }
  }

  public clear(): void {
    for (const effect of this.active) this.pool.release(effect);
    this.active.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.pool.dispose();
  }

  public get activeCount(): number { return this.active.length; }
  public get pooledCount(): number { return this.pool.inactiveCount; }
}
