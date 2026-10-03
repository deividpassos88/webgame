import * as THREE from 'three';
import type { MageSpellColors, MageVFXQuality } from './VFXTypes';

const TMP_COLOR = new THREE.Color();
const EMPTY_TEXTURE = (() => {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
})();

export interface ParticleBurstOptions {
  readonly color: THREE.ColorRepresentation;
  readonly count: number;
  readonly speed: number;
  readonly spread: number;
  readonly lifetime: number;
  readonly upwardBias?: number;
  /** Point size range in shader units (before the perspective divide). */
  readonly size?: readonly [number, number];
  /** Cloud opacity multiplier (default 1). */
  readonly opacity?: number;
  /**
   * How much a particle grows over its life: negative shrinks (sparks),
   * positive puffs up (smoke/vapor). Shader units, default -0.52.
   */
  readonly growth?: number;
}

export type ParticleCloudBlending = 'additive' | 'normal';

export interface ParticleCloudOptions {
  readonly blending?: ParticleCloudBlending;
}

interface ParticleShaderUniforms {
  uMap: { value: THREE.Texture };
  uColor: { value: THREE.Color };
  uOpacity: { value: number };
  uTime: { value: number };
  uGrowth: { value: number };
}

type ParticleShaderMaterial = THREE.ShaderMaterial & { uniforms: ParticleShaderUniforms };

/** Default point-size range for combat sparks and glows. */
const DEFAULT_PARTICLE_SIZE: readonly [number, number] = [10, 36];
/** Default life growth: sparks shrink as they die. */
const DEFAULT_PARTICLE_GROWTH = -0.52;

function createParticleMaterial(
  texture?: THREE.Texture,
  blending: THREE.Blending = THREE.AdditiveBlending
): ParticleShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture ?? EMPTY_TEXTURE },
      uColor: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uGrowth: { value: DEFAULT_PARTICLE_GROWTH },
    },
    vertexShader: /* glsl */`
      attribute float aLifeRatio;
      attribute float aSize;
      attribute float aSeed;
      varying float vLife;
      varying float vSeed;
      void main() {
        vLife = clamp(aLifeRatio, 0.0, 1.0);
        vSeed = aSeed;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float perspective = 260.0 / max(1.0, -mvPosition.z);
        float pulse = 0.86 + sin(aSeed * 17.13 + vLife * 9.0) * 0.14;
        gl_PointSize = aSize * perspective * pulse * max(0.05, 1.0 + uGrowth * vLife);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying float vLife;
      varying float vSeed;
      void main() {
        vec2 uv = gl_PointCoord;
        vec4 tex = texture2D(uMap, uv);
        float radial = smoothstep(0.5, 0.12, distance(uv, vec2(0.5)));
        float twinkle = 0.82 + sin(uTime * 12.0 + vSeed * 31.0) * 0.18;
        float fade = pow(1.0 - vLife, 1.35);
        float alpha = tex.a * radial * fade * uOpacity * twinkle;
        gl_FragColor = vec4(uColor * (1.0 + (1.0 - vLife) * 0.45), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }) as ParticleShaderMaterial;
}

/** Fixed-buffer shader particle cloud used by impacts and local secondary effects. */
export class PooledParticleCloud {
  public readonly points: THREE.Points;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly lives: Float32Array;
  private readonly maxLives: Float32Array;
  private readonly lifeRatios: Float32Array;
  private readonly sizes: Float32Array;
  private readonly seeds: Float32Array;
  private readonly positionAttribute: THREE.BufferAttribute;
  private readonly lifeAttribute: THREE.BufferAttribute;
  private readonly sizeAttribute: THREE.BufferAttribute;
  private activeCount = 0;
  private lifetime = 1;
  private baseOpacity = 1;
  private ratioDimming = true;

  public constructor(
    private readonly maxParticles: number,
    texture?: THREE.Texture,
    options: ParticleCloudOptions = {}
  ) {
    this.positions = new Float32Array(maxParticles * 3);
    this.velocities = new Float32Array(maxParticles * 3);
    this.lives = new Float32Array(maxParticles);
    this.maxLives = new Float32Array(maxParticles);
    this.lifeRatios = new Float32Array(maxParticles);
    this.sizes = new Float32Array(maxParticles);
    this.seeds = new Float32Array(maxParticles);
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    this.lifeAttribute = new THREE.BufferAttribute(this.lifeRatios, 1);
    this.sizeAttribute = new THREE.BufferAttribute(this.sizes, 1);
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('aLifeRatio', this.lifeAttribute);
    this.geometry.setAttribute('aSize', this.sizeAttribute);
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 1));
    this.geometry.setDrawRange(0, 0);
    this.points = new THREE.Points(
      this.geometry,
      createParticleMaterial(
        texture,
        options.blending === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending
      )
    );
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  public setTexture(texture: THREE.Texture | null | undefined): void {
    const material = this.points.material as ParticleShaderMaterial;
    const next = texture ?? EMPTY_TEXTURE;
    if (material.uniforms.uMap.value === next) return;
    material.uniforms.uMap.value = next;
    // No material.needsUpdate here: swapping only the uMap uniform value never
    // changes the compiled program, and flagging it would recompile the
    // particle shader on the next frame (a hitch on the first skill cast).
  }

  public setOpacity(opacity: number): void {
    this.baseOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
    (this.points.material as ParticleShaderMaterial).uniforms.uOpacity.value = this.baseOpacity;
  }

  public setColor(color: THREE.ColorRepresentation): void {
    (this.points.material as ParticleShaderMaterial).uniforms.uColor.value.set(color);
  }

  /**
   * Restarts the cloud with one burst at `origin`. Previous particles are
   * discarded — use {@link add} when the effect needs a continuous trail.
   */
  public emit(origin: THREE.Vector3, options: ParticleBurstOptions): void {
    this.applyCloudStyle(options);
    const count = Math.min(this.maxParticles, Math.max(0, Math.floor(options.count)));
    this.activeCount = 0;
    this.spawn(origin, options, count);
  }

  /**
   * Appends a puff to the particles already alive, so a moving source (frost
   * trail, smoke ribbon) leaves a continuous cloud behind instead of replacing
   * the previous puff every frame. Dead particles are compacted on update, so
   * appending at `activeCount` always writes into a free tail.
   */
  public add(origin: THREE.Vector3, options: ParticleBurstOptions): void {
    const room = this.maxParticles - this.activeCount;
    if (room <= 0) return;
    this.applyCloudStyle(options);
    this.spawn(origin, options, Math.min(room, Math.max(0, Math.floor(options.count))));
  }

  private applyCloudStyle(options: ParticleBurstOptions): void {
    this.lifetime = Math.max(0.001, options.lifetime);
    this.setColor(options.color);
    this.setOpacity(options.opacity ?? 1);
    // An explicit opacity is the effect's intended alpha (frost trails and
    // other continuous clouds stay steady); without it the old behaviour is
    // kept and the cloud fades with how full it is.
    this.ratioDimming = options.opacity === undefined;
    (this.points.material as ParticleShaderMaterial).uniforms.uGrowth.value =
      options.growth ?? DEFAULT_PARTICLE_GROWTH;
  }

  private spawn(origin: THREE.Vector3, options: ParticleBurstOptions, count: number): void {
    if (count <= 0) {
      this.syncBuffers();
      return;
    }
    const [minSize, maxSize] = options.size ?? DEFAULT_PARTICLE_SIZE;
    const first = this.activeCount;
    const total = first + count;
    this.points.visible = true;
    this.geometry.setDrawRange(0, total);

    for (let index = first; index < total; index += 1) {
      const offset = index * 3;
      this.positions[offset] = origin.x;
      this.positions[offset + 1] = origin.y;
      this.positions[offset + 2] = origin.z;

      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.35) * options.spread + (options.upwardBias ?? 0);
      const radial = Math.sqrt(Math.max(0.05, 1 - y * y));
      const speed = options.speed * (0.35 + Math.random() * 0.65);
      this.velocities[offset] = Math.cos(theta) * radial * speed;
      this.velocities[offset + 1] = y * speed;
      this.velocities[offset + 2] = Math.sin(theta) * radial * speed;
      this.maxLives[index] = this.lifetime * (0.6 + Math.random() * 0.4);
      this.lives[index] = this.maxLives[index];
      this.lifeRatios[index] = 0;
      this.sizes[index] = minSize + Math.random() * Math.max(0, maxSize - minSize);
      this.seeds[index] = Math.random() * 1000;
    }
    this.activeCount = total;
    this.syncBuffers();
  }

  private syncBuffers(): void {
    this.points.visible = this.activeCount > 0;
    this.geometry.setDrawRange(0, this.activeCount);
    this.positionAttribute.needsUpdate = true;
    this.lifeAttribute.needsUpdate = true;
    this.sizeAttribute.needsUpdate = true;
    const seedAttribute = this.geometry.getAttribute('aSeed') as THREE.BufferAttribute | undefined;
    if (seedAttribute) seedAttribute.needsUpdate = true;
  }

  public update(delta: number): boolean {
    if (this.activeCount <= 0) return false;
    const elapsed = Math.max(0, delta);
    (this.points.material as ParticleShaderMaterial).uniforms.uTime.value += elapsed;
    let alive = 0;
    for (let index = 0; index < this.activeCount; index += 1) {
      this.lives[index] = Math.max(0, this.lives[index] - elapsed);
      if (this.lives[index] <= 0) continue;
      const source = index * 3;
      const target = alive * 3;
      this.positions[target] = this.positions[source] + this.velocities[source] * elapsed;
      this.positions[target + 1] = this.positions[source + 1] + this.velocities[source + 1] * elapsed;
      this.positions[target + 2] = this.positions[source + 2] + this.velocities[source + 2] * elapsed;
      this.velocities[target] = this.velocities[source] * 0.96;
      this.velocities[target + 1] = this.velocities[source + 1] * 0.96 + 0.45 * elapsed;
      this.velocities[target + 2] = this.velocities[source + 2] * 0.96;
      this.lives[alive] = this.lives[index];
      this.maxLives[alive] = this.maxLives[index];
      this.lifeRatios[alive] = 1 - this.lives[index] / Math.max(0.001, this.maxLives[index]);
      this.sizes[alive] = this.sizes[index];
      this.seeds[alive] = this.seeds[index];
      alive += 1;
    }
    this.activeCount = alive;
    this.geometry.setDrawRange(0, alive);
    this.positionAttribute.needsUpdate = true;
    this.lifeAttribute.needsUpdate = true;
    this.sizeAttribute.needsUpdate = true;
    const seedAttribute = this.geometry.getAttribute('aSeed') as THREE.BufferAttribute | undefined;
    if (seedAttribute) seedAttribute.needsUpdate = true;
    const material = this.points.material as ParticleShaderMaterial;
    const fill = this.ratioDimming
      ? THREE.MathUtils.clamp(alive / this.maxParticles, 0.15, 1)
      : 1;
    material.uniforms.uOpacity.value = alive > 0 ? this.baseOpacity * fill : 0;
    this.points.visible = alive > 0;
    return alive > 0;
  }

  public reset(): void {
    this.activeCount = 0;
    this.geometry.setDrawRange(0, 0);
    this.points.visible = false;
    (this.points.material as ParticleShaderMaterial).uniforms.uOpacity.value = 0;
  }

  public dispose(): void {
    this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

export function qualityCount(
  baseCount: number,
  quality: MageVFXQuality,
  multipliers: Readonly<Record<MageVFXQuality, number>>
): number {
  return Math.max(1, Math.round(baseCount * multipliers[quality]));
}

export function lerpColor(
  output: THREE.Color,
  colors: MageSpellColors,
  alpha: number): THREE.Color {
  return output.set(colors.core).lerp(TMP_COLOR.set(colors.glow), alpha);
}
