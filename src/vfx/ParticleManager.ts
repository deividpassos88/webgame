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
}

interface ParticleShaderUniforms {
  uMap: { value: THREE.Texture };
  uColor: { value: THREE.Color };
  uOpacity: { value: number };
  uTime: { value: number };
}

type ParticleShaderMaterial = THREE.ShaderMaterial & { uniforms: ParticleShaderUniforms };

function createParticleMaterial(texture?: THREE.Texture): ParticleShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture ?? EMPTY_TEXTURE },
      uColor: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
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
        gl_PointSize = aSize * perspective * pulse * (1.0 - vLife * 0.52);
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

  public constructor(
    private readonly maxParticles: number,
    texture?: THREE.Texture
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
    this.points = new THREE.Points(this.geometry, createParticleMaterial(texture));
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  public setTexture(texture: THREE.Texture | null | undefined): void {
    const material = this.points.material as ParticleShaderMaterial;
    const next = texture ?? EMPTY_TEXTURE;
    if (material.uniforms.uMap.value === next) return;
    material.uniforms.uMap.value = next;
    material.needsUpdate = true;
  }

  public setOpacity(opacity: number): void {
    this.baseOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
    (this.points.material as ParticleShaderMaterial).uniforms.uOpacity.value = this.baseOpacity;
  }

  public setColor(color: THREE.ColorRepresentation): void {
    (this.points.material as ParticleShaderMaterial).uniforms.uColor.value.set(color);
  }

  public emit(origin: THREE.Vector3, options: ParticleBurstOptions): void {
    const count = Math.min(this.maxParticles, Math.max(0, Math.floor(options.count)));
    this.activeCount = count;
    this.lifetime = Math.max(0.001, options.lifetime);
    this.setColor(options.color);
    this.setOpacity(1);
    this.points.visible = count > 0;
    this.geometry.setDrawRange(0, count);

    for (let index = 0; index < count; index += 1) {
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
      this.sizes[index] = 10 + Math.random() * 26;
      this.seeds[index] = Math.random() * 1000;
    }
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
    material.uniforms.uOpacity.value = alive > 0
      ? this.baseOpacity * THREE.MathUtils.clamp(alive / this.maxParticles, 0.15, 1)
      : 0;
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
