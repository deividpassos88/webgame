import * as THREE from 'three';
import type { WarriorAttackId } from '../characters/CharacterCatalog';

const MAX_EFFECTS = 20;
const ARC_POINTS = 36;
const SHARD_COUNT = 18;
const DEBRIS_COUNT = 26;

export interface WarriorReferenceTextureLoader {
  loadAsync(url: string): Promise<THREE.Texture>;
}

type ReferenceKind = 'slash' | 'spin' | 'jump' | 'hit';

interface ReferenceStyle {
  readonly kind: ReferenceKind;
  readonly duration: number;
  readonly speed: number;
  readonly maxRadius: number;
  readonly primary: number;
  readonly secondary: number;
  readonly accent: number;
}

const STYLES: Readonly<Record<WarriorAttackId, ReferenceStyle>> = {
  ataque_basico: {
    kind: 'slash', duration: 0.52, speed: 13, maxRadius: 0,
    primary: 0xffffff, secondary: 0x42eaff, accent: 0x087cff,
  },
  ataque_giratorio: {
    kind: 'spin', duration: 0.92, speed: 0, maxRadius: 9.8,
    primary: 0xffffff, secondary: 0x1986ff, accent: 0x6eeeff,
  },
  ataque_giratorio_2: {
    kind: 'spin', duration: 1.04, speed: 0, maxRadius: 10,
    primary: 0xeaffff, secondary: 0x4b27ff, accent: 0x1ca8ff,
  },
  pulo_atacando: {
    kind: 'jump', duration: 0.76, speed: 0, maxRadius: 5.2,
    primary: 0xffffff, secondary: 0x25eaff, accent: 0x1685ff,
  },
  triplo_ataque: {
    kind: 'slash', duration: 0.62, speed: 14, maxRadius: 0,
    primary: 0xffffff, secondary: 0x36d9ff, accent: 0x1768ff,
  },
  corte_duplo: {
    kind: 'slash', duration: 0.58, speed: 14, maxRadius: 0,
    primary: 0xffffff, secondary: 0x5db7ff, accent: 0x3448ff,
  },
};

function configureTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
}

function smooth(progress: number): number {
  return THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(progress, 0, 1), 0, 1);
}

function material(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function lineMaterial(color: number, opacity = 1): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function verticalRibbon(
  radiusX: number,
  radiusY: number,
  startAngle: number,
  endAngle: number,
  width: number,
  points = ARC_POINTS
): THREE.BufferGeometry {
  const positions = new Float32Array(points * 2 * 3);
  const indices = new Uint32Array((points - 1) * 6);
  for (let index = 0; index < points; index += 1) {
    const t = index / (points - 1);
    const angle = THREE.MathUtils.lerp(startAngle, endAngle, t);
    const center = new THREE.Vector3(
      Math.cos(angle) * radiusX,
      Math.sin(angle) * radiusY,
      0
    );
    const tangent = new THREE.Vector2(
      -Math.sin(angle) * radiusX,
      Math.cos(angle) * radiusY
    ).normalize();
    const normal = new THREE.Vector2(-tangent.y, tangent.x);
    const taper = 0.48 + Math.sin(t * Math.PI) * 0.52;
    const halfWidth = width * taper * 0.5;
    const offset = index * 6;
    positions[offset] = center.x + normal.x * halfWidth;
    positions[offset + 1] = center.y + normal.y * halfWidth;
    positions[offset + 2] = center.z;
    positions[offset + 3] = center.x - normal.x * halfWidth;
    positions[offset + 4] = center.y - normal.y * halfWidth;
    positions[offset + 5] = center.z;
    if (index < points - 1) {
      const base = index * 6;
      const vertex = index * 2;
      indices[base] = vertex;
      indices[base + 1] = vertex + 2;
      indices[base + 2] = vertex + 1;
      indices[base + 3] = vertex + 1;
      indices[base + 4] = vertex + 2;
      indices[base + 5] = vertex + 3;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

function horizontalRibbon(
  radius: number,
  startAngle: number,
  endAngle: number,
  width: number,
  points = ARC_POINTS
): THREE.BufferGeometry {
  const positions = new Float32Array(points * 2 * 3);
  const indices = new Uint32Array((points - 1) * 6);
  for (let index = 0; index < points; index += 1) {
    const t = index / (points - 1);
    const angle = THREE.MathUtils.lerp(startAngle, endAngle, t);
    const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const taper = 0.34 + Math.sin(t * Math.PI) * 0.66;
    const halfWidth = width * taper * 0.5;
    const center = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    const offset = index * 6;
    positions[offset] = center.x + normal.x * halfWidth;
    positions[offset + 1] = center.y + normal.y * halfWidth;
    positions[offset + 2] = center.z + normal.z * halfWidth;
    positions[offset + 3] = center.x - normal.x * halfWidth;
    positions[offset + 4] = center.y - normal.y * halfWidth;
    positions[offset + 5] = center.z - normal.z * halfWidth;
    if (index < points - 1) {
      const base = index * 6;
      const vertex = index * 2;
      indices[base] = vertex;
      indices[base + 1] = vertex + 2;
      indices[base + 2] = vertex + 1;
      indices[base + 3] = vertex + 1;
      indices[base + 4] = vertex + 2;
      indices[base + 5] = vertex + 3;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

function circleGeometry(radius: number, segments = 64): THREE.BufferGeometry {
  return new THREE.RingGeometry(radius * 0.94, radius, segments);
}

class ReferenceEffect {
  public readonly group = new THREE.Group();
  public active = false;

  private readonly slashContainer = new THREE.Group();
  private readonly spinContainer = new THREE.Group();
  private readonly jumpContainer = new THREE.Group();
  private readonly hitContainer = new THREE.Group();
  private readonly slashRibbons: THREE.Mesh[] = [];
  private readonly spinRibbons: THREE.Mesh[] = [];
  private readonly jumpRibbons: THREE.Mesh[] = [];
  private readonly slashMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly spinMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly jumpMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly hitRing: THREE.Mesh;
  private readonly landingRingA: THREE.Mesh;
  private readonly landingRingB: THREE.Mesh;
  private readonly flare: THREE.Sprite;
  private readonly glow: THREE.Sprite;
  private readonly bladeSprite: THREE.Sprite;
  private readonly groundSprite: THREE.Sprite;
  private readonly impactSprite: THREE.Sprite;
  private readonly shards: THREE.LineSegments;
  private readonly shardGeometry = new THREE.BufferGeometry();
  private readonly shardPositions = new Float32Array(SHARD_COUNT * 2 * 3);
  private readonly debris: THREE.Points;
  private readonly debrisGeometry = new THREE.BufferGeometry();
  private readonly debrisPositions = new Float32Array(DEBRIS_COUNT * 3);
  private readonly debrisVelocities = new Float32Array(DEBRIS_COUNT * 3);
  private readonly core: THREE.Mesh;
  private readonly resources: THREE.Object3D[] = [];

  private kind: ReferenceKind = 'slash';
  private style = STYLES.ataque_basico;
  private attackId: WarriorAttackId = 'ataque_basico';
  private age = 0;
  private baseScale = 1;
  private hitIndex = 0;
  private readonly forward = new THREE.Vector3(0, 0, 1);

  public constructor() {
    this.group.name = 'WarriorReferenceVFX';
    this.group.visible = false;
    this.group.frustumCulled = false;

    this.slashContainer.name = 'ReferenceVerticalSlash';
    this.spinContainer.name = 'ReferenceHorizontalSpin';
    this.jumpContainer.name = 'ReferenceJumpImpact';
    this.hitContainer.name = 'ReferenceTargetHit';

    const verticalSpecs = [
      [0.72, 0.82, 0.15],
      [0.8, 0.9, 0.09],
      [0.88, 0.98, 0.045],
    ] as const;
    for (const [radiusX, radiusY, width] of verticalSpecs) {
      const mesh = new THREE.Mesh(
        verticalRibbon(radiusX, radiusY, -1.3, 1.3, width),
        material(0xffffff, 0)
      );
      mesh.frustumCulled = false;
      this.slashRibbons.push(mesh);
      this.slashMaterials.push(mesh.material as THREE.MeshBasicMaterial);
      this.slashContainer.add(mesh);
      this.resources.push(mesh);
    }

    const horizontalSpecs = [
      [1, 0.06],
      [1, 0.026],
      [1, 0.01],
    ] as const;
    for (const [, width] of horizontalSpecs) {
      const mesh = new THREE.Mesh(
        horizontalRibbon(1, -2.55, 2.55, width),
        material(0xffffff, 0)
      );
      mesh.frustumCulled = false;
      this.spinRibbons.push(mesh);
      this.spinMaterials.push(mesh.material as THREE.MeshBasicMaterial);
      this.spinContainer.add(mesh);
      this.resources.push(mesh);
    }

    const jumpSpecs = [
      [1.42, 1.52, 0.2],
      [1.54, 1.68, 0.1],
      [1.66, 1.82, 0.048],
    ] as const;
    for (const [radiusX, radiusY, width] of jumpSpecs) {
      const mesh = new THREE.Mesh(
        verticalRibbon(radiusX, radiusY, -1.36, 1.36, width),
        material(0xffffff, 0)
      );
      mesh.frustumCulled = false;
      this.jumpRibbons.push(mesh);
      this.jumpMaterials.push(mesh.material as THREE.MeshBasicMaterial);
      this.jumpContainer.add(mesh);
      this.resources.push(mesh);
    }
    this.jumpContainer.position.y = 1.45;
    this.spinContainer.position.y = 0.07;

    this.hitRing = new THREE.Mesh(circleGeometry(0.45), material(0xffffff, 0));
    this.hitRing.rotation.x = -Math.PI * 0.5;
    this.hitContainer.add(this.hitRing);
    this.resources.push(this.hitRing);

    this.landingRingA = new THREE.Mesh(circleGeometry(1), material(0xffffff, 0));
    this.landingRingB = new THREE.Mesh(circleGeometry(1), material(0xffffff, 0));
    this.landingRingA.rotation.x = -Math.PI * 0.5;
    this.landingRingB.rotation.x = -Math.PI * 0.5;
    this.landingRingA.position.y = -1.45;
    this.landingRingB.position.y = -1.45;
    this.jumpContainer.add(this.landingRingA, this.landingRingB);
    this.resources.push(this.landingRingA, this.landingRingB);

    const glowMaterial = new THREE.SpriteMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const flareMaterial = glowMaterial.clone();
    this.glow = new THREE.Sprite(glowMaterial);
    this.flare = new THREE.Sprite(flareMaterial);
    this.glow.name = 'ReferenceSoftGlow';
    this.flare.name = 'ReferenceImpactFlare';
    this.glow.renderOrder = 90;
    this.flare.renderOrder = 91;
    const bladeSpriteMaterial = glowMaterial.clone();
    const groundSpriteMaterial = glowMaterial.clone();
    this.bladeSprite = new THREE.Sprite(bladeSpriteMaterial);
    this.groundSprite = new THREE.Sprite(groundSpriteMaterial);
    const impactSpriteMaterial = glowMaterial.clone();
    this.impactSprite = new THREE.Sprite(impactSpriteMaterial);
    this.bladeSprite.name = 'ReferenceBladeTexture';
    this.groundSprite.name = 'ReferenceGroundWaveTexture';
    this.impactSprite.name = 'ReferenceImpactBurstTexture';
    this.bladeSprite.renderOrder = 89;
    this.groundSprite.renderOrder = 88;
    this.impactSprite.renderOrder = 87;
    this.resources.push(
      this.glow,
      this.flare,
      this.bladeSprite,
      this.groundSprite,
      this.impactSprite
    );

    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), material(0xffffff, 0));
    this.core.name = 'ReferenceImpactCore';
    this.core.renderOrder = 92;
    this.resources.push(this.core);

    this.shards = new THREE.LineSegments(this.shardGeometry, lineMaterial(0xffffff, 0));
    this.shards.name = 'ReferenceEnergyShards';
    this.shards.renderOrder = 93;
    this.shardGeometry.setAttribute('position', new THREE.BufferAttribute(this.shardPositions, 3));
    this.resources.push(this.shards);

    this.debris = new THREE.Points(
      this.debrisGeometry,
      new THREE.PointsMaterial({
        color: 0x061323,
        size: 0.07,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: true,
        toneMapped: false,
      })
    );
    this.debris.name = 'ReferenceDarkDebris';
    this.debrisGeometry.setAttribute('position', new THREE.BufferAttribute(this.debrisPositions, 3));
    this.resources.push(this.debris);

    this.slashContainer.position.y = 1.08;
    this.hitContainer.position.y = 0.9;
    this.group.add(
      this.slashContainer,
      this.spinContainer,
      this.jumpContainer,
      this.hitContainer,
      this.groundSprite,
      this.bladeSprite,
      this.glow,
      this.flare,
      this.core,
      this.impactSprite,
      this.shards,
      this.debris
    );
  }

  public setTextures(
    glowTexture: THREE.Texture,
    flareTexture: THREE.Texture,
    slashTexture: THREE.Texture,
    groundTexture: THREE.Texture,
    impactTexture: THREE.Texture
  ): void {
    const glowMaterial = this.glow.material as THREE.SpriteMaterial;
    glowMaterial.map = glowTexture;
    glowMaterial.needsUpdate = true;
    const flareMaterial = this.flare.material as THREE.SpriteMaterial;
    flareMaterial.map = flareTexture;
    flareMaterial.needsUpdate = true;
    const bladeMaterial = this.bladeSprite.material as THREE.SpriteMaterial;
    bladeMaterial.map = slashTexture;
    bladeMaterial.needsUpdate = true;
    const groundMaterial = this.groundSprite.material as THREE.SpriteMaterial;
    groundMaterial.map = groundTexture;
    groundMaterial.needsUpdate = true;
    const impactMaterial = this.impactSprite.material as THREE.SpriteMaterial;
    impactMaterial.map = impactTexture;
    impactMaterial.needsUpdate = true;
  }

  public playAttack(
    attackId: WarriorAttackId,
    origin: THREE.Vector3,
    forward: THREE.Vector3,
    hitIndex = 0
  ): void {
    this.start(attackId, origin, forward, hitIndex, 1, false);
  }

  public playHit(
    attackId: WarriorAttackId,
    position: THREE.Vector3,
    hitIndex = 0,
    scale = 1
  ): void {
    this.start(attackId, position, new THREE.Vector3(0, 0, 1), hitIndex, Math.max(0.65, scale * 0.7), true);
  }

  private start(
    attackId: WarriorAttackId,
    origin: THREE.Vector3,
    forward: THREE.Vector3,
    hitIndex: number,
    scale: number,
    hit: boolean
  ): void {
    this.active = true;
    this.attackId = attackId;
    this.style = STYLES[attackId];
    this.kind = hit ? 'hit' : this.style.kind;
    this.age = 0;
    this.baseScale = scale;
    this.hitIndex = hitIndex;
    this.forward.copy(forward).setY(0);
    if (this.forward.lengthSq() <= 1e-8) this.forward.set(0, 0, 1);
    this.forward.normalize();
    this.group.position.copy(origin);
    this.group.rotation.y = Math.atan2(this.forward.x, this.forward.z);
    this.group.visible = true;
    this.slashContainer.visible = this.kind === 'slash';
    this.spinContainer.visible = this.kind === 'spin';
    this.jumpContainer.visible = this.kind === 'jump';
    this.hitContainer.visible = this.kind === 'hit';
    this.shards.visible = true;
    this.debris.visible = true;
    this.glow.visible = true;
    this.flare.visible = true;
    this.bladeSprite.visible = this.kind === 'slash' || this.kind === 'jump';
    this.groundSprite.visible = this.kind === 'spin' || this.kind === 'jump';
    this.impactSprite.visible = this.kind === 'jump' || this.kind === 'hit';
    this.core.visible = this.kind === 'jump' || this.kind === 'hit';
    this.bladeSprite.position.set(0, this.kind === 'jump' ? 1.45 : 1.08, this.kind === 'jump' ? 0 : 0.45);
    this.groundSprite.position.y = this.kind === 'jump' ? 0.04 : 0.09;
    this.impactSprite.position.set(0, this.kind === 'jump' ? 0.56 : 0.9, 0.06);
    this.configureColors();
    this.resetDynamicState();
  }

  private configureColors(): void {
    const set = (materials: readonly THREE.MeshBasicMaterial[]): void => {
      materials.forEach((entry, index) => {
        entry.color.set(index === 0 ? this.style.primary : index === 1 ? this.style.secondary : this.style.accent);
        entry.opacity = index === 0 ? 0.98 : index === 1 ? 0.72 : 0.5;
      });
    };
    set(this.slashMaterials);
    set(this.spinMaterials);
    set(this.jumpMaterials);
    (this.hitRing.material as THREE.MeshBasicMaterial).color.set(this.style.secondary);
    (this.landingRingA.material as THREE.MeshBasicMaterial).color.set(this.style.secondary);
    (this.landingRingB.material as THREE.MeshBasicMaterial).color.set(this.style.primary);
    (this.shards.material as THREE.LineBasicMaterial).color.set(this.style.accent);
    (this.debris.material as THREE.PointsMaterial).color.set(0x071426);
    (this.glow.material as THREE.SpriteMaterial).color.set(this.style.secondary);
    (this.flare.material as THREE.SpriteMaterial).color.set(this.style.primary);
    (this.bladeSprite.material as THREE.SpriteMaterial).color.set(this.style.primary);
    (this.groundSprite.material as THREE.SpriteMaterial).color.set(this.style.secondary);
    (this.impactSprite.material as THREE.SpriteMaterial).color.set(this.style.primary);
    (this.core.material as THREE.MeshBasicMaterial).color.set(this.style.primary);
  }

  private resetDynamicState(): void {
    this.slashContainer.scale.setScalar(this.baseScale);
    this.spinContainer.scale.setScalar(0.05 * this.baseScale);
    this.jumpContainer.scale.setScalar(this.baseScale);
    this.hitContainer.scale.setScalar(this.baseScale);
    this.glow.scale.setScalar(this.baseScale * (this.kind === 'spin' ? 2.2 : 1.25));
    this.flare.scale.setScalar(this.baseScale * (this.kind === 'jump' ? 1.4 : 0.72));
    this.bladeSprite.scale.set(
      this.baseScale * (this.kind === 'jump' ? 4.2 : 2.35),
      this.baseScale * (this.kind === 'jump' ? 3.6 : 2.35),
      1
    );
    this.groundSprite.scale.set(
      this.baseScale * (this.kind === 'jump' ? 5.4 : 4.6),
      this.baseScale * (this.kind === 'jump' ? 2.2 : 1.55),
      1
    );
    this.impactSprite.scale.set(
      this.baseScale * (this.kind === 'jump' ? 3.2 : 1.9),
      this.baseScale * (this.kind === 'jump' ? 3.2 : 1.9),
      1
    );
    this.core.scale.setScalar(this.baseScale);
    this.landingRingA.scale.setScalar(0.06);
    this.landingRingB.scale.setScalar(0.06);
    this.hitRing.scale.setScalar(0.06);
    (this.shards.material as THREE.LineBasicMaterial).opacity = 0.96;
    (this.debris.material as THREE.PointsMaterial).opacity = 0.82;
    for (let index = 0; index < DEBRIS_COUNT; index += 1) {
      const offset = index * 3;
      const angle = index * 2.399 + this.hitIndex * 0.37;
      const radius = 0.12 + (index % 5) * 0.05;
      this.debrisPositions[offset] = Math.cos(angle) * radius;
      this.debrisPositions[offset + 1] = (index % 7) * 0.05;
      this.debrisPositions[offset + 2] = Math.sin(angle) * radius;
      this.debrisVelocities[offset] = Math.cos(angle) * (0.7 + (index % 4) * 0.22);
      this.debrisVelocities[offset + 1] = 0.25 + (index % 5) * 0.12;
      this.debrisVelocities[offset + 2] = Math.sin(angle) * (0.7 + (index % 4) * 0.22);
    }
    (this.debrisGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  public update(delta: number): boolean {
    if (!this.active) return false;
    const elapsed = Math.max(0, Number.isFinite(delta) ? delta : 0);
    this.age += elapsed;
    const progress = THREE.MathUtils.clamp(this.age / this.style.duration, 0, 1);
    const fade = Math.max(0, 1 - smooth(progress));

    if (this.kind === 'slash') {
      this.group.position.addScaledVector(this.forward, this.style.speed * elapsed);
      this.slashContainer.scale.set(
        this.baseScale * (0.92 + smooth(progress) * 0.3),
        this.baseScale * (0.96 + smooth(progress) * 0.2),
        this.baseScale
      );
      this.glow.position.z = 0.15 + progress * 0.9;
      this.glow.scale.setScalar(this.baseScale * (1.1 + progress * 0.9));
      this.bladeSprite.position.z = 0.35 + progress * 0.72;
      this.bladeSprite.scale.set(
        this.baseScale * (2.1 + progress * 0.75),
        this.baseScale * (2.05 + progress * 0.55),
        1
      );
      this.bladeSprite.material.rotation = (this.hitIndex % 2 === 0 ? -0.08 : 0.08) + progress * 0.1;
    } else if (this.kind === 'spin') {
      const radius = Math.max(0.06, this.style.maxRadius * smooth(progress));
      this.spinContainer.scale.setScalar(radius * this.baseScale);
      this.spinContainer.rotation.y += elapsed * 1.9;
      this.groundSprite.scale.set(
        this.baseScale * (1.7 + progress * 4.8),
        this.baseScale * (0.65 + progress * 1.5),
        1
      );
      this.glow.position.y = 0.22;
      this.glow.scale.setScalar(this.baseScale * (1.2 + progress * 2.8));
    } else if (this.kind === 'jump') {
      this.jumpContainer.scale.setScalar(this.baseScale * (0.82 + smooth(progress) * 0.3));
      this.jumpContainer.rotation.y += elapsed * 1.35;
      const ringScale = this.style.maxRadius * smooth(progress);
      this.landingRingA.scale.setScalar(Math.max(0.06, ringScale));
      this.landingRingB.scale.setScalar(Math.max(0.06, ringScale * 0.72));
      this.groundSprite.scale.set(
        this.baseScale * (2.2 + progress * 4.6),
        this.baseScale * (0.85 + progress * 1.5),
        1
      );
      this.glow.position.y = 0.15;
      this.glow.scale.setScalar(this.baseScale * (1.7 + progress * 2.2));
      this.flare.scale.setScalar(this.baseScale * (1.1 + progress * 2.1));
      this.impactSprite.scale.set(
        this.baseScale * (0.35 + smooth(progress) * 3.7),
        this.baseScale * (0.35 + smooth(progress) * 3.7),
        1
      );
      this.impactSprite.material.rotation = progress * 0.24;
    } else {
      const ringScale = 0.2 + smooth(progress) * 1.35;
      this.hitContainer.scale.setScalar(this.baseScale * ringScale);
      this.impactSprite.scale.set(
        this.baseScale * (0.2 + smooth(progress) * 1.7),
        this.baseScale * (0.2 + smooth(progress) * 1.7),
        1
      );
      this.impactSprite.material.rotation = -progress * 0.18;
      this.glow.scale.setScalar(this.baseScale * (0.75 + progress * 1.15));
      this.flare.scale.setScalar(this.baseScale * (0.55 + progress * 0.85));
    }

    this.updateShards(progress);
    this.updateDebris(elapsed, fade);
    const pulse = 0.88 + Math.sin(this.age * 38) * 0.12;
    this.setFade(fade, pulse);

    if (this.age < this.style.duration) return true;
    this.reset();
    return false;
  }

  private updateShards(progress: number): void {
    const radius = this.kind === 'jump' ? 0.7 + progress * 2.4 : this.kind === 'hit' ? 0.2 + progress * 1.2 : 0.3 + progress * 1.5;
    const vertical = this.kind === 'spin' ? 0.08 : this.kind === 'jump' ? 0.12 : 0.72;
    for (let index = 0; index < SHARD_COUNT; index += 1) {
      const angle = index * 2.399 + this.hitIndex * 0.19;
      const spread = radius * (0.65 + (index % 4) * 0.1);
      const start = index * 6;
      this.shardPositions[start] = Math.cos(angle) * spread * 0.16;
      this.shardPositions[start + 1] = vertical * ((index % 3) - 1) * 0.35;
      this.shardPositions[start + 2] = Math.sin(angle) * spread * 0.16;
      this.shardPositions[start + 3] = Math.cos(angle) * spread;
      this.shardPositions[start + 4] = vertical + Math.sin(angle * 1.7) * vertical;
      this.shardPositions[start + 5] = Math.sin(angle) * spread;
    }
    (this.shardGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateDebris(delta: number, fade: number): void {
    for (let index = 0; index < DEBRIS_COUNT; index += 1) {
      const offset = index * 3;
      this.debrisPositions[offset] += this.debrisVelocities[offset] * delta;
      this.debrisPositions[offset + 1] += this.debrisVelocities[offset + 1] * delta;
      this.debrisPositions[offset + 2] += this.debrisVelocities[offset + 2] * delta;
      this.debrisVelocities[offset + 1] -= delta * 2.4;
    }
    (this.debrisGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.debris.material as THREE.PointsMaterial).opacity = fade * 0.82;
  }

  private setFade(fade: number, pulse: number): void {
    const apply = (materials: readonly THREE.MeshBasicMaterial[]): void => {
      materials.forEach((entry, index) => {
        entry.opacity = fade * (index === 0 ? 0.98 : index === 1 ? 0.72 : 0.5) * pulse;
      });
    };
    apply(this.slashMaterials);
    apply(this.spinMaterials);
    apply(this.jumpMaterials);
    (this.hitRing.material as THREE.MeshBasicMaterial).opacity = fade * 0.9;
    (this.landingRingA.material as THREE.MeshBasicMaterial).opacity = fade * 0.9;
    (this.landingRingB.material as THREE.MeshBasicMaterial).opacity = fade * 0.62;
    (this.glow.material as THREE.SpriteMaterial).opacity = fade * 0.72 * pulse;
    (this.flare.material as THREE.SpriteMaterial).opacity = fade * 0.88 * pulse;
    (this.bladeSprite.material as THREE.SpriteMaterial).opacity = fade * (this.kind === 'jump' ? 0.82 : 0.74) * pulse;
    (this.groundSprite.material as THREE.SpriteMaterial).opacity = fade * (this.kind === 'jump' ? 0.76 : 0.6) * pulse;
    (this.impactSprite.material as THREE.SpriteMaterial).opacity = fade * (this.kind === 'jump' ? 0.9 : 0.72) * pulse;
    (this.core.material as THREE.MeshBasicMaterial).opacity = fade * 0.92;
    (this.shards.material as THREE.LineBasicMaterial).opacity = fade * 0.92;
  }

  public reset(): void {
    this.active = false;
    this.group.visible = false;
    this.age = 0;
    this.slashContainer.visible = false;
    this.spinContainer.visible = false;
    this.jumpContainer.visible = false;
    this.hitContainer.visible = false;
    this.shards.visible = false;
    this.debris.visible = false;
    this.glow.visible = false;
    this.flare.visible = false;
    this.bladeSprite.visible = false;
    this.groundSprite.visible = false;
    this.impactSprite.visible = false;
    this.core.visible = false;
    this.setFade(0, 1);
  }

  public dispose(): void {
    this.reset();
    for (const resource of this.resources) {
      const mesh = resource as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = (resource as THREE.Mesh).material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else if (material) material.dispose();
    }
    this.shardGeometry.dispose();
    this.debrisGeometry.dispose();
    this.core.geometry.dispose();
    (this.core.material as THREE.Material).dispose();
    this.group.clear();
  }

}

type ScreenPulse = 'slash' | 'impact';

class WarriorScreenFx {
  private readonly element: HTMLElement | null;

  public constructor() {
    if (typeof document === 'undefined') {
      this.element = null;
      return;
    }
    const element = document.createElement('div');
    element.className = 'warrior-vfx-screen';
    element.setAttribute('aria-hidden', 'true');
    document.body.appendChild(element);
    this.element = element;
  }

  public pulse(kind: ScreenPulse): void {
    if (!this.element) return;
    this.element.classList.remove('is-slash', 'is-impact');
    // Force the animation to restart for consecutive hits in a combo.
    void this.element.offsetWidth;
    this.element.classList.add(kind === 'impact' ? 'is-impact' : 'is-slash');
  }

  public dispose(): void {
    this.element?.remove();
  }
}

/**
 * Warrior presentation rebuilt around the attached references: broad cyan
 * brush crescents, layered horizontal spin ribbons, white-hot cores, sharp
 * energy shards, and restrained dark debris. It deliberately does not reuse
 * the previous sword trail or disc-like wave effects.
 */
export class WarriorReferenceVFX {
  private readonly pool: ReferenceEffect[] = [];
  private readonly active: ReferenceEffect[] = [];
  private readonly scene: THREE.Scene;
  private readonly onHeavyImpact?: () => void;
  private glowTexture: THREE.Texture | null = null;
  private flareTexture: THREE.Texture | null = null;
  private slashTexture: THREE.Texture | null = null;
  private groundTexture: THREE.Texture | null = null;
  private impactTexture: THREE.Texture | null = null;
  private readonly screenFx = new WarriorScreenFx();

  public constructor(scene: THREE.Scene, onHeavyImpact?: () => void) {
    this.scene = scene;
    this.onHeavyImpact = onHeavyImpact;
    for (let index = 0; index < MAX_EFFECTS; index += 1) {
      this.pool.push(new ReferenceEffect());
    }
  }

  public async loadTextureAssets(
    loader: WarriorReferenceTextureLoader = new THREE.TextureLoader()
  ): Promise<boolean> {
    try {
      const [glow, flare, slash, ground, impact] = await Promise.all([
        loader.loadAsync('/vfx/warrior/soft-glow.png'),
        loader.loadAsync('/vfx/warrior/impact-flare.png'),
        loader.loadAsync('/vfx/warrior/reference-blade-slash.png'),
        loader.loadAsync('/vfx/warrior/reference-ground-wave.png'),
        loader.loadAsync('/vfx/warrior/reference-impact-burst.png'),
      ]);
      configureTexture(glow);
      configureTexture(flare);
      configureTexture(slash);
      configureTexture(ground);
      configureTexture(impact);
      this.glowTexture = glow;
      this.flareTexture = flare;
      this.slashTexture = slash;
      this.groundTexture = ground;
      this.impactTexture = impact;
      this.pool.forEach((effect) => effect.setTextures(glow, flare, slash, ground, impact));
      return true;
    } catch {
      return false;
    }
  }

  public playAttack(
    attackId: WarriorAttackId,
    origin: THREE.Vector3,
    forward: THREE.Vector3,
    hitIndex = 0
  ): void {
    const effect = this.acquire();
    if (!effect) return;
    effect.playAttack(attackId, origin, forward, hitIndex);
    if (attackId === 'pulo_atacando') {
      this.screenFx.pulse('impact');
      this.onHeavyImpact?.();
    } else if (attackId === 'ataque_giratorio_2') {
      this.screenFx.pulse('slash');
    }
  }

  public playHit(
    attackId: WarriorAttackId,
    position: THREE.Vector3,
    hitIndex = 0,
    scale = 1
  ): void {
    const effect = this.acquire();
    if (!effect) return;
    effect.playHit(attackId, position, hitIndex, scale);
  }

  private acquire(): ReferenceEffect | null {
    const effect = this.pool.find((candidate) => !candidate.active);
    if (!effect) return null;
    if (
      this.glowTexture
      && this.flareTexture
      && this.slashTexture
      && this.groundTexture
      && this.impactTexture
    ) {
      effect.setTextures(
        this.glowTexture,
        this.flareTexture,
        this.slashTexture,
        this.groundTexture,
        this.impactTexture
      );
    }
    this.scene.add(effect.group);
    this.active.push(effect);
    return effect;
  }

  public update(delta: number): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const effect = this.active[index];
      if (effect.update(delta)) continue;
      this.active.splice(index, 1);
    }
  }

  public clear(): void {
    this.active.forEach((effect) => effect.reset());
    this.active.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.pool.forEach((effect) => effect.dispose());
    this.pool.length = 0;
    this.glowTexture?.dispose();
    this.flareTexture?.dispose();
    this.slashTexture?.dispose();
    this.groundTexture?.dispose();
    this.impactTexture?.dispose();
    this.glowTexture = null;
    this.flareTexture = null;
    this.slashTexture = null;
    this.groundTexture = null;
    this.impactTexture = null;
    this.screenFx.dispose();
  }

  public get activeCount(): number {
    return this.active.length;
  }
}
