import * as THREE from 'three';
import { VFXPool, type PoolableVFX } from './VFXPool';
import { VFXLightPool, type VFXLightHandle } from './VFXLightPool';
import { PooledParticleCloud } from './ParticleManager';
import { CameraShake } from './CameraShake';
import {
  createMagicCircleMaterial,
  createWarriorSlashMaterial,
  setWarriorSlashTime,
  type WarriorSlashMaterial,
  type EnergyShaderMaterial,
} from './VFXMaterials';

export interface WarriorSlashPlayOptions {
  readonly position: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly type?: 'basic' | 'combo2' | 'combo3' | 'auto';
  readonly scale?: number;
  readonly isAuto?: boolean;
}

export interface WarriorTravelingSlashOptions {
  readonly start: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly speed?: number; // m/s
  readonly scale?: number;
  readonly type?: 'basic' | 'combo2' | 'combo3' | 'auto';
  readonly onHit?: (position: THREE.Vector3) => void;
}

interface WarriorSlashResources {
  readonly softGlow: THREE.Texture;
  readonly impactFlare: THREE.Texture;
  readonly slashArc: THREE.Texture;
  readonly quad: THREE.PlaneGeometry;
  readonly ring: THREE.RingGeometry;
}

function prepareTexture(texture: THREE.Texture): THREE.Texture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createResources(): WarriorSlashResources {
  const loader = new THREE.TextureLoader();
  return {
    softGlow: prepareTexture(loader.load('/vfx/warrior/soft-glow.png')),
    impactFlare: prepareTexture(loader.load('/vfx/warrior/impact-flare.png')),
    slashArc: prepareTexture(loader.load('/vfx/warrior/slash-arc.png')),
    quad: new THREE.PlaneGeometry(1, 1),
    ring: new THREE.RingGeometry(0.2, 0.26, 48),
  };
}

function createArcRibbonGeometry(
  innerRadius: number,
  outerRadius: number,
  thetaStart: number,
  thetaLength: number,
  radialSegments: number,
  angularSegments: number
): THREE.BufferGeometry {
  const vertexCount = (radialSegments + 1) * (angularSegments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  let idx = 0;
  for (let a = 0; a <= angularSegments; a++) {
    const t = a / angularSegments;
    const angle = thetaStart + t * thetaLength;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    for (let r = 0; r <= radialSegments; r++) {
      const rt = r / radialSegments;
      const radius = THREE.MathUtils.lerp(innerRadius, outerRadius, rt);
      // angle 0 = forward (+Z), sin = X, cos = Z
      positions[idx * 3] = radius * sin;
      positions[idx * 3 + 1] = 0;
      positions[idx * 3 + 2] = radius * cos;
      uvs[idx * 2] = t; // angular 0..1
      uvs[idx * 2 + 1] = rt; // radial 0 inner, 1 outer
      idx++;
    }
  }

  const radialStride = radialSegments + 1;
  for (let a = 0; a < angularSegments; a++) {
    for (let r = 0; r < radialSegments; r++) {
      const i0 = a * radialStride + r;
      const i1 = (a + 1) * radialStride + r;
      const i2 = (a + 1) * radialStride + (r + 1);
      const i3 = a * radialStride + (r + 1);
      indices.push(i0, i1, i3);
      indices.push(i1, i2, i3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const BASIC_CONFIG = {
  inner: 0.35,
  outer: 3.2,
  theta: (Math.PI * 260) / 180, // 260 deg large
  duration: 0.42,
  intensity: 2.1,
  thickness: 1.25,
  colors: { core: 0xffffff, glow: 0x7efff6, dark: 0x0a2e33 },
};

const COMBO2_CONFIG = {
  inner: 0.4,
  outer: 3.5,
  theta: (Math.PI * 280) / 180,
  duration: 0.46,
  intensity: 2.3,
  thickness: 1.35,
  colors: { core: 0xeaffff, glow: 0x4dffe9, dark: 0x082a30 },
};

const COMBO3_CONFIG = {
  inner: 0.45,
  outer: 3.8,
  theta: (Math.PI * 310) / 180,
  duration: 0.52,
  intensity: 2.6,
  thickness: 1.45,
  colors: { core: 0xffffff, glow: 0x5affff, dark: 0x0a2e33 },
};

const AUTO_CONFIG = {
  inner: 0.32,
  outer: 3.4,
  theta: (Math.PI * 270) / 180,
  duration: 0.44,
  intensity: 2.4,
  thickness: 1.3,
  colors: { core: 0xffffff, glow: 0x8affff, dark: 0x0a2e33 },
};

function configForType(type: WarriorSlashPlayOptions['type']) {
  switch (type) {
    case 'combo2':
      return COMBO2_CONFIG;
    case 'combo3':
      return COMBO3_CONFIG;
    case 'auto':
      return AUTO_CONFIG;
    case 'basic':
    default:
      return BASIC_CONFIG;
  }
}

class WarriorSlashEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly slashMesh: THREE.Mesh;
  private readonly slashCoreMesh: THREE.Mesh;
  private readonly shockwaveMesh: THREE.Mesh;
  private readonly shockwaveMaterial: EnergyShaderMaterial;
  private readonly slashMaterial: WarriorSlashMaterial;
  private readonly slashCoreMaterial: WarriorSlashMaterial;
  private readonly impactSprite: THREE.Sprite;
  private readonly glowSprite: THREE.Sprite;
  private readonly edgeGlow1: THREE.Sprite;
  private readonly edgeGlow2: THREE.Sprite;
  private readonly particles: PooledParticleCloud;
  private readonly embers: PooledParticleCloud;
  private readonly arcGeometry: THREE.BufferGeometry;
  private readonly coreGeometry: THREE.BufferGeometry;
  private lightHandle: VFXLightHandle | null = null;

  private age = 0;
  private duration = 0.42;
  private baseScale = 1;
  private forward = new THREE.Vector3(0, 0, 1);

  public constructor(
    private readonly resources: WarriorSlashResources,
    private readonly lightPool: VFXLightPool
  ) {
    this.group.name = 'WarriorSlashVFX';
    this.group.visible = false;

    // Large arc geometries
    this.arcGeometry = createArcRibbonGeometry(
      BASIC_CONFIG.inner,
      BASIC_CONFIG.outer,
      -BASIC_CONFIG.theta / 2,
      BASIC_CONFIG.theta,
      6,
      48
    );
    this.coreGeometry = createArcRibbonGeometry(
      BASIC_CONFIG.inner + 0.25,
      BASIC_CONFIG.outer - 0.15,
      -BASIC_CONFIG.theta / 2,
      BASIC_CONFIG.theta,
      4,
      48
    );

    this.slashMaterial = createWarriorSlashMaterial({
      colorA: BASIC_CONFIG.colors.core,
      colorB: BASIC_CONFIG.colors.glow,
      colorC: BASIC_CONFIG.colors.dark,
      opacity: 1,
      intensity: BASIC_CONFIG.intensity,
      thickness: BASIC_CONFIG.thickness,
      distortion: 1.1,
    });
    this.slashMesh = new THREE.Mesh(this.arcGeometry, this.slashMaterial);
    this.slashMesh.name = 'WarriorSlashMain';
    this.slashMesh.frustumCulled = false;
    this.slashMesh.renderOrder = 5;

    this.slashCoreMaterial = createWarriorSlashMaterial({
      colorA: 0xffffff,
      colorB: 0xbfffff,
      colorC: 0x0a4a4a,
      opacity: 0.95,
      intensity: 2.8,
      thickness: 0.55,
      distortion: 0.9,
    });
    this.slashCoreMesh = new THREE.Mesh(this.coreGeometry, this.slashCoreMaterial);
    this.slashCoreMesh.name = 'WarriorSlashCore';
    this.slashCoreMesh.frustumCulled = false;
    this.slashCoreMesh.renderOrder = 6;

    this.shockwaveMaterial = createMagicCircleMaterial({
      colorA: BASIC_CONFIG.colors.core,
      colorB: BASIC_CONFIG.colors.glow,
      opacity: 0,
      intensity: 1.8,
      thickness: 0.85,
      distortion: 1.15,
    });
    this.shockwaveMesh = new THREE.Mesh(resources.ring, this.shockwaveMaterial);
    this.shockwaveMesh.name = 'WarriorShockwave';
    this.shockwaveMesh.rotation.x = -Math.PI / 2;
    this.shockwaveMesh.position.y = 0.02;
    this.shockwaveMesh.renderOrder = 4;

    const makeSprite = (name: string, map: THREE.Texture, color: number) => {
      const mat = new THREE.SpriteMaterial({
        map,
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.name = name;
      sprite.frustumCulled = false;
      return sprite;
    };

    this.impactSprite = makeSprite('WarriorImpactFlare', resources.impactFlare, 0x7fffff);
    this.glowSprite = makeSprite('WarriorCenterGlow', resources.softGlow, 0x5efff5);
    this.edgeGlow1 = makeSprite('WarriorEdgeGlow1', resources.softGlow, 0xffffff);
    this.edgeGlow2 = makeSprite('WarriorEdgeGlow2', resources.softGlow, 0x5efff5);

    this.particles = new PooledParticleCloud(72, resources.softGlow);
    this.embers = new PooledParticleCloud(48, resources.softGlow);

    this.group.add(
      this.slashMesh,
      this.slashCoreMesh,
      this.shockwaveMesh,
      this.glowSprite,
      this.impactSprite,
      this.edgeGlow1,
      this.edgeGlow2,
      this.particles.points,
      this.embers.points
    );
  }

  public play(options: WarriorSlashPlayOptions): void {
    const cfg = configForType(options.type);
    // Rebuild geometries if theta/radius changed significantly (basic vs combo)
    if (Math.abs(cfg.outer - BASIC_CONFIG.outer) > 0.01 || cfg.theta !== BASIC_CONFIG.theta) {
      this.rebuildGeometries(cfg.inner, cfg.outer, cfg.theta);
    }

    this.duration = cfg.duration * (options.isAuto ? 1.05 : 1);
    this.baseScale = options.scale ?? 1;
    this.age = 0;
    this.forward.copy(options.forward).setY(0).normalize();
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, 1);

    this.group.visible = true;
    this.group.position.copy(options.position);
    this.group.position.y += 0.95; // chest height for large trail
    this.group.scale.setScalar(1);

    // Orientation: group Y rotation aligns forward, with slight tilt for dynamic feel like reference image
    const yaw = Math.atan2(this.forward.x, this.forward.z);
    this.group.rotation.set(0.12, yaw, 0); // slight forward tilt

    // Tilt slash meshes for more 3D dome feel (like image)
    this.slashMesh.rotation.x = -0.18;
    this.slashCoreMesh.rotation.x = -0.18;
    this.slashMesh.rotation.z = 0.05;
    this.slashCoreMesh.rotation.z = 0.05;

    // Materials colors
    this.slashMaterial.uniforms.uColorA.value.set(cfg.colors.core);
    this.slashMaterial.uniforms.uColorB.value.set(cfg.colors.glow);
    this.slashMaterial.uniforms.uColorC.value.set(cfg.colors.dark);
    this.slashMaterial.uniforms.uOpacity.value = 1;
    this.slashMaterial.uniforms.uIntensity.value = cfg.intensity;
    this.slashMaterial.uniforms.uThickness.value = cfg.thickness;
    this.slashMaterial.uniforms.uTime.value = 0;
    this.slashMaterial.uniforms.uProgress.value = 0;

    this.slashCoreMaterial.uniforms.uColorA.value.set(0xffffff);
    this.slashCoreMaterial.uniforms.uColorB.value.set(0xcfffff);
    this.slashCoreMaterial.uniforms.uColorC.value.set(cfg.colors.glow);
    this.slashCoreMaterial.uniforms.uOpacity.value = 0.95;
    this.slashCoreMaterial.uniforms.uIntensity.value = cfg.intensity * 1.35;
    this.slashCoreMaterial.uniforms.uThickness.value = cfg.thickness * 0.55;
    this.slashCoreMaterial.uniforms.uTime.value = 0;
    this.slashCoreMaterial.uniforms.uProgress.value = 0;

    // Shockwave
    this.shockwaveMaterial.uniforms.uColorA.value.set(cfg.colors.core);
    this.shockwaveMaterial.uniforms.uColorB.value.set(cfg.colors.glow);
    this.shockwaveMaterial.uniforms.uOpacity.value = 0.72;
    this.shockwaveMaterial.uniforms.uIntensity.value = 1.6;
    this.shockwaveMaterial.uniforms.uTime.value = 0;
    this.shockwaveMesh.scale.setScalar(0.35 * this.baseScale);

    // Sprites
    (this.glowSprite.material as THREE.SpriteMaterial).opacity = 0.85;
    this.glowSprite.position.set(0, 0.15, 0.45);
    this.glowSprite.scale.setScalar(1.4 * this.baseScale);
    (this.glowSprite.material as THREE.SpriteMaterial).color.set(cfg.colors.glow);

    (this.impactSprite.material as THREE.SpriteMaterial).opacity = 0.95;
    this.impactSprite.position.set(0, 0.12, cfg.outer * 0.88);
    this.impactSprite.scale.setScalar(1.8 * this.baseScale);
    (this.impactSprite.material as THREE.SpriteMaterial).color.set(0xffffff);

    (this.edgeGlow1.material as THREE.SpriteMaterial).opacity = 0.75;
    this.edgeGlow1.position.set(
      Math.sin(cfg.theta * 0.42) * cfg.outer * 0.92,
      0.18,
      Math.cos(cfg.theta * 0.42) * cfg.outer * 0.92
    );
    this.edgeGlow1.scale.setScalar(0.9 * this.baseScale);

    (this.edgeGlow2.material as THREE.SpriteMaterial).opacity = 0.75;
    this.edgeGlow2.position.set(
      Math.sin(-cfg.theta * 0.42) * cfg.outer * 0.92,
      0.18,
      Math.cos(-cfg.theta * 0.42) * cfg.outer * 0.92
    );
    this.edgeGlow2.scale.setScalar(0.9 * this.baseScale);

    // Light flash - bright cyan impact
    this.lightHandle = this.lightPool.acquire();
    if (this.lightHandle) {
      this.lightHandle.light.color.set(cfg.colors.glow);
      this.lightHandle.light.intensity = 2.2 * this.baseScale;
      this.lightHandle.light.distance = 7.5 * this.baseScale;
      this.lightHandle.light.position.copy(this.group.position);
      this.lightHandle.light.position.y += 0.5;
    }

    // Particles - bright sparks flying outward like in image (small black dots become cyan glints)
    this.particles.setTexture(this.resources.softGlow);
    this.particles.emit(new THREE.Vector3(0, 0.2, 0.5), {
      color: 0xbfffff,
      count: 36,
      speed: 4.2 * this.baseScale,
      spread: 1.4,
      lifetime: this.duration * 1.15,
      upwardBias: 0.35,
    });

    this.embers.setTexture(this.resources.softGlow);
    this.embers.emit(new THREE.Vector3(0, 0.15, 0.3), {
      color: cfg.colors.glow,
      count: 22,
      speed: 2.6 * this.baseScale,
      spread: 1.1,
      lifetime: this.duration * 1.25,
      upwardBias: 0.28,
    });
  }

  public update(delta: number): boolean {
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
    const fade = 1 - progress;

    setWarriorSlashTime(this.slashMaterial, this.age * 1.6, progress);
    setWarriorSlashTime(this.slashCoreMaterial, this.age * 1.9, progress);

    this.slashMaterial.uniforms.uOpacity.value = fade;
    this.slashCoreMaterial.uniforms.uOpacity.value = fade * 0.95;

    // Expand scale slightly for large trail feel
    const scale = this.baseScale * (1 + progress * 0.22);
    this.slashMesh.scale.set(scale, 1, scale);
    this.slashCoreMesh.scale.set(scale * 1.02, 1, scale * 1.02);

    // Shockwave expands on ground
    this.shockwaveMaterial.uniforms.uTime.value = this.age * 1.35;
    this.shockwaveMaterial.uniforms.uOpacity.value = fade * 0.62;
    this.shockwaveMesh.scale.setScalar((0.35 + progress * 3.2) * this.baseScale);

    // Sprites fade and scale
    (this.glowSprite.material as THREE.SpriteMaterial).opacity = fade * 0.85;
    this.glowSprite.scale.setScalar((1.4 + progress * 0.9) * this.baseScale);

    (this.impactSprite.material as THREE.SpriteMaterial).opacity = fade * 0.95;
    this.impactSprite.scale.setScalar((1.8 + progress * 1.6) * this.baseScale);
    (this.impactSprite.material as THREE.SpriteMaterial).rotation = progress * 1.5;

    (this.edgeGlow1.material as THREE.SpriteMaterial).opacity = fade * 0.75;
    (this.edgeGlow2.material as THREE.SpriteMaterial).opacity = fade * 0.75;
    this.edgeGlow1.scale.setScalar((0.9 + progress * 0.7) * this.baseScale);
    this.edgeGlow2.scale.setScalar((0.9 + progress * 0.7) * this.baseScale);

    if (this.lightHandle) {
      this.lightHandle.light.intensity *= Math.max(0, 1 - elapsed * 6.5);
      this.lightHandle.light.position.copy(this.group.position);
    }

    this.particles.update(elapsed);
    this.embers.update(elapsed);

    return this.age < this.duration;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.lightHandle?.release();
    this.lightHandle = null;
    this.particles.reset();
    this.embers.reset();
    this.slashMaterial.uniforms.uOpacity.value = 0;
    this.slashCoreMaterial.uniforms.uOpacity.value = 0;
    this.shockwaveMaterial.uniforms.uOpacity.value = 0;
    (this.impactSprite.material as THREE.SpriteMaterial).opacity = 0;
    (this.glowSprite.material as THREE.SpriteMaterial).opacity = 0;
    (this.edgeGlow1.material as THREE.SpriteMaterial).opacity = 0;
    (this.edgeGlow2.material as THREE.SpriteMaterial).opacity = 0;
  }

  public dispose(): void {
    this.arcGeometry.dispose();
    this.coreGeometry.dispose();
    this.slashMaterial.dispose();
    this.slashCoreMaterial.dispose();
    this.shockwaveMaterial.dispose();
    (this.impactSprite.material as THREE.Material).dispose();
    (this.glowSprite.material as THREE.Material).dispose();
    (this.edgeGlow1.material as THREE.Material).dispose();
    (this.edgeGlow2.material as THREE.Material).dispose();
    this.particles.dispose();
    this.embers.dispose();
  }

  private rebuildGeometries(inner: number, outer: number, theta: number): void {
    const newArc = createArcRibbonGeometry(inner, outer, -theta / 2, theta, 6, 48);
    const newCore = createArcRibbonGeometry(inner + 0.25, outer - 0.15, -theta / 2, theta, 4, 48);
    this.slashMesh.geometry = newArc;
    this.slashCoreMesh.geometry = newCore;
    this.arcGeometry.dispose();
    this.coreGeometry.dispose();
    (this as any).arcGeometry = newArc;
    (this as any).coreGeometry = newCore;
  }
}

class WarriorHitImpactEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly flare: THREE.Sprite;
  private readonly glow: THREE.Sprite;
  private readonly ring: THREE.Mesh;
  private readonly ringMat: EnergyShaderMaterial;
  private readonly particles: PooledParticleCloud;
  private age = 0;
  private duration = 0.32;
  private lightHandle: VFXLightHandle | null = null;

  constructor(
    private readonly resources: WarriorSlashResources,
    private readonly lightPool: VFXLightPool
  ) {
    this.group.name = 'WarriorHitImpact';
    this.group.visible = false;

    const makeSprite = (name: string, map: THREE.Texture, color: number) => {
      const mat = new THREE.SpriteMaterial({
        map,
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const s = new THREE.Sprite(mat);
      s.name = name;
      return s;
    };

    this.flare = makeSprite('HitFlare', resources.impactFlare, 0xffffff);
    this.glow = makeSprite('HitGlow', resources.softGlow, 0x7efff6);
    this.ringMat = createMagicCircleMaterial({
      colorA: 0xffffff,
      colorB: 0x5efff5,
      opacity: 0,
      intensity: 1.6,
      thickness: 0.9,
      distortion: 1.1,
    });
    this.ring = new THREE.Mesh(resources.ring, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;

    this.particles = new PooledParticleCloud(32, resources.softGlow);

    this.group.add(this.ring, this.glow, this.flare, this.particles.points);
  }

  public play(position: THREE.Vector3, scale = 1): void {
    this.age = 0;
    this.duration = 0.32;
    this.group.visible = true;
    this.group.position.copy(position);
    this.group.position.y += 0.9;
    this.group.scale.setScalar(scale);

    (this.flare.material as THREE.SpriteMaterial).opacity = 1;
    this.flare.scale.setScalar(1.2 * scale);
    (this.flare.material as THREE.SpriteMaterial).color.set(0xffffff);

    (this.glow.material as THREE.SpriteMaterial).opacity = 0.85;
    this.glow.scale.setScalar(1.8 * scale);
    (this.glow.material as THREE.SpriteMaterial).color.set(0x5efff6);

    this.ringMat.uniforms.uColorA.value.set(0xffffff);
    this.ringMat.uniforms.uColorB.value.set(0x5efff6);
    this.ringMat.uniforms.uOpacity.value = 0.75;
    this.ringMat.uniforms.uTime.value = 0;
    this.ring.scale.setScalar(0.3 * scale);

    this.lightHandle = this.lightPool.acquire();
    if (this.lightHandle) {
      this.lightHandle.light.color.set(0x5efff6);
      this.lightHandle.light.intensity = 1.8 * scale;
      this.lightHandle.light.distance = 5.5 * scale;
      this.lightHandle.light.position.copy(this.group.position);
    }

    this.particles.setTexture(this.resources.softGlow);
    this.particles.emit(new THREE.Vector3(), {
      color: 0xbfffff,
      count: 18,
      speed: 3.2 * scale,
      spread: 1.2,
      lifetime: 0.32,
      upwardBias: 0.25,
    });
  }

  public update(delta: number): boolean {
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
    const fade = 1 - progress;

    this.ringMat.uniforms.uTime.value = this.age * 1.5;
    this.ringMat.uniforms.uOpacity.value = fade * 0.75;
    this.ring.scale.setScalar((0.3 + progress * 2.2));

    (this.flare.material as THREE.SpriteMaterial).opacity = fade;
    this.flare.scale.setScalar((1.2 + progress * 1.2));

    (this.glow.material as THREE.SpriteMaterial).opacity = fade * 0.85;
    this.glow.scale.setScalar((1.8 + progress * 1.1));

    if (this.lightHandle) {
      this.lightHandle.light.intensity *= Math.max(0, 1 - elapsed * 7);
      this.lightHandle.light.position.copy(this.group.position);
    }

    this.particles.update(elapsed);

    return this.age < this.duration;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.lightHandle?.release();
    this.lightHandle = null;
    this.particles.reset();
    (this.flare.material as THREE.SpriteMaterial).opacity = 0;
    (this.glow.material as THREE.SpriteMaterial).opacity = 0;
    this.ringMat.uniforms.uOpacity.value = 0;
  }

  public dispose(): void {
    this.ringMat.dispose();
    (this.flare.material as THREE.Material).dispose();
    (this.glow.material as THREE.Material).dispose();
    this.particles.dispose();
  }
}

class WarriorTravelingSlashEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly slashMesh: THREE.Mesh;
  private readonly coreMesh: THREE.Mesh;
  private readonly trailMesh: THREE.Mesh;
  private readonly slashMat: WarriorSlashMaterial;
  private readonly coreMat: WarriorSlashMaterial;
  private readonly trailMat: WarriorSlashMaterial;
  private readonly glow: THREE.Sprite;
  private readonly particles: PooledParticleCloud;
  private readonly geometry: THREE.BufferGeometry;
  private readonly coreGeometry: THREE.BufferGeometry;
  private readonly trailGeometry: THREE.BufferGeometry;
  private readonly lightHandle: { light: THREE.PointLight; release: () => void } | null = null;
  private actualLightHandle: VFXLightHandle | null = null;

  private age = 0;
  private duration = 0.5;
  private distance = 5;
  private speed = 12;
  private startPos = new THREE.Vector3();
  private targetPos = new THREE.Vector3();
  private forward = new THREE.Vector3(0, 0, 1);
  private onHit: ((pos: THREE.Vector3) => void) | null = null;
  private hasHit = false;
  private baseScale = 1;

  constructor(
    private readonly resources: WarriorSlashResources,
    private readonly lightPool: VFXLightPool
  ) {
    this.group.name = 'WarriorTravelingSlash';
    this.group.visible = false;

    // Traveling slash uses vertical crescent shape (same format as blade trail)
    // inner small, outer large, theta ~130 deg for air cut
    this.geometry = createArcRibbonGeometry(0.15, 1.9, (-130 * Math.PI) / 360, (130 * Math.PI) / 180, 3, 24);
    this.coreGeometry = createArcRibbonGeometry(0.35, 1.65, (-130 * Math.PI) / 360, (130 * Math.PI) / 180, 2, 24);
    this.trailGeometry = createArcRibbonGeometry(0.1, 2.2, (-110 * Math.PI) / 360, (110 * Math.PI) / 180, 2, 20);

    this.slashMat = createWarriorSlashMaterial({
      colorA: 0xffffff,
      colorB: 0x7efff6,
      colorC: 0x0a2e33,
      opacity: 1,
      intensity: 2.6,
      thickness: 1.1,
      distortion: 1.2,
    });
    this.coreMat = createWarriorSlashMaterial({
      colorA: 0xffffff,
      colorB: 0xbfffff,
      colorC: 0x0a4a4a,
      opacity: 0.95,
      intensity: 3.2,
      thickness: 0.5,
      distortion: 0.8,
    });
    this.trailMat = createWarriorSlashMaterial({
      colorA: 0xcfffff,
      colorB: 0x4dffe9,
      colorC: 0x082a30,
      opacity: 0.65,
      intensity: 1.8,
      thickness: 1.4,
      distortion: 1.3,
    });

    this.slashMesh = new THREE.Mesh(this.geometry, this.slashMat);
    this.coreMesh = new THREE.Mesh(this.coreGeometry, this.coreMat);
    this.trailMesh = new THREE.Mesh(this.trailGeometry, this.trailMat);

    // Vertical orientation: rotate to be vertical blade facing forward
    // Our arc geometry is on XZ plane, we want it vertical (standing)
    this.slashMesh.rotation.x = Math.PI / 2;
    this.slashMesh.rotation.y = 0;
    this.coreMesh.rotation.x = Math.PI / 2;
    this.trailMesh.rotation.x = Math.PI / 2;
    this.trailMesh.position.z = -0.35; // behind main blade

    this.slashMesh.frustumCulled = false;
    this.coreMesh.frustumCulled = false;
    this.trailMesh.frustumCulled = false;
    this.slashMesh.renderOrder = 7;
    this.coreMesh.renderOrder = 8;
    this.trailMesh.renderOrder = 6;

    const glowMat = new THREE.SpriteMaterial({
      map: resources.softGlow,
      color: 0x5efff5,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.glow = new THREE.Sprite(glowMat);
    this.glow.name = 'TravelGlow';
    this.glow.scale.setScalar(1.2);

    this.particles = new PooledParticleCloud(40, resources.softGlow);

    this.group.add(this.trailMesh, this.slashMesh, this.coreMesh, this.glow, this.particles.points);
  }

  public play(options: WarriorTravelingSlashOptions): void {
    this.startPos.copy(options.start);
    this.targetPos.copy(options.target);
    this.forward.copy(options.forward).setY(0).normalize();
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, 1);
    this.baseScale = options.scale ?? 1;
    this.speed = options.speed ?? (options.type === 'auto' ? 13.5 : 11.5);
    this.onHit = options.onHit ?? null;
    this.hasHit = false;

    const delta = this.targetPos.clone().sub(this.startPos);
    delta.y = 0;
    this.distance = Math.max(1, Math.min(delta.length(), 7.5)); // clamp max travel
    this.duration = this.distance / this.speed + 0.12; // plus fade
    this.age = 0;

    this.group.visible = true;
    this.group.position.copy(this.startPos);
    this.group.position.y += 0.95;
    this.group.scale.setScalar(this.baseScale);

    const yaw = Math.atan2(this.forward.x, this.forward.z);
    this.group.rotation.set(0, yaw, 0);

    // Colors based on type
    const isAuto = options.type === 'auto';
    const isCombo3 = options.type === 'combo3';
    const glowColor = isAuto ? 0x8affff : isCombo3 ? 0x5affff : 0x7efff6;
    const darkColor = 0x0a2e33;

    this.slashMat.uniforms.uColorA.value.set(0xffffff);
    this.slashMat.uniforms.uColorB.value.set(glowColor);
    this.slashMat.uniforms.uColorC.value.set(darkColor);
    this.slashMat.uniforms.uOpacity.value = 1;
    this.slashMat.uniforms.uIntensity.value = isAuto ? 2.9 : 2.6;
    this.slashMat.uniforms.uTime.value = 0;
    this.slashMat.uniforms.uProgress.value = 0;

    this.coreMat.uniforms.uColorA.value.set(0xffffff);
    this.coreMat.uniforms.uColorB.value.set(0xbfffff);
    this.coreMat.uniforms.uColorC.value.set(glowColor);
    this.coreMat.uniforms.uOpacity.value = 0.95;
    this.coreMat.uniforms.uIntensity.value = isAuto ? 3.4 : 3.2;
    this.coreMat.uniforms.uTime.value = 0;
    this.coreMat.uniforms.uProgress.value = 0;

    this.trailMat.uniforms.uColorA.value.set(0xcfffff);
    this.trailMat.uniforms.uColorB.value.set(glowColor);
    this.trailMat.uniforms.uColorC.value.set(darkColor);
    this.trailMat.uniforms.uOpacity.value = 0.55;
    this.trailMat.uniforms.uIntensity.value = 1.9;
    this.trailMat.uniforms.uTime.value = 0;
    this.trailMat.uniforms.uProgress.value = 0;

    (this.glow.material as THREE.SpriteMaterial).opacity = 0.8;
    (this.glow.material as THREE.SpriteMaterial).color.set(glowColor);
    this.glow.scale.setScalar(1.1 * this.baseScale);

    this.actualLightHandle = this.lightPool.acquire();
    if (this.actualLightHandle) {
      this.actualLightHandle.light.color.set(glowColor);
      this.actualLightHandle.light.intensity = 1.6 * this.baseScale;
      this.actualLightHandle.light.distance = 6 * this.baseScale;
      this.actualLightHandle.light.position.copy(this.group.position);
    }

    this.particles.setTexture(this.resources.softGlow);
    this.particles.emit(new THREE.Vector3(0, 0, -0.2), {
      color: glowColor,
      count: 20,
      speed: 2.2,
      spread: 0.9,
      lifetime: this.duration,
      upwardBias: 0.15,
    });
  }

  public update(delta: number): boolean {
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
    const travelProgress = THREE.MathUtils.clamp(this.age / Math.max(0.001, this.distance / this.speed), 0, 1);

    // Move forward
    const currentPos = this.startPos.clone().lerp(this.targetPos, travelProgress);
    currentPos.y = this.startPos.y + 0.95;
    this.group.position.copy(currentPos);

    // Fade based on overall progress
    const fade = 1 - progress;
    setWarriorSlashTime(this.slashMat, this.age * 2.2, travelProgress * 0.6);
    setWarriorSlashTime(this.coreMat, this.age * 2.5, travelProgress * 0.6);
    setWarriorSlashTime(this.trailMat, this.age * 1.8, travelProgress * 0.6);

    this.slashMat.uniforms.uOpacity.value = fade;
    this.coreMat.uniforms.uOpacity.value = fade * 0.95;
    this.trailMat.uniforms.uOpacity.value = fade * 0.55;

    // Scale pulse as it travels
    const scale = this.baseScale * (1 + travelProgress * 0.18);
    this.slashMesh.scale.setScalar(scale);
    this.coreMesh.scale.setScalar(scale * 1.05);
    this.trailMesh.scale.setScalar(scale * 0.95);

    (this.glow.material as THREE.SpriteMaterial).opacity = fade * 0.8;
    this.glow.scale.setScalar((1.1 + travelProgress * 0.6) * this.baseScale);

    if (this.actualLightHandle) {
      this.actualLightHandle.light.intensity *= Math.max(0, 1 - elapsed * 5);
      this.actualLightHandle.light.position.copy(this.group.position);
    }

    this.particles.update(elapsed);

    // Trigger hit when reaching target (once)
    if (!this.hasHit && travelProgress >= 0.92) {
      this.hasHit = true;
      this.onHit?.(this.group.position.clone());
    }

    return this.age < this.duration;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.hasHit = false;
    this.onHit = null;
    this.actualLightHandle?.release();
    this.actualLightHandle = null;
    this.particles.reset();
    this.slashMat.uniforms.uOpacity.value = 0;
    this.coreMat.uniforms.uOpacity.value = 0;
    this.trailMat.uniforms.uOpacity.value = 0;
    (this.glow.material as THREE.SpriteMaterial).opacity = 0;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.coreGeometry.dispose();
    this.trailGeometry.dispose();
    this.slashMat.dispose();
    this.coreMat.dispose();
    this.trailMat.dispose();
    (this.glow.material as THREE.Material).dispose();
    this.particles.dispose();
  }
}

export class WarriorSlashVFX {
  private readonly resources: WarriorSlashResources;
  private readonly pool: VFXPool<WarriorSlashEffect>;
  private readonly active: WarriorSlashEffect[] = [];
  private readonly impactPool: VFXPool<WarriorHitImpactEffect>;
  private readonly activeImpacts: WarriorHitImpactEffect[] = [];
  private readonly travelingPool: VFXPool<WarriorTravelingSlashEffect>;
  private readonly activeTraveling: WarriorTravelingSlashEffect[] = [];
  private readonly cameraShake = new CameraShake();

  public constructor(
    private readonly scene: THREE.Scene,
    private readonly lightPool: VFXLightPool
  ) {
    this.resources = createResources();
    this.pool = new VFXPool(
      () => new WarriorSlashEffect(this.resources, lightPool),
      12
    );
    this.impactPool = new VFXPool(
      () => new WarriorHitImpactEffect(this.resources, lightPool),
      16
    );
    this.travelingPool = new VFXPool(
      () => new WarriorTravelingSlashEffect(this.resources, lightPool),
      12
    );
  }

  public play(options: WarriorSlashPlayOptions): void {
    const effect = this.pool.acquire();
    if (!effect) return;
    effect.play(options);
    this.scene.add(effect.group);
    this.active.push(effect);

    // Impact shake - subtle but punchy for large blade
    const intensity = options.type === 'combo3' ? 0.055 : options.type === 'combo2' ? 0.038 : options.type === 'auto' ? 0.042 : 0.03;
    const duration = options.type === 'combo3' ? 0.20 : options.type === 'auto' ? 0.16 : 0.14;
    this.cameraShake.add(intensity, duration);
  }

  public playImpact(position: THREE.Vector3, scale = 1): void {
    const impact = this.impactPool.acquire();
    if (!impact) {
      this.cameraShake.add(0.02 * scale, 0.1);
      return;
    }
    impact.play(position, scale);
    this.scene.add(impact.group);
    this.activeImpacts.push(impact);
    this.cameraShake.add(0.022 * scale, 0.11);
  }

  public playTravelingSlash(options: WarriorTravelingSlashOptions): void {
    const effect = this.travelingPool.acquire();
    if (!effect) return;
    effect.play(options);
    this.scene.add(effect.group);
    this.activeTraveling.push(effect);
    // Extra shake for projectile launch
    const intensity = options.type === 'auto' ? 0.038 : options.type === 'combo3' ? 0.05 : 0.028;
    this.cameraShake.add(intensity, 0.13);
  }

  public update(delta: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const effect = this.active[i];
      if (effect.update(delta)) continue;
      this.pool.release(effect);
      this.active.splice(i, 1);
    }
    for (let i = this.activeImpacts.length - 1; i >= 0; i--) {
      const impact = this.activeImpacts[i];
      if (impact.update(delta)) continue;
      this.impactPool.release(impact);
      this.activeImpacts.splice(i, 1);
    }
    for (let i = this.activeTraveling.length - 1; i >= 0; i--) {
      const travel = this.activeTraveling[i];
      if (travel.update(delta)) continue;
      this.travelingPool.release(travel);
      this.activeTraveling.splice(i, 1);
    }
  }

  public applyCameraShake(camera: THREE.Camera, delta: number): void {
    this.cameraShake.apply(camera, delta);
  }

  public clear(): void {
    for (const e of this.active) this.pool.release(e);
    this.active.length = 0;
    for (const e of this.activeImpacts) this.impactPool.release(e);
    this.activeImpacts.length = 0;
    for (const e of this.activeTraveling) this.travelingPool.release(e);
    this.activeTraveling.length = 0;
    this.cameraShake.clear();
  }

  public dispose(): void {
    this.clear();
    this.pool.dispose();
    this.impactPool.dispose();
    this.travelingPool.dispose();
    this.resources.quad.dispose();
    this.resources.ring.dispose();
    this.resources.softGlow.dispose();
    this.resources.impactFlare.dispose();
    this.resources.slashArc.dispose();
  }

  public get activeCount(): number {
    return this.active.length + this.activeImpacts.length + this.activeTraveling.length;
  }
}
