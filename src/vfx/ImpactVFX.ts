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
}

const MAX_DEBRIS = 14;
const TMP_DIR = new THREE.Vector3();

class ImpactEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly flash: THREE.Sprite;
  private readonly burst: THREE.Sprite;
  private readonly core: THREE.Mesh;
  private readonly shockwave: THREE.Mesh;
  private readonly shockwaveMaterial: EnergyShaderMaterial;
  /** Sigilo rúnico do ataque básico: duas camadas concêntricas no chão. */
  private readonly sigilOuter: THREE.Mesh;
  private readonly sigilInner: THREE.Mesh;
  private readonly sigilOuterMaterial: EnergyShaderMaterial;
  private readonly sigilInnerMaterial: EnergyShaderMaterial;
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

    this.sigilOuterMaterial = createMagicCircleMaterial({
      opacity: 0,
      intensity: 1.8,
      thickness: 0.6,
      distortion: 1.2,
      depthTest: true,
    });
    this.sigilInnerMaterial = createMagicCircleMaterial({
      opacity: 0,
      intensity: 1.15,
      thickness: 0.85,
      distortion: 0.8,
      depthTest: true,
    });
    this.sigilOuter = new THREE.Mesh(resources.quad, this.sigilOuterMaterial);
    this.sigilInner = new THREE.Mesh(resources.quad, this.sigilInnerMaterial);
    this.sigilOuter.name = 'MageImpactRuneSigilOuter';
    this.sigilInner.name = 'MageImpactRuneSigilInner';
    for (const sigil of [this.sigilOuter, this.sigilInner]) {
      // Deitado no chão, um dedo acima dele para não brigar com o piso.
      sigil.rotation.x = -Math.PI / 2;
      sigil.position.y = 0.04;
      sigil.visible = false;
      sigil.renderOrder = 4;
      this.group.add(sigil);
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
      count: qualityCount(preset.impact.particleCount, this.quality, preset.qualityParticleMultiplier),
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
    const sigil = preset.impact.runeSigil;
    this.sigilOuter.visible = sigil !== undefined;
    this.sigilInner.visible = sigil !== undefined;
    if (sigil) {
      configureEnergyMaterial(this.sigilOuterMaterial, {
        colorA: 0xffffff,
        colorB: preset.colors.glow,
        opacity: 0.78,
        intensity: sigil.intensity,
        scrollSpeed: 0.9,
        thickness: 0.6,
        distortion: 1.2,
      });
      configureEnergyMaterial(this.sigilInnerMaterial, {
        colorA: preset.colors.secondary,
        colorB: preset.colors.core,
        opacity: 0.6,
        intensity: sigil.intensity * 0.8,
        scrollSpeed: -0.7,
        thickness: 0.85,
        distortion: 0.8,
      });
      this.sigilOuter.rotation.z = Math.random() * Math.PI;
      this.sigilInner.rotation.z = -Math.random() * Math.PI;
    }

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
    const sigil = this.preset.impact.runeSigil;
    if (sigil) {
      // O sigilo abre junto com a onda de choque e gira em sentidos opostos.
      const sigilProgress = Math.min(1, progress * 1.35);
      const sigilFade = 1 - sigilProgress;
      setEnergyTime(this.sigilOuterMaterial, this.age * sigil.spin);
      setEnergyTime(this.sigilInnerMaterial, -this.age * sigil.spin * 0.74);
      this.sigilOuterMaterial.uniforms.uOpacity.value = sigilFade * 0.78;
      this.sigilInnerMaterial.uniforms.uOpacity.value = sigilFade * 0.6;
      const sigilScale = sigil.radius * this.baseScale * (0.35 + sigilProgress * 0.75);
      this.sigilOuter.scale.setScalar(sigilScale);
      this.sigilInner.scale.setScalar(sigilScale * 0.62);
      this.sigilOuter.rotation.z += elapsed * sigil.spin * 0.35;
      this.sigilInner.rotation.z -= elapsed * sigil.spin * 0.26;
      this.sigilOuter.visible = sigilFade > 0.01;
      this.sigilInner.visible = sigilFade > 0.01;
    }
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
    this.sigilOuterMaterial.uniforms.uOpacity.value = 0;
    this.sigilInnerMaterial.uniforms.uOpacity.value = 0;
    this.sigilOuter.visible = false;
    this.sigilInner.visible = false;
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
    this.sigilOuterMaterial.dispose();
    this.sigilInnerMaterial.dispose();
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
