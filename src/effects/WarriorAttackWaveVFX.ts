import * as THREE from 'three';
import type { WarriorAttackId } from '../characters/CharacterCatalog';
import { getWarriorAttackVfxProfile } from './WarriorAttackVfxProfiles';

const MAX_WAVES = 12;
const ARC_POINTS = 25;

export interface WarriorAttackWaveTextureLoader {
  loadAsync(url: string): Promise<THREE.Texture>;
}

interface WaveStyle {
  readonly kind: 'slash' | 'spin' | 'jump';
  readonly duration: number;
  readonly maxRadius: number;
  readonly speed: number;
  readonly y: number;
}

const WAVE_STYLES: Readonly<Record<WarriorAttackId, WaveStyle>> = {
  ataque_basico: { kind: 'slash', duration: 0.46, maxRadius: 0, speed: 14, y: 1.05 },
  ataque_giratorio: { kind: 'spin', duration: 0.9, maxRadius: 10, speed: 0, y: 0.08 },
  ataque_giratorio_2: { kind: 'spin', duration: 1.02, maxRadius: 10, speed: 0, y: 0.08 },
  pulo_atacando: { kind: 'jump', duration: 0.92, maxRadius: 5.2, speed: 0, y: 0.06 },
  triplo_ataque: { kind: 'slash', duration: 0.48, maxRadius: 0, speed: 15, y: 1.0 },
  corte_duplo: { kind: 'slash', duration: 0.5, maxRadius: 0, speed: 15, y: 1.02 },
};

function configureTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
}

function smooth(progress: number): number {
  return THREE.MathUtils.smoothstep(progress, 0, 1);
}

class AttackWaveEffect {
  public readonly group = new THREE.Group();
  public active = false;

  private readonly slashGeometry = new THREE.BufferGeometry();
  private readonly slashGlowGeometry = new THREE.BufferGeometry();
  private readonly slash = new THREE.Line(
    this.slashGeometry,
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  private readonly slashGlow = new THREE.Line(
    this.slashGlowGeometry,
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  private readonly slashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  private readonly ring = new THREE.Mesh(
    new THREE.RingGeometry(0.84, 1, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  private readonly innerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.68, 0.72, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  private readonly groundFlash = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  private readonly core = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
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

  private attackId: WarriorAttackId = 'ataque_basico';
  private style = WAVE_STYLES.ataque_basico;
  private age = 0;
  private forward = new THREE.Vector3(0, 0, 1);
  private baseScale = 1;

  public constructor() {
    this.group.name = 'WarriorAttackWave';
    this.group.visible = false;
    this.group.frustumCulled = false;
    this.slash.name = 'WarriorAirSlash';
    this.slashGlow.name = 'WarriorAirSlashGlow';
    this.slashSprite.name = 'WarriorAirSlashSprite';
    this.ring.name = 'WarriorSpinWave';
    this.innerRing.name = 'WarriorSpinWaveCore';
    this.groundFlash.name = 'WarriorGroundImpactFlash';
    this.core.name = 'WarriorJumpImpactCore';
    this.slash.renderOrder = 90;
    this.slashGlow.renderOrder = 89;
    this.slashSprite.renderOrder = 91;
    this.ring.renderOrder = 88;
    this.innerRing.renderOrder = 89;
    this.groundFlash.renderOrder = 92;
    this.core.renderOrder = 93;

    const arc = new Float32Array(ARC_POINTS * 3);
    const glow = new Float32Array(ARC_POINTS * 3);
    for (let index = 0; index < ARC_POINTS; index += 1) {
      const progress = index / (ARC_POINTS - 1);
      const angle = THREE.MathUtils.lerp(-1.18, 1.18, progress);
      // Right-facing C: the gap opens toward the attacker's left while the
      // whole arc is carried forward by the sword wind.
      const x = Math.cos(angle) * 0.76;
      const y = Math.sin(angle) * 0.62;
      const offset = index * 3;
      arc[offset] = x;
      arc[offset + 1] = y;
      arc[offset + 2] = 0;
      glow[offset] = x * 1.1;
      glow[offset + 1] = y * 1.1;
      glow[offset + 2] = -0.015;
    }
    this.slashGeometry.setAttribute('position', new THREE.BufferAttribute(arc, 3));
    this.slashGlowGeometry.setAttribute('position', new THREE.BufferAttribute(glow, 3));

    this.ring.rotation.x = -Math.PI * 0.5;
    this.innerRing.rotation.x = -Math.PI * 0.5;
    this.group.add(
      this.slashGlow,
      this.slash,
      this.slashSprite,
      this.ring,
      this.innerRing,
      this.groundFlash,
      this.core
    );
  }

  public setSlashTexture(texture: THREE.Texture): void {
    const material = this.slashSprite.material as THREE.SpriteMaterial;
    material.map = texture;
    material.needsUpdate = true;
  }

  public play(
    attackId: WarriorAttackId,
    position: THREE.Vector3,
    forward: THREE.Vector3,
    hitIndex = 0,
    scale = 1
  ): void {
    this.active = true;
    this.attackId = attackId;
    this.style = WAVE_STYLES[attackId];
    this.age = 0;
    this.baseScale = Math.max(0.75, scale);
    this.forward.copy(forward).setY(0);
    if (this.forward.lengthSq() < 1e-8) this.forward.set(0, 0, 1);
    this.forward.normalize();
    this.group.position.copy(position);
    this.group.position.y += this.style.y;
    this.group.rotation.y = Math.atan2(this.forward.x, this.forward.z);
    this.group.visible = true;

    const profile = getWarriorAttackVfxProfile(attackId);
    const slashMaterial = this.slash.material as THREE.LineBasicMaterial;
    const slashGlowMaterial = this.slashGlow.material as THREE.LineBasicMaterial;
    const spriteMaterial = this.slashSprite.material as THREE.SpriteMaterial;
    const ringMaterial = this.ring.material as THREE.MeshBasicMaterial;
    const innerRingMaterial = this.innerRing.material as THREE.MeshBasicMaterial;
    const flashMaterial = this.groundFlash.material as THREE.SpriteMaterial;
    const coreMaterial = this.core.material as THREE.MeshBasicMaterial;

    slashMaterial.color.set(profile.primary);
    slashGlowMaterial.color.set(profile.secondary);
    spriteMaterial.color.set(profile.primary);
    ringMaterial.color.set(profile.secondary);
    innerRingMaterial.color.set(profile.primary);
    flashMaterial.color.set(profile.primary);
    coreMaterial.color.set(profile.primary);

    this.slash.scale.setScalar(this.baseScale);
    this.slashGlow.scale.setScalar(this.baseScale * 1.16);
    this.slashSprite.scale.setScalar(this.baseScale * 1.45);
    this.ring.scale.setScalar(0.08 * this.baseScale);
    this.innerRing.scale.setScalar(0.08 * this.baseScale);
    this.groundFlash.scale.setScalar(this.baseScale * 0.9);
    this.core.scale.setScalar(this.baseScale);
    this.slashSprite.material.rotation = hitIndex % 2 === 0 ? 0.15 : -0.18;

    const slashVisible = this.style.kind === 'slash';
    const spinVisible = this.style.kind === 'spin';
    const jumpVisible = this.style.kind === 'jump';
    this.slash.visible = slashVisible;
    this.slashGlow.visible = slashVisible;
    this.slashSprite.visible = slashVisible;
    this.ring.visible = spinVisible || jumpVisible;
    this.innerRing.visible = spinVisible || jumpVisible;
    this.groundFlash.visible = jumpVisible;
    this.core.visible = jumpVisible;
    slashMaterial.opacity = slashVisible ? 0.96 : 0;
    slashGlowMaterial.opacity = slashVisible ? 0.56 : 0;
    spriteMaterial.opacity = slashVisible ? 0.72 : 0;
    ringMaterial.opacity = spinVisible ? 0.9 : jumpVisible ? 1 : 0;
    innerRingMaterial.opacity = spinVisible ? 0.62 : jumpVisible ? 0.78 : 0;
    flashMaterial.opacity = jumpVisible ? 0.95 : 0;
    coreMaterial.opacity = jumpVisible ? 0.95 : 0;
  }

  public update(delta: number): boolean {
    if (!this.active) return false;
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    const progress = THREE.MathUtils.clamp(this.age / this.style.duration, 0, 1);
    const fade = 1 - progress;
    const profile = getWarriorAttackVfxProfile(this.attackId);

    if (this.style.kind === 'slash') {
      this.group.position.addScaledVector(this.forward, this.style.speed * elapsed);
      const stretch = 1 + smooth(progress) * 0.22;
      this.slash.scale.set(this.baseScale * stretch, this.baseScale * (1 - progress * 0.18), this.baseScale);
      this.slashGlow.scale.copy(this.slash.scale).multiplyScalar(1.16);
      this.slashSprite.scale.setScalar(this.baseScale * 1.45 * (1 + progress * 0.2));
      (this.slash.material as THREE.LineBasicMaterial).opacity = fade * 0.96;
      (this.slashGlow.material as THREE.LineBasicMaterial).opacity = fade * 0.56;
      (this.slashSprite.material as THREE.SpriteMaterial).opacity = fade * 0.72;
    } else {
      const radius = Math.max(0.08, this.style.maxRadius * smooth(progress));
      this.ring.scale.setScalar(radius * this.baseScale);
      this.innerRing.scale.setScalar(radius * 0.76 * this.baseScale);
      this.ring.rotation.z += elapsed * (this.style.kind === 'jump' ? 2.4 : 1.8);
      this.innerRing.rotation.z -= elapsed * (this.style.kind === 'jump' ? 3.6 : 2.5);
      const ringOpacity = fade * (this.style.kind === 'jump' ? 1 : 0.9);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = ringOpacity;
      (this.innerRing.material as THREE.MeshBasicMaterial).opacity = ringOpacity * 0.72;
      if (this.style.kind === 'jump') {
        this.groundFlash.scale.setScalar(this.baseScale * (1.2 + progress * 3.4));
        this.core.scale.setScalar(this.baseScale * (1.2 + progress * 2.1));
        (this.groundFlash.material as THREE.SpriteMaterial).opacity = fade * 0.95;
        (this.core.material as THREE.MeshBasicMaterial).opacity = fade * 0.84;
      }
    }

    // A small color pulse makes the edge readable without turning the effect
    // into a permanent opaque disc over the arena.
    const pulse = 0.92 + Math.sin(this.age * 28) * 0.08;
    (this.slash.material as THREE.LineBasicMaterial).color.set(profile.primary);
    (this.ring.material as THREE.MeshBasicMaterial).color.set(profile.secondary);
    (this.ring.material as THREE.MeshBasicMaterial).opacity *= pulse;

    if (this.age < this.style.duration) return true;
    this.reset();
    return false;
  }

  public reset(): void {
    this.active = false;
    this.group.visible = false;
    this.age = 0;
    this.slash.visible = false;
    this.slashGlow.visible = false;
    this.slashSprite.visible = false;
    this.ring.visible = false;
    this.innerRing.visible = false;
    this.groundFlash.visible = false;
    this.core.visible = false;
    (this.slash.material as THREE.LineBasicMaterial).opacity = 0;
    (this.slashGlow.material as THREE.LineBasicMaterial).opacity = 0;
    (this.slashSprite.material as THREE.SpriteMaterial).opacity = 0;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.innerRing.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.groundFlash.material as THREE.SpriteMaterial).opacity = 0;
    (this.core.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  public dispose(): void {
    this.reset();
    this.slashGeometry.dispose();
    this.slashGlowGeometry.dispose();
    (this.slash.material as THREE.Material).dispose();
    (this.slashGlow.material as THREE.Material).dispose();
    (this.slashSprite.material as THREE.Material).dispose();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.innerRing.geometry.dispose();
    (this.innerRing.material as THREE.Material).dispose();
    (this.groundFlash.material as THREE.Material).dispose();
    this.core.geometry.dispose();
    (this.core.material as THREE.Material).dispose();
  }
}

/** Directional air cuts, expanding spin waves, and the jump landing shockwave. */
export class WarriorAttackWaveVFX {
  private readonly effects: AttackWaveEffect[] = [];
  private readonly active: AttackWaveEffect[] = [];
  private readonly scene: THREE.Scene;
  private slashTexture: THREE.Texture | null = null;
  private readonly onHeavyImpact?: () => void;

  public constructor(scene: THREE.Scene, onHeavyImpact?: () => void) {
    this.scene = scene;
    this.onHeavyImpact = onHeavyImpact;
    for (let index = 0; index < MAX_WAVES; index += 1) {
      this.effects.push(new AttackWaveEffect());
    }
  }

  public async loadTextureAssets(
    loader: WarriorAttackWaveTextureLoader = new THREE.TextureLoader()
  ): Promise<boolean> {
    try {
      const texture = await loader.loadAsync('/vfx/warrior/slash-arc.png');
      configureTexture(texture);
      this.slashTexture = texture;
      for (const effect of this.effects) effect.setSlashTexture(texture);
      return true;
    } catch {
      return false;
    }
  }

  public play(
    attackId: WarriorAttackId,
    origin: THREE.Vector3,
    forward: THREE.Vector3,
    hitIndex = 0,
    scale = 1
  ): void {
    const effect = this.effects.find((candidate) => !candidate.active);
    if (!effect) return;
    effect.active = true;
    effect.play(attackId, origin, forward, hitIndex, scale);
    this.scene.add(effect.group);
    this.active.push(effect);
    if (attackId === 'pulo_atacando') this.onHeavyImpact?.();
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
    for (const effect of this.effects) effect.dispose();
    this.effects.length = 0;
    this.slashTexture?.dispose();
    this.slashTexture = null;
  }

  public get activeCount(): number {
    return this.active.length;
  }
}
