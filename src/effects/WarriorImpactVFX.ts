import * as THREE from 'three';
import type { WarriorAttackId } from '../characters/CharacterCatalog';
import { getWarriorAttackVfxProfile } from './WarriorAttackVfxProfiles';

const MAX_IMPACTS = 24;
const MAX_SPARKS = 22;

export interface WarriorImpactTextures {
  readonly flare: THREE.Texture;
  readonly spark: THREE.Texture;
}

export interface WarriorImpactTextureLoader {
  loadAsync(url: string): Promise<THREE.Texture>;
}

interface ImpactStyle {
  readonly duration: number;
  readonly radius: number;
  readonly ringScale: number;
  readonly sparkSpeed: number;
}

const IMPACT_STYLES: Readonly<Record<WarriorAttackId, ImpactStyle>> = {
  ataque_basico: { duration: 0.28, radius: 0.28, ringScale: 0.8, sparkSpeed: 1.4 },
  ataque_giratorio: { duration: 0.34, radius: 0.38, ringScale: 1.05, sparkSpeed: 1.8 },
  ataque_giratorio_2: { duration: 0.42, radius: 0.42, ringScale: 1.12, sparkSpeed: 1.9 },
  pulo_atacando: { duration: 0.58, radius: 0.62, ringScale: 1.55, sparkSpeed: 2.8 },
  triplo_ataque: { duration: 0.4, radius: 0.48, ringScale: 1.25, sparkSpeed: 2.2 },
  corte_duplo: { duration: 0.38, radius: 0.44, ringScale: 1.16, sparkSpeed: 2.05 },
};

function configureTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
}

class WarriorImpactEffect {
  public readonly group = new THREE.Group();
  public active = false;

  private readonly flare: THREE.Sprite;
  private readonly core: THREE.Mesh;
  private readonly ringA: THREE.Mesh;
  private readonly ringB: THREE.Mesh;
  private readonly sparks: THREE.Points;
  private readonly sparkGeometry = new THREE.BufferGeometry();
  private readonly sparkPositions = new Float32Array(MAX_SPARKS * 3);
  private readonly sparkVelocities = new Float32Array(MAX_SPARKS * 3);
  private readonly sparkLives = new Float32Array(MAX_SPARKS);
  private readonly sparkPositionAttribute = new THREE.BufferAttribute(this.sparkPositions, 3);

  private attackId: WarriorAttackId = 'ataque_basico';
  private age = 0;
  private duration = 0;
  private baseScale = 1;
  private sparkCount = 0;

  public constructor() {
    this.group.name = 'WarriorAttackImpact';
    this.group.visible = false;
    this.group.frustumCulled = false;

    this.flare = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.flare.name = 'WarriorAttackImpactFlare';
    this.flare.renderOrder = 96;

    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
    );
    this.core.name = 'WarriorAttackImpactCore';
    this.core.renderOrder = 97;

    const ringGeometry = new THREE.TorusGeometry(0.55, 0.035, 8, 28);
    this.ringA = new THREE.Mesh(ringGeometry, this.createRingMaterial());
    this.ringB = new THREE.Mesh(ringGeometry.clone(), this.createRingMaterial());
    this.ringA.name = 'WarriorAttackImpactRingA';
    this.ringB.name = 'WarriorAttackImpactRingB';
    this.ringA.renderOrder = 95;
    this.ringB.renderOrder = 95;
    this.ringA.rotation.x = Math.PI * 0.5;
    this.ringB.rotation.y = Math.PI * 0.5;

    this.sparkGeometry.setAttribute('position', this.sparkPositionAttribute);
    this.sparkGeometry.setDrawRange(0, 0);
    this.sparks = new THREE.Points(this.sparkGeometry, new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.085,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
    }));
    this.sparks.name = 'WarriorAttackImpactSparks';
    this.sparks.renderOrder = 98;

    this.group.add(this.flare, this.core, this.ringA, this.ringB, this.sparks);
  }

  public setTextures(textures: WarriorImpactTextures): void {
    const flareMaterial = this.flare.material as THREE.SpriteMaterial;
    flareMaterial.map = textures.flare;
    flareMaterial.needsUpdate = true;
    const sparkMaterial = this.sparks.material as THREE.PointsMaterial;
    sparkMaterial.map = textures.spark;
    sparkMaterial.needsUpdate = true;
  }

  public play(
    attackId: WarriorAttackId,
    position: THREE.Vector3,
    hitIndex = 0,
    scale = 1
  ): void {
    this.active = true;
    const profile = getWarriorAttackVfxProfile(attackId);
    const style = IMPACT_STYLES[attackId];
    this.attackId = attackId;
    this.age = 0;
    this.duration = style.duration;
    this.baseScale = Math.max(0.5, scale);
    this.sparkCount = Math.min(MAX_SPARKS, Math.max(8, Math.round(profile.sparkCount / 8)));
    this.group.position.copy(position);
    this.group.visible = true;

    const flareMaterial = this.flare.material as THREE.SpriteMaterial;
    flareMaterial.color.set(profile.primary);
    flareMaterial.opacity = 0.96;
    this.flare.scale.setScalar(style.radius * 2.4 * this.baseScale);
    this.flare.material.rotation = hitIndex % 2 === 0 ? 0.18 : -0.22;

    const coreMaterial = this.core.material as THREE.MeshBasicMaterial;
    coreMaterial.color.set(profile.primary);
    coreMaterial.opacity = 0.95;
    this.core.scale.setScalar(style.radius * this.baseScale);

    for (const ring of [this.ringA, this.ringB]) {
      const material = ring.material as THREE.MeshBasicMaterial;
      material.color.set(profile.secondary);
      material.opacity = 0.84;
      ring.scale.setScalar(style.ringScale * this.baseScale);
    }
    this.ringA.rotation.z = hitIndex * 0.75;
    this.ringB.rotation.z = -hitIndex * 0.58;

    const sparkMaterial = this.sparks.material as THREE.PointsMaterial;
    sparkMaterial.color.set(profile.secondary);
    sparkMaterial.opacity = 0.96;
    sparkMaterial.size = Math.max(0.055, profile.sparkSize * 1.2);
    this.sparkGeometry.setDrawRange(0, this.sparkCount);
    for (let index = 0; index < this.sparkCount; index += 1) {
      const offset = index * 3;
      const angle = (index / this.sparkCount) * Math.PI * 2 + hitIndex * 0.43;
      const spread = style.radius * (0.18 + (index % 4) * 0.08);
      const y = ((index % 5) - 2) * 0.09;
      this.sparkPositions[offset] = Math.cos(angle) * spread;
      this.sparkPositions[offset + 1] = y;
      this.sparkPositions[offset + 2] = Math.sin(angle) * spread;
      const speed = style.sparkSpeed * (0.72 + (index % 7) * 0.06);
      this.sparkVelocities[offset] = Math.cos(angle) * speed;
      this.sparkVelocities[offset + 1] = (0.2 + (index % 4) * 0.12) * speed;
      this.sparkVelocities[offset + 2] = Math.sin(angle) * speed;
      this.sparkLives[index] = this.duration * (0.58 + (index % 5) * 0.07);
    }
    this.sparkPositionAttribute.needsUpdate = true;
  }

  public update(delta: number): boolean {
    if (!this.active && !this.group.visible) return false;
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    const progress = THREE.MathUtils.clamp(this.age / Math.max(0.001, this.duration), 0, 1);
    const fade = 1 - progress;
    const pulse = 1 + Math.sin(this.age * 36) * 0.08;

    this.flare.scale.multiplyScalar(1 + elapsed * 2.6);
    this.core.scale.multiplyScalar(1 + elapsed * 1.8);
    this.ringA.scale.multiplyScalar(1 + elapsed * 4.2);
    this.ringB.scale.multiplyScalar(1 + elapsed * 3.8);
    this.ringA.rotation.y += elapsed * 5.5;
    this.ringB.rotation.x -= elapsed * 4.5;
    (this.flare.material as THREE.SpriteMaterial).opacity = fade * 0.96 * pulse;
    (this.core.material as THREE.MeshBasicMaterial).opacity = fade * 0.9;
    (this.ringA.material as THREE.MeshBasicMaterial).opacity = fade * 0.84;
    (this.ringB.material as THREE.MeshBasicMaterial).opacity = fade * 0.66;

    let alive = 0;
    for (let index = 0; index < this.sparkCount; index += 1) {
      const life = Math.max(0, this.sparkLives[index] - elapsed);
      this.sparkLives[index] = life;
      if (life <= 0) continue;
      const source = index * 3;
      const target = alive * 3;
      this.sparkPositions[target] = this.sparkPositions[source] + this.sparkVelocities[source] * elapsed;
      this.sparkPositions[target + 1] = this.sparkPositions[source + 1] + this.sparkVelocities[source + 1] * elapsed;
      this.sparkPositions[target + 2] = this.sparkPositions[source + 2] + this.sparkVelocities[source + 2] * elapsed;
      this.sparkVelocities[target] = this.sparkVelocities[source] * 0.96;
      this.sparkVelocities[target + 1] = this.sparkVelocities[source + 1] - 1.8 * elapsed;
      this.sparkVelocities[target + 2] = this.sparkVelocities[source + 2] * 0.96;
      this.sparkLives[alive] = life;
      alive += 1;
    }
    this.sparkCount = alive;
    this.sparkGeometry.setDrawRange(0, alive);
    this.sparkPositionAttribute.needsUpdate = true;
    (this.sparks.material as THREE.PointsMaterial).opacity = alive > 0 ? fade * 0.96 : 0;

    if (this.age < this.duration) return true;
    this.reset();
    return false;
  }

  public reset(): void {
    this.active = false;
    this.group.visible = false;
    this.age = 0;
    this.duration = 0;
    this.sparkCount = 0;
    this.sparkGeometry.setDrawRange(0, 0);
    (this.flare.material as THREE.SpriteMaterial).opacity = 0;
    (this.core.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.ringA.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.ringB.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.sparks.material as THREE.PointsMaterial).opacity = 0;
  }

  public dispose(): void {
    this.reset();
    (this.flare.material as THREE.Material).dispose();
    this.core.geometry.dispose();
    (this.core.material as THREE.Material).dispose();
    this.ringA.geometry.dispose();
    (this.ringA.material as THREE.Material).dispose();
    this.ringB.geometry.dispose();
    (this.ringB.material as THREE.Material).dispose();
    this.sparkGeometry.dispose();
    (this.sparks.material as THREE.Material).dispose();
  }

  private createRingMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
  }
}

/** Pooled monster-side impact for every physical warrior hit. */
export class WarriorImpactVFX {
  private readonly pool: WarriorImpactEffect[] = [];
  private readonly active: WarriorImpactEffect[] = [];
  private readonly scene: THREE.Scene;

  public constructor(scene: THREE.Scene) {
    this.scene = scene;
    for (let index = 0; index < MAX_IMPACTS; index += 1) {
      this.pool.push(new WarriorImpactEffect());
    }
  }

  public async loadTextureAssets(
    loader: WarriorImpactTextureLoader = new THREE.TextureLoader()
  ): Promise<boolean> {
    try {
      const [flare, spark] = await Promise.all([
        loader.loadAsync('/vfx/warrior/impact-flare.png'),
        loader.loadAsync('/vfx/warrior/soft-glow.png'),
      ]);
      configureTexture(flare);
      configureTexture(spark);
      for (const effect of this.pool) effect.setTextures({ flare, spark });
      return true;
    } catch {
      return false;
    }
  }

  public play(
    attackId: WarriorAttackId,
    position: THREE.Vector3,
    hitIndex = 0,
    scale = 1
  ): void {
    const effect = this.pool.find((candidate) => !candidate.active && !candidate.group.visible);
    if (!effect) return;
    effect.active = true;
    effect.play(attackId, position, hitIndex, scale);
    this.scene.add(effect.group);
    this.active.push(effect);
  }

  public update(delta: number): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const effect = this.active[index];
      if (effect.update(delta)) continue;
      this.active.splice(index, 1);
    }
  }

  public clear(): void {
    for (const effect of this.active) effect.reset();
    this.active.length = 0;
  }

  public dispose(): void {
    this.clear();
    for (const effect of this.pool) effect.dispose();
    this.pool.length = 0;
  }

  public get activeCount(): number {
    return this.active.length;
  }
}
