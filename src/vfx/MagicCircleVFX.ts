import * as THREE from 'three';
import { MAGE_VFX_LIMITS } from './VFXConfig';
import { MageVFXResources } from './MageVFXResources';
import { PooledParticleCloud } from './ParticleManager';
import { VFXPool, type PoolableVFX } from './VFXPool';
import {
  configureEnergyMaterial,
  createMagicCircleMaterial,
  setEnergyTime,
  type EnergyShaderMaterial,
} from './VFXMaterials';

interface MagicCircleOptions {
  readonly parent?: THREE.Object3D | null;
  readonly position: THREE.Vector3;
  readonly color: THREE.ColorRepresentation;
  readonly radius: number;
  readonly duration: number;
  readonly followParent?: boolean;
  readonly groundAligned?: boolean;
}

const TMP_COLOR = new THREE.Color();

class MagicCircleEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly base: THREE.Mesh;
  private readonly counter: THREE.Mesh;
  private readonly runes: THREE.Mesh;
  private readonly baseMaterial: EnergyShaderMaterial;
  private readonly counterMaterial: EnergyShaderMaterial;
  private readonly runeMaterial: EnergyShaderMaterial;
  private readonly particles: PooledParticleCloud;
  private age = 0;
  private duration = 0.5;
  private radius = 1;
  private groundAligned = false;

  public constructor(private readonly resources: MageVFXResources) {
    this.group.name = 'MageLayeredMagicCircleVFX';
    this.group.visible = false;
    this.baseMaterial = createMagicCircleMaterial({ opacity: 0, intensity: 1.4, thickness: 1.15 });
    this.counterMaterial = createMagicCircleMaterial({ opacity: 0, intensity: 1.05, thickness: 0.78, distortion: 0.75 });
    this.runeMaterial = createMagicCircleMaterial({ opacity: 0, intensity: 1.8, thickness: 0.55, distortion: 1.25 });
    this.base = new THREE.Mesh(resources.quad, this.baseMaterial);
    this.counter = new THREE.Mesh(resources.quad, this.counterMaterial);
    this.runes = new THREE.Mesh(resources.quad, this.runeMaterial);
    this.base.name = 'MageMagicCircleBaseRunes';
    this.counter.name = 'MageMagicCircleCounterRotatingSegments';
    this.runes.name = 'MageMagicCircleBrightGlyphs';
    this.base.renderOrder = 5;
    this.counter.renderOrder = 6;
    this.runes.renderOrder = 7;
    this.counter.scale.setScalar(0.72);
    this.runes.scale.setScalar(1.04);
    this.particles = new PooledParticleCloud(30, resources.softGlow);
    this.group.add(this.base, this.counter, this.runes, this.particles.points);
  }

  public play(options: MagicCircleOptions): void {
    this.age = 0;
    this.duration = Math.max(0.001, options.duration);
    this.radius = options.radius;
    this.groundAligned = options.groundAligned === true;
    this.group.visible = true;
    this.group.position.copy(options.position);
    this.group.scale.setScalar(Math.max(0.01, this.radius * 2));
    this.group.rotation.set(this.groundAligned ? -Math.PI / 2 : 0, 0, 0);
    TMP_COLOR.set(options.color);
    configureEnergyMaterial(this.baseMaterial, {
      colorA: 0xffffff,
      colorB: TMP_COLOR,
      opacity: 0.82,
      scrollSpeed: 0.5,
      distortion: 1.05,
    });
    configureEnergyMaterial(this.counterMaterial, {
      colorA: TMP_COLOR,
      colorB: 0xffffff,
      opacity: 0.48,
      scrollSpeed: -0.65,
      distortion: 0.85,
    });
    configureEnergyMaterial(this.runeMaterial, {
      colorA: 0xffffff,
      colorB: TMP_COLOR,
      opacity: 0.72,
      scrollSpeed: 1.1,
      distortion: 1.25,
    });
    this.base.rotation.z = 0;
    this.counter.rotation.z = Math.PI * 0.18;
    this.runes.rotation.z = -Math.PI * 0.08;
    this.particles.setTexture(this.resources.softGlow);
    this.particles.emit(new THREE.Vector3(), {
      color: options.color,
      count: 18,
      speed: 0.36,
      spread: 0.95,
      lifetime: this.duration * 0.9,
      upwardBias: this.groundAligned ? 0.22 : 0.02,
    });
    if (options.parent) options.parent.add(this.group);
  }

  public update(delta: number): boolean {
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
    const intro = THREE.MathUtils.smoothstep(progress, 0, 0.18);
    const fade = 1 - THREE.MathUtils.smoothstep(progress, 0.62, 1);
    const opacity = intro * fade;
    setEnergyTime(this.baseMaterial, this.age);
    setEnergyTime(this.counterMaterial, this.age * 1.15);
    setEnergyTime(this.runeMaterial, this.age * 1.55);
    this.baseMaterial.uniforms.uOpacity.value = opacity * 0.82;
    this.counterMaterial.uniforms.uOpacity.value = opacity * 0.46;
    this.runeMaterial.uniforms.uOpacity.value = opacity * 0.72;
    this.base.rotation.z += elapsed * (this.groundAligned ? 0.55 : 1.5);
    this.counter.rotation.z -= elapsed * (this.groundAligned ? 0.8 : 2.4);
    this.runes.rotation.z += elapsed * (this.groundAligned ? 1.35 : 3.15);
    this.group.scale.setScalar(this.radius * 2 * (0.35 + progress * 0.75));
    this.particles.update(elapsed);
    return this.age < this.duration;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.particles.reset();
    this.baseMaterial.uniforms.uOpacity.value = 0;
    this.counterMaterial.uniforms.uOpacity.value = 0;
    this.runeMaterial.uniforms.uOpacity.value = 0;
  }

  public dispose(): void {
    this.baseMaterial.dispose();
    this.counterMaterial.dispose();
    this.runeMaterial.dispose();
    this.particles.dispose();
  }
}

export class MagicCircleVFX {
  private readonly pool: VFXPool<MagicCircleEffect>;
  private readonly active: MagicCircleEffect[] = [];

  public constructor(resources: MageVFXResources) {
    this.pool = new VFXPool(() => new MagicCircleEffect(resources), MAGE_VFX_LIMITS.maxMagicCircles);
  }

  public play(options: MagicCircleOptions): void {
    const circle = this.pool.acquire();
    if (!circle) return;
    circle.play(options);
    this.active.push(circle);
  }

  public update(delta: number): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const circle = this.active[index];
      if (circle.update(delta)) continue;
      this.pool.release(circle);
      this.active.splice(index, 1);
    }
  }

  public clear(): void {
    for (const circle of this.active) this.pool.release(circle);
    this.active.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.pool.dispose();
  }

  public get activeCount(): number { return this.active.length; }
  public get pooledCount(): number { return this.pool.inactiveCount; }
}
