import * as THREE from 'three';
import type { WarriorAttackId } from '../characters/CharacterCatalog';
import {
  getWarriorAttackVfxProfile,
  type WarriorAttackVfxProfile,
} from './WarriorAttackVfxProfiles';

const TRAIL_SEGMENTS = 36;
const POSITION_COMPONENTS_PER_SEGMENT = 6;
const BLADE_BASE_Y = 0.16;
const BLADE_TIP_Y = 1.5;
const STAGE_DIRECTION_SIGNS = [1, -1, 0.62] as const;
const STAGE_DIRECTION_OFFSET = 0.028;
const MAX_SPARKS = 160;
const MAX_SMOKE = 64;
const MAX_FLAMES = 48;

export interface WarriorVfxTextures {
  readonly spark: THREE.Texture;
  readonly smoke: THREE.Texture;
  readonly slash: THREE.Texture;
  readonly impact: THREE.Texture;
  readonly flame: THREE.Texture;
}

export interface WarriorTextureLoader {
  loadAsync(url: string): Promise<THREE.Texture>;
}

/** Fixed-allocation sword trail, glow, spark and smoke effect for WebGL. */
export class SwordTrail {
  public readonly object: THREE.Mesh;

  private readonly root = new THREE.Group();
  private readonly geometry: THREE.BufferGeometry;
  private readonly glowGeometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly glowMaterial: THREE.MeshBasicMaterial;
  private readonly glow: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly glowPositions: Float32Array;
  private readonly positionAttribute: THREE.BufferAttribute;
  private readonly glowPositionAttribute: THREE.BufferAttribute;

  private readonly sparkGeometry = new THREE.BufferGeometry();
  private readonly sparkPositions = new Float32Array(MAX_SPARKS * 3);
  private readonly sparkVelocities = new Float32Array(MAX_SPARKS * 3);
  private readonly sparkLives = new Float32Array(MAX_SPARKS);
  private readonly sparkPositionAttribute = new THREE.BufferAttribute(this.sparkPositions, 3);
  private readonly sparkMaterial = new THREE.PointsMaterial({
    color: 0x2aa8ff,
    size: 0.045,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  private readonly sparks = new THREE.Points(this.sparkGeometry, this.sparkMaterial);

  private readonly smokeGeometry = new THREE.BufferGeometry();
  private readonly smokePositions = new Float32Array(MAX_SMOKE * 3);
  private readonly smokeVelocities = new Float32Array(MAX_SMOKE * 3);
  private readonly smokeLives = new Float32Array(MAX_SMOKE);
  private readonly smokePositionAttribute = new THREE.BufferAttribute(this.smokePositions, 3);
  private readonly smokeMaterial = new THREE.PointsMaterial({
    color: 0x6b526d,
    size: 0.2,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.NormalBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  private readonly smoke = new THREE.Points(this.smokeGeometry, this.smokeMaterial);
  private readonly flameGeometry = new THREE.BufferGeometry();
  private readonly flamePositions = new Float32Array(MAX_FLAMES * 3);
  private readonly flameVelocities = new Float32Array(MAX_FLAMES * 3);
  private readonly flameLives = new Float32Array(MAX_FLAMES);
  private readonly flamePositionAttribute = new THREE.BufferAttribute(this.flamePositions, 3);
  private readonly flameMaterial = new THREE.PointsMaterial({
    color: 0xff6a10,
    size: 0.24,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  private readonly flames = new THREE.Points(this.flameGeometry, this.flameMaterial);
  private readonly impactMaterial = new THREE.SpriteMaterial({
    color: 0xffad16,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly impact = new THREE.Sprite(this.impactMaterial);

  private readonly baseWorld = new THREE.Vector3();
  private readonly tipWorld = new THREE.Vector3();
  private readonly baseLocal = new THREE.Vector3();
  private readonly tipLocal = new THREE.Vector3();
  private readonly coreBaseLocal = new THREE.Vector3();
  private weapon: THREE.Object3D | null = null;
  private blade: THREE.Object3D | null = null;
  private baseAnchor: THREE.Object3D | null = null;
  private tipAnchor: THREE.Object3D | null = null;
  private impactAnchor: THREE.Object3D | null = null;
  private bladeBaseY = BLADE_BASE_Y;
  private bladeTipY = BLADE_TIP_Y;
  private active = false;
  private historyInitialized = false;
  private stageDirection: number = STAGE_DIRECTION_SIGNS[0];
  private profile: WarriorAttackVfxProfile = getWarriorAttackVfxProfile('ataque_basico');
  private sparkCount = 0;
  private smokeCount = 0;
  private flameCount = 0;
  private sparkAccumulator = 0;
  private fadeRemaining = 0;
  private fadeDuration = 0;
  private sequence = 1;
  private impactLife = 0;
  private impactDuration = 0.24;
  private disposed = false;

  public constructor() {
    this.positions = new Float32Array(
      TRAIL_SEGMENTS * POSITION_COMPONENTS_PER_SEGMENT
    );
    this.glowPositions = new Float32Array(
      TRAIL_SEGMENTS * POSITION_COMPONENTS_PER_SEGMENT
    );
    const uvs = new Float32Array(TRAIL_SEGMENTS * 4);
    for (let segment = 0; segment < TRAIL_SEGMENTS; segment += 1) {
      const v = segment / Math.max(1, TRAIL_SEGMENTS - 1);
      const uvOffset = segment * 4;
      uvs[uvOffset] = 0;
      uvs[uvOffset + 1] = v;
      uvs[uvOffset + 2] = 1;
      uvs[uvOffset + 3] = v;
    }

    const indices = new Uint16Array((TRAIL_SEGMENTS - 1) * 6);
    for (let segment = 0; segment < TRAIL_SEGMENTS - 1; segment += 1) {
      const vertex = segment * 2;
      const offset = segment * 6;
      indices[offset] = vertex;
      indices[offset + 1] = vertex + 2;
      indices[offset + 2] = vertex + 1;
      indices[offset + 3] = vertex + 1;
      indices[offset + 4] = vertex + 2;
      indices[offset + 5] = vertex + 3;
    }

    this.geometry = new THREE.BufferGeometry();
    this.glowGeometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    this.glowPositionAttribute = new THREE.BufferAttribute(this.glowPositions, 3);
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.glowGeometry.setAttribute('position', this.glowPositionAttribute);
    this.glowGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs.slice(), 2));
    this.glowGeometry.setIndex(new THREE.BufferAttribute(indices.slice(), 1));

    this.material = new THREE.MeshBasicMaterial({
      color: this.profile.primary,
      transparent: true,
      opacity: this.profile.trailOpacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      toneMapped: false,
    });
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: this.profile.secondary,
      transparent: true,
      opacity: this.profile.glowOpacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      toneMapped: false,
    });
    this.object = new THREE.Mesh(this.geometry, this.material);
    this.object.name = 'RuntimeWarrior_SwordTrail';
    this.object.renderOrder = 80;
    this.glow = new THREE.Mesh(this.glowGeometry, this.glowMaterial);
    this.glow.name = 'RuntimeWarrior_SwordTrailGlow';
    this.glow.renderOrder = 81;
    this.sparks.renderOrder = 82;
    this.smoke.renderOrder = 79;
    this.flames.renderOrder = 83;
    this.impact.renderOrder = 84;

    this.sparkGeometry.setAttribute('position', this.sparkPositionAttribute);
    this.sparkGeometry.setDrawRange(0, 0);
    this.sparks.name = 'RuntimeWarrior_SwordSparks';
    this.smokeGeometry.setAttribute('position', this.smokePositionAttribute);
    this.smokeGeometry.setDrawRange(0, 0);
    this.smoke.name = 'RuntimeWarrior_SwordSmoke';
    this.flameGeometry.setAttribute('position', this.flamePositionAttribute);
    this.flameGeometry.setDrawRange(0, 0);
    this.flames.name = 'RuntimeWarrior_SwordFlames';

    this.impact.name = 'RuntimeWarrior_ImpactFlare';
    for (const renderable of [this.object, this.glow, this.sparks, this.smoke, this.flames, this.impact]) {
      renderable.frustumCulled = false;
      renderable.visible = false;
      this.root.add(renderable);
    }
    this.root.name = 'RuntimeWarrior_AttackVfx';
    this.root.visible = false;
  }

  public get activeParticleCount(): number {
    return this.sparkCount + this.smokeCount + this.flameCount;
  }

  public get isActive(): boolean {
    return this.active;
  }

  public get visualTextures(): {
    readonly spark: THREE.Texture | null;
    readonly smoke: THREE.Texture | null;
    readonly slash: THREE.Texture | null;
    readonly impact: THREE.Texture | null;
    readonly flame: THREE.Texture | null;
  } {
    return {
      spark: this.sparkMaterial.map,
      smoke: this.smokeMaterial.map,
      slash: this.glowMaterial.map,
      impact: this.impactMaterial.map,
      flame: this.flameMaterial.map,
    };
  }

  public setVisualTextures(textures: WarriorVfxTextures): void {
    if (this.disposed) return;
    this.sparkMaterial.map = textures.spark;
    this.sparkMaterial.alphaMap = null;
    this.sparkMaterial.needsUpdate = true;
    this.smokeMaterial.map = textures.smoke;
    this.smokeMaterial.alphaMap = null;
    this.smokeMaterial.needsUpdate = true;
    // Use each texture's RGBA alpha once. Supplying the same bitmap as both
    // map and alphaMap squares its alpha and made the WebGL effect too faint.
    this.material.map = null;
    this.material.alphaMap = null;
    this.material.needsUpdate = true;
    this.glowMaterial.map = textures.slash;
    this.glowMaterial.alphaMap = null;
    this.glowMaterial.needsUpdate = true;
    this.impactMaterial.map = textures.impact;
    this.impactMaterial.alphaMap = null;
    this.impactMaterial.needsUpdate = true;
    this.flameMaterial.map = textures.flame;
    this.flameMaterial.alphaMap = null;
    this.flameMaterial.needsUpdate = true;
  }

  public async loadTextureAssets(
    loader: WarriorTextureLoader = new THREE.TextureLoader()
  ): Promise<boolean> {
    try {
      const [spark, smoke, slash, impact, flame] = await Promise.all([
        loader.loadAsync('/vfx/warrior/soft-glow.png'),
        loader.loadAsync('/vfx/warrior/smoke.png'),
        loader.loadAsync('/vfx/warrior/slash-arc.png'),
        loader.loadAsync('/vfx/warrior/impact-flare.png'),
        loader.loadAsync('/vfx/warrior/flame.png'),
      ]);
      for (const texture of [spark, smoke, slash, impact, flame]) {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
      }
      // Focus the downloaded sprite sheets on their non-transparent pixels.
      // This preserves the licensed source files while avoiding mostly empty
      // point sprites and ribbon UVs at runtime.
      slash.repeat.set(0.82, 0.26);
      slash.offset.set(0.09, 0.38);
      impact.repeat.set(0.48, 0.46);
      impact.offset.set(0.26, 0.27);
      flame.repeat.set(0.22, 0.54);
      flame.offset.set(0.39, 0.23);
      this.setVisualTextures({ spark, smoke, slash, impact, flame });
      return true;
    } catch {
      return false;
    }
  }

  public attach(weapon: THREE.Object3D): void {
    if (this.disposed) return;
    this.detach();
    this.weapon = weapon;
    this.baseAnchor = weapon.getObjectByName('VFX_SwordBase') ?? null;
    this.tipAnchor = weapon.getObjectByName('VFX_SwordTip') ?? null;
    this.impactAnchor = weapon.getObjectByName('VFX_Impact') ?? null;
    this.blade = weapon.getObjectByName('RuntimeWarrior_SwordBlade') ?? null;

    if (!this.baseAnchor || !this.tipAnchor) {
      this.baseAnchor = null;
      this.tipAnchor = null;
      if (!this.blade) {
        this.weapon = null;
        return;
      }
      const mesh = this.blade as THREE.Mesh;
      const bladeGeometry = mesh.geometry as THREE.BufferGeometry | undefined;
      if (bladeGeometry) {
        if (!bladeGeometry.boundingBox) bladeGeometry.computeBoundingBox();
        if (bladeGeometry.boundingBox) {
          this.bladeBaseY = bladeGeometry.boundingBox.min.y;
          this.bladeTipY = bladeGeometry.boundingBox.max.y;
        }
      }
    }
    let stableRoot: THREE.Object3D = weapon;
    while (stableRoot.parent && !(stableRoot.parent as THREE.Scene).isScene) {
      stableRoot = stableRoot.parent;
    }
    stableRoot.add(this.root);
    this.clearAll();
  }

  public detach(): void {
    this.root.removeFromParent();
    this.weapon = null;
    this.blade = null;
    this.baseAnchor = null;
    this.tipAnchor = null;
    this.impactAnchor = null;
    this.active = false;
    this.clearAll();
  }

  public setAttack(id: WarriorAttackId): void {
    if (this.disposed) return;
    this.profile = getWarriorAttackVfxProfile(id);
    this.material.color.setHex(this.profile.primary);
    this.material.opacity = this.profile.trailOpacity * 0.48;
    this.glowMaterial.color.setHex(this.profile.secondary);
    this.glowMaterial.opacity = this.profile.glowOpacity;
    this.sparkMaterial.color.setHex(this.profile.secondary);
    this.sparkMaterial.size = this.profile.sparkSize;
    this.smokeMaterial.color.setHex(id === 'triplo_ataque' ? 0x5b4a47 : 0x70526f);
    this.smokeMaterial.size = this.profile.smokeSize;
    this.flameMaterial.color.setHex(this.profile.secondary);
    this.flameMaterial.size = this.profile.fire ? 0.78 : 0.3;
    this.impactMaterial.color.setHex(this.profile.secondary);
    this.clearAll();
  }

  public setActive(active: boolean): void {
    if (this.disposed) return;
    const wasActive = this.active;
    this.active = active && this.weapon !== null && (
      (this.baseAnchor !== null && this.tipAnchor !== null) || this.blade !== null
    );
    if (this.active) {
      this.fadeRemaining = 0;
      this.fadeDuration = 0;
      this.material.opacity = this.profile.trailOpacity * 0.48;
      this.glowMaterial.opacity = this.profile.glowOpacity;
    }
    if (this.active && !wasActive) this.historyInitialized = false;
    this.object.visible = this.active;
    this.glow.visible = this.active;
    if (!this.active) this.clearAll();
    else this.root.visible = true;
  }

  public beginFade(seconds: number): void {
    if (this.disposed) return;
    const duration = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    this.active = false;
    if (duration === 0) {
      this.clearAll();
      return;
    }
    this.fadeDuration = duration;
    this.fadeRemaining = duration;
    this.object.visible = true;
    this.glow.visible = true;
    this.root.visible = true;
  }

  public clear(): void {
    if (this.disposed) return;
    this.clearAll();
  }

  public setStageDirection(stage: number): void {
    const safeStage = Number.isFinite(stage) ? Math.trunc(stage) : 0;
    const clamped = THREE.MathUtils.clamp(safeStage, 0, STAGE_DIRECTION_SIGNS.length - 1);
    this.stageDirection = STAGE_DIRECTION_SIGNS[clamped];
  }

  public burst(): void {
    if (this.disposed || !this.weapon) return;
    this.sampleBlade();
    const sparks = Math.min(this.profile.sparkCount, this.profile.impact ? 28 : 16);
    for (let index = 0; index < sparks; index += 1) this.spawnSpark(true);
    const smoke = Math.min(this.profile.smokeCount, this.profile.impact ? 8 : 5);
    for (let index = 0; index < smoke; index += 1) this.spawnSmoke(true);
    const flames = Math.min(this.profile.flameCount, this.profile.fire ? 48 : 0);
    for (let index = 0; index < flames; index += 1) this.spawnFlame(true);
    this.placeImpact();
    this.impactDuration = this.profile.impact ? 0.72 : 0.48;
    this.impactLife = this.impactDuration;
    this.impact.scale.setScalar(this.profile.impact ? 1.9 : this.profile.fire ? 1.35 : 1.05);
    this.impactMaterial.opacity = this.profile.impact ? 0.88 : 0.68;
    this.impact.visible = true;
    this.updateDrawRanges();
  }

  public update(delta = 1 / 60): void {
    if (this.disposed) return;
    const elapsed = Number.isFinite(delta) && delta > 0 ? delta : 0;
    const simulationStep = Math.min(elapsed, 0.1);
    if (this.active && this.weapon) {
      this.sampleBlade();
      this.updateRibbon();
      this.sparkAccumulator += this.profile.sparkRate * simulationStep;
      while (this.sparkAccumulator >= 1) {
        this.spawnSpark(false);
        this.sparkAccumulator -= 1;
      }
      if (this.profile.smokeCount > 0 && this.sequence % 3 === 0) {
        this.spawnSmoke(false);
      }
      if (this.profile.fire && this.sequence % 2 === 0) this.spawnFlame(false);
    }
    if (!this.active && this.fadeRemaining > 0) {
      this.fadeRemaining = Math.max(0, this.fadeRemaining - elapsed);
      const factor = this.fadeDuration > 0 ? this.fadeRemaining / this.fadeDuration : 0;
      this.material.opacity = this.profile.trailOpacity * 0.48 * factor;
      this.glowMaterial.opacity = this.profile.glowOpacity * factor;
      this.sparkMaterial.opacity = 0.92 * Math.max(0.2, factor);
      this.smokeMaterial.opacity = 0.34 * Math.max(0.25, factor);
      this.flameMaterial.opacity = 0.9 * Math.max(0.2, factor);
      if (this.fadeRemaining === 0) this.clearAll();
    }
    this.updateParticles(simulationStep);
    if (this.impactLife > 0) {
      this.impactLife = Math.max(0, this.impactLife - elapsed);
      const factor = this.impactDuration > 0 ? this.impactLife / this.impactDuration : 0;
      this.impactMaterial.opacity = factor * (this.profile.impact ? 0.88 : 0.68);
      const baseScale = this.profile.impact ? 1.9 : this.profile.fire ? 1.35 : 1.05;
      const scale = baseScale * (1.35 - factor * 0.35);
      this.impact.scale.setScalar(scale);
      this.impact.visible = this.impactLife > 0;
    }
    this.updateDrawRanges();
    this.root.visible =
      this.active ||
      this.fadeRemaining > 0 ||
      this.impactLife > 0 ||
      this.activeParticleCount > 0;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.detach();
    this.disposed = true;
    this.geometry.dispose();
    this.glowGeometry.dispose();
    this.sparkGeometry.dispose();
    this.smokeGeometry.dispose();
    this.flameGeometry.dispose();
    this.material.dispose();
    this.glowMaterial.dispose();
    this.sparkMaterial.dispose();
    this.smokeMaterial.dispose();
    this.flameMaterial.dispose();
    this.impactMaterial.dispose();
    this.root.clear();
  }

  private sampleBlade(): void {
    if (!this.weapon) return;
    this.weapon.updateMatrixWorld(true);
    if (this.baseAnchor && this.tipAnchor) {
      this.baseWorld.set(0, 0, 0);
      this.tipWorld.set(0, 0, 0);
      this.baseAnchor.localToWorld(this.baseWorld);
      this.tipAnchor.localToWorld(this.tipWorld);
    } else if (this.blade) {
      this.baseWorld.set(0, this.bladeBaseY, 0);
      this.tipWorld.set(0, this.bladeTipY, 0);
      this.blade.localToWorld(this.baseWorld);
      this.blade.localToWorld(this.tipWorld);
    } else {
      return;
    }
    this.root.worldToLocal(this.baseWorld);
    this.root.worldToLocal(this.tipWorld);
    this.baseLocal.copy(this.baseWorld);
    this.tipLocal.copy(this.tipWorld);
    this.baseLocal.x += this.stageDirection * STAGE_DIRECTION_OFFSET;
    this.tipLocal.x -= this.stageDirection * STAGE_DIRECTION_OFFSET;
  }

  private placeImpact(): void {
    if (!this.weapon) return;
    if (this.impactAnchor) {
      const world = new THREE.Vector3();
      this.impactAnchor.localToWorld(world);
      this.root.worldToLocal(world);
      this.impact.position.copy(world);
      return;
    }
    this.impact.position.copy(this.tipLocal);
  }

  private updateRibbon(): void {
    if (!this.historyInitialized) {
      for (let segment = 0; segment < TRAIL_SEGMENTS; segment += 1) {
        this.writeRibbonSample(segment, this.baseLocal, this.tipLocal);
      }
      this.historyInitialized = true;
    } else {
      for (let segment = TRAIL_SEGMENTS - 1; segment > 0; segment -= 1) {
        const destination = segment * POSITION_COMPONENTS_PER_SEGMENT;
        const source = destination - POSITION_COMPONENTS_PER_SEGMENT;
        for (let component = 0; component < POSITION_COMPONENTS_PER_SEGMENT; component += 1) {
          this.positions[destination + component] = this.positions[source + component];
          this.glowPositions[destination + component] = this.glowPositions[source + component];
        }
      }
      this.writeRibbonSample(0, this.baseLocal, this.tipLocal);
    }
    this.positionAttribute.needsUpdate = true;
    this.glowPositionAttribute.needsUpdate = true;
    this.object.visible = true;
    this.glow.visible = true;
  }

  private writeRibbonSample(segment: number, base: THREE.Vector3, tip: THREE.Vector3): void {
    const offset = segment * POSITION_COMPONENTS_PER_SEGMENT;
    this.coreBaseLocal.copy(base).lerp(tip, 0.58);
    this.positions[offset] = this.coreBaseLocal.x;
    this.positions[offset + 1] = this.coreBaseLocal.y;
    this.positions[offset + 2] = this.coreBaseLocal.z;
    this.positions[offset + 3] = tip.x;
    this.positions[offset + 4] = tip.y;
    this.positions[offset + 5] = tip.z;
    this.glowPositions[offset] = base.x;
    this.glowPositions[offset + 1] = base.y;
    this.glowPositions[offset + 2] = base.z;
    this.glowPositions[offset + 3] = tip.x;
    this.glowPositions[offset + 4] = tip.y;
    this.glowPositions[offset + 5] = tip.z;
  }

  private spawnSpark(burst: boolean): void {
    if (this.sparkCount >= this.profile.sparkCount || this.sparkCount >= MAX_SPARKS) return;
    const index = this.sparkCount++;
    const offset = index * 3;
    const seed = this.sequence++;
    const t = this.noise(seed, 1);
    this.sparkPositions[offset] = this.baseLocal.x + (this.tipLocal.x - this.baseLocal.x) * t;
    this.sparkPositions[offset + 1] = this.baseLocal.y + (this.tipLocal.y - this.baseLocal.y) * t;
    this.sparkPositions[offset + 2] = this.baseLocal.z + (this.tipLocal.z - this.baseLocal.z) * t;
    const speed = burst ? 0.9 : 0.42;
    this.sparkVelocities[offset] = (this.noise(seed, 2) - 0.5) * speed;
    this.sparkVelocities[offset + 1] = (0.2 + this.noise(seed, 3)) * speed;
    this.sparkVelocities[offset + 2] = (this.noise(seed, 4) - 0.5) * speed;
    this.sparkLives[index] = this.profile.sparkLife * (0.62 + this.noise(seed, 5) * 0.6);
  }

  private spawnSmoke(burst: boolean): void {
    if (this.smokeCount >= this.profile.smokeCount || this.smokeCount >= MAX_SMOKE) return;
    const index = this.smokeCount++;
    const offset = index * 3;
    const seed = this.sequence++;
    const t = this.noise(seed, 6);
    this.smokePositions[offset] = this.baseLocal.x + (this.tipLocal.x - this.baseLocal.x) * t;
    this.smokePositions[offset + 1] = this.baseLocal.y + (this.tipLocal.y - this.baseLocal.y) * t;
    this.smokePositions[offset + 2] = this.baseLocal.z + (this.tipLocal.z - this.baseLocal.z) * t;
    const spread = burst ? 0.25 : 0.12;
    this.smokeVelocities[offset] = (this.noise(seed, 7) - 0.5) * spread;
    this.smokeVelocities[offset + 1] = 0.08 + this.noise(seed, 8) * 0.16;
    this.smokeVelocities[offset + 2] = (this.noise(seed, 9) - 0.5) * spread;
    this.smokeLives[index] = 0.55 + this.noise(seed, 10) * 0.45;
  }

  private spawnFlame(burst: boolean): void {
    if (this.flameCount >= this.profile.flameCount || this.flameCount >= MAX_FLAMES) return;
    const index = this.flameCount++;
    const offset = index * 3;
    const seed = this.sequence++;
    const t = this.noise(seed, 11);
    this.flamePositions[offset] = this.baseLocal.x + (this.tipLocal.x - this.baseLocal.x) * t;
    this.flamePositions[offset + 1] = this.baseLocal.y + (this.tipLocal.y - this.baseLocal.y) * t;
    this.flamePositions[offset + 2] = this.baseLocal.z + (this.tipLocal.z - this.baseLocal.z) * t;
    const spread = burst ? 0.52 : 0.24;
    this.flameVelocities[offset] = (this.noise(seed, 12) - 0.5) * spread;
    this.flameVelocities[offset + 1] = 0.22 + this.noise(seed, 13) * 0.42;
    this.flameVelocities[offset + 2] = (this.noise(seed, 14) - 0.5) * spread;
    this.flameLives[index] = 0.48 + this.noise(seed, 15) * 0.62;
  }

  private updateParticles(delta: number): void {
    let index = 0;
    while (index < this.sparkCount) {
      this.sparkLives[index] -= delta;
      if (this.sparkLives[index] <= 0) {
        this.removeParticle(index, true);
        continue;
      }
      const offset = index * 3;
      this.sparkPositions[offset] += this.sparkVelocities[offset] * delta;
      this.sparkPositions[offset + 1] += this.sparkVelocities[offset + 1] * delta;
      this.sparkPositions[offset + 2] += this.sparkVelocities[offset + 2] * delta;
      this.sparkVelocities[offset + 1] -= 0.5 * delta;
      index += 1;
    }

    index = 0;
    while (index < this.smokeCount) {
      this.smokeLives[index] -= delta;
      if (this.smokeLives[index] <= 0) {
        this.removeParticle(index, false);
        continue;
      }
      const offset = index * 3;
      this.smokePositions[offset] += this.smokeVelocities[offset] * delta;
      this.smokePositions[offset + 1] += this.smokeVelocities[offset + 1] * delta;
      this.smokePositions[offset + 2] += this.smokeVelocities[offset + 2] * delta;
      index += 1;
    }

    index = 0;
    while (index < this.flameCount) {
      this.flameLives[index] -= delta;
      if (this.flameLives[index] <= 0) {
        this.removeParticle(index, 'flame');
        continue;
      }
      const offset = index * 3;
      this.flamePositions[offset] += this.flameVelocities[offset] * delta;
      this.flamePositions[offset + 1] += this.flameVelocities[offset + 1] * delta;
      this.flamePositions[offset + 2] += this.flameVelocities[offset + 2] * delta;
      index += 1;
    }
  }

  private removeParticle(index: number, kind: boolean | 'flame'): void {
    const count = kind === true
      ? --this.sparkCount
      : kind === 'flame'
        ? --this.flameCount
        : --this.smokeCount;
    if (index >= count) return;
    const positions = kind === true ? this.sparkPositions : kind === 'flame' ? this.flamePositions : this.smokePositions;
    const velocities = kind === true ? this.sparkVelocities : kind === 'flame' ? this.flameVelocities : this.smokeVelocities;
    const lives = kind === true ? this.sparkLives : kind === 'flame' ? this.flameLives : this.smokeLives;
    const target = index * 3;
    const source = count * 3;
    positions[target] = positions[source];
    positions[target + 1] = positions[source + 1];
    positions[target + 2] = positions[source + 2];
    velocities[target] = velocities[source];
    velocities[target + 1] = velocities[source + 1];
    velocities[target + 2] = velocities[source + 2];
    lives[index] = lives[count];
  }

  private updateDrawRanges(): void {
    this.sparkGeometry.setDrawRange(0, this.sparkCount);
    this.smokeGeometry.setDrawRange(0, this.smokeCount);
    this.flameGeometry.setDrawRange(0, this.flameCount);
    this.sparkPositionAttribute.needsUpdate = this.sparkCount > 0;
    this.smokePositionAttribute.needsUpdate = this.smokeCount > 0;
    this.flamePositionAttribute.needsUpdate = this.flameCount > 0;
    this.sparks.visible = this.sparkCount > 0;
    this.smoke.visible = this.smokeCount > 0;
    this.flames.visible = this.flameCount > 0;
  }

  private clearAll(): void {
    this.positions.fill(0);
    this.glowPositions.fill(0);
    this.sparkPositions.fill(0);
    this.smokePositions.fill(0);
    this.flamePositions.fill(0);
    this.sparkLives.fill(0);
    this.smokeLives.fill(0);
    this.flameLives.fill(0);
    this.impactLife = 0;
    this.sparkCount = 0;
    this.smokeCount = 0;
    this.flameCount = 0;
    this.sparkAccumulator = 0;
    this.fadeRemaining = 0;
    this.fadeDuration = 0;
    this.historyInitialized = false;
    this.positionAttribute.needsUpdate = true;
    this.glowPositionAttribute.needsUpdate = true;
    this.sparkPositionAttribute.needsUpdate = true;
    this.smokePositionAttribute.needsUpdate = true;
    this.sparkGeometry.setDrawRange(0, 0);
    this.smokeGeometry.setDrawRange(0, 0);
    this.flameGeometry.setDrawRange(0, 0);
    this.object.visible = false;
    this.glow.visible = false;
    this.sparks.visible = false;
    this.smoke.visible = false;
    this.flames.visible = false;
    this.impact.visible = false;
    this.impactMaterial.opacity = 0;
    this.root.visible = false;
    this.material.opacity = this.profile.trailOpacity * 0.48;
    this.glowMaterial.opacity = this.profile.glowOpacity;
    this.sparkMaterial.opacity = 0.92;
    this.smokeMaterial.opacity = 0.34;
    this.flameMaterial.opacity = 0.9;
  }

  private noise(seed: number, channel: number): number {
    const value = Math.sin(seed * 12.9898 + channel * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }
}
