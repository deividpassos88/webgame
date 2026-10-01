import * as THREE from 'three';
import { VFXPool, type PoolableVFX } from './VFXPool';
import { VFXLightPool, type VFXLightHandle } from './VFXLightPool';
import { PooledParticleCloud } from './ParticleManager';
import { CameraShake } from './CameraShake';
import { WARRIOR_CUT_FAN_RANGE_METERS } from '../combat/DistanceDamage';
import {
  createMagicCircleMaterial,
  createWarriorSlashMaterial,
  setWarriorSlashTime,
  type WarriorSlashMaterial,
  type EnergyShaderMaterial,
} from './VFXMaterials';
import {
  WarriorSlashVFX as WarriorSlashTrailVFX,
} from './warrior/WarriorSlashVFX';

export interface WarriorSlashPlayOptions {
  readonly position: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly type?: 'basic' | 'combo2' | 'combo3' | 'flame' | 'dark_flame' | 'auto' | 'spin' | 'spin_frost';
  readonly scale?: number;
  readonly isAuto?: boolean;
  /** Só há clarão de impacto no fim do rastro quando o golpe realmente acerta alguém. */
  readonly hasImpact?: boolean;
}

export interface WarriorTravelingSlashOptions {
  readonly start: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly speed?: number; // m/s
  readonly scale?: number;
  readonly type?: 'basic' | 'combo2' | 'combo3' | 'flame' | 'dark_flame' | 'auto';
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

/** Altura do leque de vento: na altura da lâmina, acima do piso. */
const WIND_WAVE_HEIGHT = 1.0;
/** Alcance máximo do leque, em metros (bate com WARRIOR_WAVE_RANGE_METERS). */
const WIND_WAVE_MAX_DISTANCE = 7;
/** Onde o arco da frente nasce, a partir do jogador: logo na borda do rastro da lâmina. */
const WIND_WAVE_START_OFFSET = 1.4;
/** Inclinação do leque: a frente sobe um pouco para ler bem de qualquer ângulo. */
const WIND_WAVE_PITCH = -0.26;

function createWindArcGeometry(
  radius: number,
  thickness: number,
  taper: number,
  radialSegments: number,
  angularSegments: number
): THREE.BufferGeometry {
  // Lua de vento: semicírculo no plano XY (o ")" que voa na direção do
  // monstro) com as pontas afinando e recuando, como um corte de vento de
  // verdade — não um disco cheio nem um arco raso.
  const vertexCount = (radialSegments + 1) * (angularSegments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  let idx = 0;
  for (let a = 0; a <= angularSegments; a++) {
    const t = a / angularSegments;
    const phi = -Math.PI / 2 + t * Math.PI;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const tip = Math.sin(Math.PI * t);
    const mid = radius * (1 - (1 - tip) * taper * 0.18);
    const half = (thickness * 0.5) * (1 - taper + taper * tip);
    for (let r = 0; r <= radialSegments; r++) {
      const rt = r / radialSegments;
      const rad = mid + THREE.MathUtils.lerp(-half, half, rt);
      // Bulge para +X local: visto pelo guerreiro, o lado direito da tela.
      positions[idx * 3] = rad * cos;
      positions[idx * 3 + 1] = rad * sin;
      positions[idx * 3 + 2] = 0;
      uvs[idx * 2] = t;
      uvs[idx * 2 + 1] = rt;
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

/**
 * Crescente de vento deitado (plano XZ) com a barriga para a frente (+Z local):
 * é o mesmo desenho do rastro da lâmina, só que fino e solto no ar. As pontas
 * afinam e recuam, como um corte de vento de verdade.
 */
function createWindCrescentGeometry(
  radius: number,
  thickness: number,
  taper: number,
  sweep: number,
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
    const phi = (t - 0.5) * sweep;
    const tip = Math.sin(Math.PI * t);
    const mid = radius * (1 - (1 - tip) * taper * 0.12);
    const half = (thickness * 0.5) * (1 - taper + taper * tip);
    for (let r = 0; r <= radialSegments; r++) {
      const rt = r / radialSegments;
      const rad = mid + THREE.MathUtils.lerp(-half, half, rt);
      // Ângulo 0 = para a frente (+Z); a barriga do arco aponta para o inimigo.
      positions[idx * 3] = rad * Math.sin(phi);
      positions[idx * 3 + 1] = 0;
      positions[idx * 3 + 2] = rad * Math.cos(phi) - radius;
      uvs[idx * 2] = t;
      uvs[idx * 2 + 1] = rt;
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
      indices.push(i0, i3, i1);
      indices.push(i1, i3, i2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Brilho central do golpe: só um toque, para não pintar o corpo de azul. */
const GLOW_CENTER_OPACITY = 0.1;

const BASIC_CONFIG = {
  inner: 0.35,
  outer: 3.2,
  theta: (Math.PI * 260) / 180, // 260 deg large
  duration: 0.42,
  intensity: 1.55,
  thickness: 1.25,
  breakup: 0.62,
  saturation: 1.35,
  colors: { core: 0xdff8ff, glow: 0x2fd4ff, dark: 0x062a3c },
};

const COMBO2_CONFIG = {
  inner: 0.4,
  outer: 3.5,
  theta: (Math.PI * 280) / 180,
  duration: 0.46,
  intensity: 1.6,
  thickness: 1.35,
  breakup: 0.6,
  saturation: 1.35,
  colors: { core: 0xe4fbff, glow: 0x2f9dff, dark: 0x06203c },
};

const COMBO3_CONFIG = {
  inner: 0.45,
  outer: 3.8,
  theta: (Math.PI * 310) / 180,
  duration: 0.52,
  intensity: 1.7,
  thickness: 1.45,
  breakup: 0.55,
  saturation: 1.4,
  colors: { core: 0xfff2d4, glow: 0xffa53a, dark: 0x3a1c05 },
};

/** Basic-attack crescent proportions, recolored for the three-hit fire skill. */
const FLAME_CONFIG = {
  inner: BASIC_CONFIG.inner,
  outer: BASIC_CONFIG.outer,
  theta: BASIC_CONFIG.theta,
  duration: BASIC_CONFIG.duration,
  intensity: 1.68,
  thickness: BASIC_CONFIG.thickness,
  breakup: BASIC_CONFIG.breakup,
  saturation: 1.42,
  colors: { core: 0xfff0c2, glow: 0xff641f, dark: 0x421004 },
};

/** Fire-lit blade with a violet void edge for Corte Duplo's ultimate cuts. */
const DARK_FLAME_CONFIG = {
  inner: BASIC_CONFIG.inner,
  outer: BASIC_CONFIG.outer,
  theta: BASIC_CONFIG.theta,
  duration: 0.56,
  intensity: 2.0,
  thickness: 1.55,
  breakup: 0.52,
  saturation: 1.58,
  colors: { core: 0xfff0d4, glow: 0xff4a1f, dark: 0x250638 },
};

const AUTO_CONFIG = {
  inner: 0.32,
  outer: 3.4,
  theta: (Math.PI * 270) / 180,
  duration: 0.44,
  intensity: 1.6,
  thickness: 1.3,
  breakup: 0.66,
  saturation: 1.4,
  colors: { core: 0xdcfff4, glow: 0x25f0b8, dark: 0x04301f },
};

const SPIN_CONFIG = {
  inner: 0.45,
  outer: 3.8,
  theta: (Math.PI * 340) / 180, // quase círculo completo
  thetaStart: Math.PI, // começa na costa
  duration: 0.68,
  intensity: 1.75,
  thickness: 1.5,
  breakup: 0.58,
  saturation: 1.45,
  colors: { core: 0xfff0cd, glow: 0xffb43c, dark: 0x3d1f04 },
  waveMaxRadius: 7.0,
};

const SPIN_FROST_CONFIG = {
  inner: 0.45,
  outer: 4.0,
  theta: (Math.PI * 340) / 180,
  thetaStart: Math.PI,
  duration: 0.72,
  intensity: 1.8,
  thickness: 1.55,
  breakup: 0.56,
  saturation: 1.4,
  colors: { core: 0xeaf7ff, glow: 0x7fd4ff, dark: 0x0a2340 },
  waveMaxRadius: 7.0,
};

function configForType(type: WarriorSlashPlayOptions['type']) {
  switch (type) {
    case 'combo2':
      return COMBO2_CONFIG;
    case 'combo3':
      return COMBO3_CONFIG;
    case 'flame':
      return FLAME_CONFIG;
    case 'dark_flame':
      return DARK_FLAME_CONFIG;
    case 'auto':
      return AUTO_CONFIG;
    case 'spin':
      return SPIN_CONFIG;
    case 'spin_frost':
      return SPIN_FROST_CONFIG;
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
  private readonly voidEmbers: PooledParticleCloud;
  private readonly arcGeometry: THREE.BufferGeometry;
  private readonly coreGeometry: THREE.BufferGeometry;
  private lightHandle: VFXLightHandle | null = null;

  private age = 0;
  private duration = 0.42;
  private baseScale = 1;
  private forward = new THREE.Vector3(0, 0, 1);
  /** No giratório o rastro da lâmina varre o corpo em vez de ficar parado. */
  private spinSweep = false;
  private baseYaw = 0;
  private showImpact = true;

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
      breakup: BASIC_CONFIG.breakup,
      saturation: BASIC_CONFIG.saturation,
    });
    this.slashMesh = new THREE.Mesh(this.arcGeometry, this.slashMaterial);
    this.slashMesh.name = 'WarriorSlashMain';
    this.slashMesh.frustumCulled = false;
    this.slashMesh.renderOrder = 5;

    this.slashCoreMaterial = createWarriorSlashMaterial({
      colorA: BASIC_CONFIG.colors.core,
      colorB: BASIC_CONFIG.colors.glow,
      colorC: BASIC_CONFIG.colors.dark,
      opacity: 0.95,
      intensity: 1.9,
      thickness: 0.55,
      distortion: 0.9,
      breakup: BASIC_CONFIG.breakup * 0.7,
      saturation: 1.1,
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

    this.impactSprite = makeSprite('WarriorImpactFlare', resources.impactFlare, BASIC_CONFIG.colors.glow);
    this.glowSprite = makeSprite('WarriorCenterGlow', resources.softGlow, BASIC_CONFIG.colors.glow);
    this.edgeGlow1 = makeSprite('WarriorEdgeGlow1', resources.softGlow, BASIC_CONFIG.colors.core);
    this.edgeGlow2 = makeSprite('WarriorEdgeGlow2', resources.softGlow, BASIC_CONFIG.colors.glow);

    this.particles = new PooledParticleCloud(72, resources.softGlow);
    this.embers = new PooledParticleCloud(48, resources.softGlow);
    this.voidEmbers = new PooledParticleCloud(32, resources.softGlow);
    this.voidEmbers.points.name = 'WarriorDarkFlameEmbers';

    this.group.add(
      this.slashMesh,
      this.slashCoreMesh,
      this.shockwaveMesh,
      this.glowSprite,
      this.impactSprite,
      this.edgeGlow1,
      this.edgeGlow2,
      this.particles.points,
      this.embers.points,
      this.voidEmbers.points
    );
  }

  public play(options: WarriorSlashPlayOptions): void {
    const cfg = configForType(options.type) as any;
    const thetaStart = cfg.thetaStart ?? -cfg.theta / 2;
    // Rebuild geometries if theta/radius/start changed significantly (basic vs combo vs spin)
    if (
      Math.abs(cfg.outer - BASIC_CONFIG.outer) > 0.01 ||
      cfg.theta !== BASIC_CONFIG.theta ||
      Math.abs(thetaStart - -BASIC_CONFIG.theta / 2) > 0.01
    ) {
      this.rebuildGeometries(cfg.inner, cfg.outer, cfg.theta, thetaStart);
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
    this.baseYaw = yaw;
    this.group.rotation.set(0.12, yaw, 0); // slight forward tilt

    // Tilt slash meshes for more 3D dome feel (like image)
    this.slashMesh.rotation.x = -0.18;
    this.slashCoreMesh.rotation.x = -0.18;
    this.slashMesh.rotation.z = 0.05;
    this.slashCoreMesh.rotation.z = 0.05;

    // Materials colors
    const seed = Math.random() * 10;
    this.spinSweep = options.type === 'spin' || options.type === 'spin_frost';
    this.slashMaterial.uniforms.uColorA.value.set(cfg.colors.core);
    this.slashMaterial.uniforms.uColorB.value.set(cfg.colors.glow);
    this.slashMaterial.uniforms.uColorC.value.set(cfg.colors.dark);
    this.slashMaterial.uniforms.uOpacity.value = 1;
    this.slashMaterial.uniforms.uIntensity.value = cfg.intensity;
    this.slashMaterial.uniforms.uThickness.value = cfg.thickness;
    this.slashMaterial.uniforms.uBreakup.value = cfg.breakup;
    this.slashMaterial.uniforms.uSaturation.value = cfg.saturation;
    this.slashMaterial.uniforms.uSeed.value = seed;
    this.slashMaterial.uniforms.uTime.value = 0;
    this.slashMaterial.uniforms.uProgress.value = 0;

    this.slashCoreMaterial.uniforms.uColorA.value.set(cfg.colors.core);
    this.slashCoreMaterial.uniforms.uColorB.value.set(cfg.colors.glow);
    this.slashCoreMaterial.uniforms.uColorC.value.set(cfg.colors.dark);
    this.slashCoreMaterial.uniforms.uOpacity.value = 0.95;
    this.slashCoreMaterial.uniforms.uIntensity.value = cfg.intensity * 1.25;
    this.slashCoreMaterial.uniforms.uThickness.value = cfg.thickness * 0.55;
    this.slashCoreMaterial.uniforms.uBreakup.value = cfg.breakup * 0.7;
    this.slashCoreMaterial.uniforms.uSaturation.value = cfg.saturation * 0.85;
    this.slashCoreMaterial.uniforms.uSeed.value = seed + 3.7;
    this.slashCoreMaterial.uniforms.uTime.value = 0;
    this.slashCoreMaterial.uniforms.uProgress.value = 0;

    // Shockwave
    this.shockwaveMaterial.uniforms.uColorA.value.set(cfg.colors.core);
    this.shockwaveMaterial.uniforms.uColorB.value.set(cfg.colors.glow);
    this.shockwaveMaterial.uniforms.uOpacity.value = 0.3;
    this.shockwaveMaterial.uniforms.uIntensity.value = 0.9;
    this.shockwaveMaterial.uniforms.uTime.value = 0;
    this.shockwaveMesh.scale.setScalar(0.35 * this.baseScale);

    // Sprites: volumes discretos, o brilho tem que vir do arco, não de uma
    // bola radial no meio da lâmina.
    (this.glowSprite.material as THREE.SpriteMaterial).opacity = GLOW_CENTER_OPACITY;
    this.glowSprite.position.set(0, 0.15, 0.45);
    this.glowSprite.scale.setScalar(0.55 * this.baseScale);
    (this.glowSprite.material as THREE.SpriteMaterial).color.set(cfg.colors.glow);

    this.showImpact = options.hasImpact ?? true;
    (this.impactSprite.material as THREE.SpriteMaterial).opacity = this.showImpact ? 0.55 : 0;
    this.impactSprite.position.set(0, 0.12, cfg.outer * 0.88);
    this.impactSprite.scale.setScalar(1.1 * this.baseScale);
    (this.impactSprite.material as THREE.SpriteMaterial).color.set(cfg.colors.core);

    (this.edgeGlow1.material as THREE.SpriteMaterial).opacity = 0.75;
    this.edgeGlow1.position.set(
      Math.sin(cfg.theta * 0.42) * cfg.outer * 0.92,
      0.18,
      Math.cos(cfg.theta * 0.42) * cfg.outer * 0.92
    );
    this.edgeGlow1.scale.setScalar(0.9 * this.baseScale);
    (this.edgeGlow1.material as THREE.SpriteMaterial).color.set(cfg.colors.glow);

    (this.edgeGlow2.material as THREE.SpriteMaterial).opacity = 0.75;
    (this.edgeGlow2.material as THREE.SpriteMaterial).color.set(cfg.colors.glow);
    this.edgeGlow2.position.set(
      Math.sin(-cfg.theta * 0.42) * cfg.outer * 0.92,
      0.18,
      Math.cos(-cfg.theta * 0.42) * cfg.outer * 0.92
    );
    this.edgeGlow2.scale.setScalar(0.9 * this.baseScale);

    // Luz azul do golpe, bem discreta
    this.lightHandle = this.lightPool.acquire();
    if (this.lightHandle) {
      this.lightHandle.light.color.set(cfg.colors.glow);
      // Luz fraca: antes (2,2) ela acendia o corpo do personagem de azul.
      this.lightHandle.light.intensity = 0.45 * this.baseScale;
      this.lightHandle.light.distance = 4 * this.baseScale;
      this.lightHandle.light.position.copy(this.group.position);
      this.lightHandle.light.position.y += 0.5;
    }

    // Particles - bright sparks flying outward like in image (small black dots become cyan glints)
    this.particles.setTexture(this.resources.softGlow);
    this.particles.emit(new THREE.Vector3(0, 0.2, 0.5), {
      color: cfg.colors.glow,
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

    this.voidEmbers.reset();
    if (options.type === 'dark_flame') {
      this.voidEmbers.emit(new THREE.Vector3(0, 0.22, 0.48), {
        color: 0x9b45ff,
        count: 24,
        speed: 3.1 * this.baseScale,
        spread: 1.25,
        lifetime: this.duration * 1.15,
        upwardBias: 0.3,
      });
    }
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

    // No giratório o rastro da lâmina varre o corpo junto com a animação.
    if (this.spinSweep) {
      this.group.rotation.y = this.baseYaw + progress * 2.3;
      this.group.rotation.z = Math.sin(progress * Math.PI) * 0.1;
    }

    // Expand scale slightly for large trail feel
    const scale = this.baseScale * (1 + progress * 0.22);
    this.slashMesh.scale.set(scale, 1, scale);
    this.slashCoreMesh.scale.set(scale * 1.02, 1, scale * 1.02);

    // Shockwave expands on ground
    this.shockwaveMaterial.uniforms.uTime.value = this.age * 1.35;
    this.shockwaveMaterial.uniforms.uOpacity.value = fade * 0.26;
    this.shockwaveMesh.scale.setScalar((0.35 + progress * 3.2) * this.baseScale);

    // Sprites fade and scale
    (this.glowSprite.material as THREE.SpriteMaterial).opacity = fade * GLOW_CENTER_OPACITY;
    this.glowSprite.scale.setScalar((0.55 + progress * 0.3) * this.baseScale);

    (this.impactSprite.material as THREE.SpriteMaterial).opacity = this.showImpact ? fade * 0.55 : 0;
    this.impactSprite.scale.setScalar((1.1 + progress * 0.9) * this.baseScale);
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
    this.voidEmbers.update(elapsed);

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
    this.voidEmbers.reset();
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
    this.voidEmbers.dispose();
  }

  private rebuildGeometries(inner: number, outer: number, theta: number, thetaStart?: number): void {
    const start = thetaStart ?? -theta / 2;
    const newArc = createArcRibbonGeometry(inner, outer, start, theta, 6, 48);
    const newCore = createArcRibbonGeometry(inner + 0.25, outer - 0.15, start, theta, 4, 48);
    this.slashMesh.geometry = newArc;
    this.slashCoreMesh.geometry = newCore;
    this.arcGeometry.dispose();
    this.coreGeometry.dispose();
    (this as any).arcGeometry = newArc;
    (this as any).coreGeometry = newCore;
  }
}

type WarriorHitImpactStyle = 'fire' | 'dark_flame';

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
    this.ring.name = 'WarriorImpactRing';
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;

    this.particles = new PooledParticleCloud(32, resources.softGlow);

    this.group.add(this.ring, this.glow, this.flare, this.particles.points);
  }

  public play(position: THREE.Vector3, scale = 1, style?: WarriorHitImpactStyle): void {
    const isDarkFlame = style === 'dark_flame';
    const isFire = style === 'fire' || isDarkFlame;
    const coreColor = isFire ? 0xfff1d2 : 0xffffff;
    const glowColor = isFire ? 0xff5a1f : 0x5efff6;
    const ringColor = isDarkFlame ? 0x9b45ff : glowColor;
    this.age = 0;
    this.duration = 0.32;
    this.group.visible = true;
    this.group.position.copy(position);
    this.group.position.y += 0.9;
    this.group.scale.setScalar(scale);

    (this.flare.material as THREE.SpriteMaterial).opacity = 1;
    this.flare.scale.setScalar(1.2 * scale);
    (this.flare.material as THREE.SpriteMaterial).color.set(coreColor);

    (this.glow.material as THREE.SpriteMaterial).opacity = 0.85;
    this.glow.scale.setScalar(1.8 * scale);
    (this.glow.material as THREE.SpriteMaterial).color.set(glowColor);

    this.ringMat.uniforms.uColorA.value.set(isDarkFlame ? ringColor : coreColor);
    this.ringMat.uniforms.uColorB.value.set(glowColor);
    this.ringMat.uniforms.uOpacity.value = 0.75;
    this.ringMat.uniforms.uTime.value = 0;
    this.ring.scale.setScalar(0.3 * scale);

    this.lightHandle = this.lightPool.acquire();
    if (this.lightHandle) {
      this.lightHandle.light.color.set(glowColor);
      this.lightHandle.light.intensity = 1.8 * scale;
      this.lightHandle.light.distance = 5.5 * scale;
      this.lightHandle.light.position.copy(this.group.position);
    }

    this.particles.setTexture(this.resources.softGlow);
    this.particles.emit(new THREE.Vector3(), {
      color: isDarkFlame ? ringColor : isFire ? glowColor : 0xbfffff,
      count: isDarkFlame ? 26 : 18,
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

/**
 * Onda de vento do corte: um leque de arcos finos em ")" deitados, como o
 * rastro da lâmina, que nasce na borda do rastro e voa para a frente até o
 * monstro (no máximo 7 m). São
 * vários traços finos, e não um crescente cheio — é o que faz a onda virar as
 * "linhas" de vento em vez de uma bola de luz.
 */
const WAVE_STROKES = 1;
/** Raio do leque ao nascer e ao chegar: ele abre enquanto avança. */
const WAVE_RADIUS_START = 2.4;
const WAVE_RADIUS_END = 3.4;

class WarriorTravelingSlashEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly strokes: THREE.Mesh[] = [];
  private readonly strokeGeometry: THREE.BufferGeometry;
  private readonly strokeMaterial: WarriorSlashMaterial;
  private readonly shadowStroke: THREE.Mesh;
  private readonly shadowMaterial: WarriorSlashMaterial;
  private readonly particles: PooledParticleCloud;
  private readonly voidEmbers: PooledParticleCloud;
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
  /** Espera a lâmina terminar o rastro antes de disparar a onda. */
  private spawnDelay = 0;
  private shadowActive = false;

  constructor(
    private readonly resources: WarriorSlashResources,
    private readonly lightPool: VFXLightPool
  ) {
    this.group.name = 'WarriorTravelingSlash';
    this.group.visible = false;

    // Um traço fino de raio 1: cada mesh é escalada para formar o leque.
    this.strokeGeometry = createWindCrescentGeometry(1, 0.34, 0.9, THREE.MathUtils.degToRad(160), 3, 48);
    this.strokeMaterial = createWarriorSlashMaterial({
      colorA: 0xe6faff,
      colorB: 0x2fd4ff,
      colorC: 0x062a3c,
      opacity: 1,
      intensity: 2.2,
      thickness: 1.5,
      distortion: 1.15,
      breakup: 0.5,
      saturation: 1.35,
    });
    this.shadowMaterial = createWarriorSlashMaterial({
      colorA: 0xd6adff,
      colorB: 0x7730d8,
      colorC: 0x160626,
      opacity: 0,
      intensity: 1.4,
      thickness: 1.75,
      distortion: 1.25,
      breakup: 0.42,
      saturation: 1.3,
    });
    this.shadowStroke = new THREE.Mesh(this.strokeGeometry, this.shadowMaterial);
    this.shadowStroke.name = 'DarkFlameShadowWave';
    this.shadowStroke.frustumCulled = false;
    this.shadowStroke.renderOrder = 6;
    this.shadowStroke.visible = false;
    this.group.add(this.shadowStroke);

    for (let index = 0; index < WAVE_STROKES; index += 1) {
      const stroke = new THREE.Mesh(this.strokeGeometry, this.strokeMaterial);
      stroke.name = `WindWaveStroke${index}`;
      stroke.frustumCulled = false;
      stroke.renderOrder = 7;
      this.strokes.push(stroke);
      this.group.add(stroke);
    }

    this.particles = new PooledParticleCloud(32, resources.softGlow);
    this.voidEmbers = new PooledParticleCloud(28, resources.softGlow);
    this.voidEmbers.points.name = 'DarkFlameVoidSparks';
    this.group.add(this.particles.points, this.voidEmbers.points);
  }

  public play(options: WarriorTravelingSlashOptions): void {
    this.startPos.copy(options.start);
    this.targetPos.copy(options.target);
    this.forward.copy(options.forward).setY(0).normalize();
    if (this.forward.lengthSq() <= 1e-6) this.forward.set(0, 0, 1);
    this.baseScale = options.scale ?? 1;
    this.speed = options.speed ?? (options.type === 'auto' ? 13.5 : 11.5);
    this.onHit = options.onHit ?? null;
    this.hasHit = false;
    this.shadowActive = options.type === 'dark_flame';
    this.shadowStroke.visible = this.shadowActive;

    // O fan normal termina em 7 m; Corte Duplo ganha o alcance especial de
    // 10 m. `frontDistance` é a distância da frente da onda até a origem.
    const delta = this.targetPos.clone().sub(this.startPos);
    delta.y = 0;
    // Mira no monstro, mas sem passar de 30° fora do eixo do golpe, para a
    // onda continuar legível como o prolongamento do corte da espada.
    if (delta.lengthSq() > 1e-6) {
      const aim = delta.clone().normalize();
      const angle = Math.acos(THREE.MathUtils.clamp(aim.dot(this.forward), -1, 1));
      if (angle > 1e-3) {
        this.forward.lerp(aim, Math.min(1, THREE.MathUtils.degToRad(30) / angle)).normalize();
      }
    }
    const maxDistance = this.shadowActive
      ? WARRIOR_CUT_FAN_RANGE_METERS
      : WIND_WAVE_MAX_DISTANCE;
    const frontDistance = THREE.MathUtils.clamp(
      delta.length(),
      WIND_WAVE_START_OFFSET,
      maxDistance
    );
    this.distance = Math.max(0, frontDistance - WIND_WAVE_START_OFFSET);
    // O grupo é o arco da frente: ele nasce na borda do rastro e chega no alvo.
    this.startPos.addScaledVector(this.forward, WIND_WAVE_START_OFFSET);
    const target = this.startPos.clone().addScaledVector(this.forward, this.distance);
    target.y = this.startPos.y;
    this.targetPos.copy(target);
    this.duration = this.distance / this.speed + 0.3;
    this.spawnDelay = 0.04;
    this.age = -this.spawnDelay;

    this.group.visible = false;
    this.group.position.copy(this.startPos);
    this.group.position.y += WIND_WAVE_HEIGHT;
    this.group.scale.setScalar(this.baseScale);

    const yaw = Math.atan2(this.forward.x, this.forward.z);
    this.group.rotation.set(0, yaw, 0);

    const cfg = configForType(options.type);
    this.strokeMaterial.uniforms.uColorA.value.set(cfg.colors.core);
    this.strokeMaterial.uniforms.uColorB.value.set(cfg.colors.glow);
    this.strokeMaterial.uniforms.uColorC.value.set(cfg.colors.dark);
    this.strokeMaterial.uniforms.uOpacity.value = 1;
    this.strokeMaterial.uniforms.uIntensity.value = cfg.intensity * 1.35;
    this.strokeMaterial.uniforms.uSaturation.value = cfg.saturation;
    this.strokeMaterial.uniforms.uBreakup.value = cfg.breakup;
    const seed = Math.random() * 10;
    this.strokeMaterial.uniforms.uSeed.value = seed;
    this.strokeMaterial.uniforms.uTime.value = 0;
    this.strokeMaterial.uniforms.uProgress.value = 0;

    this.shadowMaterial.uniforms.uColorA.value.set(0xd6adff);
    this.shadowMaterial.uniforms.uColorB.value.set(0x7730d8);
    this.shadowMaterial.uniforms.uColorC.value.set(0x160626);
    this.shadowMaterial.uniforms.uOpacity.value = this.shadowActive ? 0.58 : 0;
    this.shadowMaterial.uniforms.uIntensity.value = this.shadowActive ? 1.5 : 0;
    this.shadowMaterial.uniforms.uSaturation.value = 1.35;
    this.shadowMaterial.uniforms.uBreakup.value = 0.42;
    this.shadowMaterial.uniforms.uSeed.value = seed + 4.7;
    this.shadowMaterial.uniforms.uTime.value = 0;
    this.shadowMaterial.uniforms.uProgress.value = 0;

    this.layoutStrokes(0);

    this.actualLightHandle = this.lightPool.acquire();
    if (this.actualLightHandle) {
      this.actualLightHandle.light.color.set(cfg.colors.glow);
      this.actualLightHandle.light.intensity = 0.3 * this.baseScale;
      this.actualLightHandle.light.distance = 4 * this.baseScale;
      this.actualLightHandle.light.position.copy(this.group.position);
    }

    this.particles.setTexture(this.resources.softGlow);
    this.particles.emit(new THREE.Vector3(0.4, 0.2, 0), {
      color: cfg.colors.glow,
      count: 10,
      speed: 1.8,
      spread: 1.2,
      lifetime: this.duration,
      upwardBias: 0.1,
    });
    this.voidEmbers.reset();
    if (this.shadowActive) {
      this.voidEmbers.emit(new THREE.Vector3(-0.35, 0.24, 0), {
        color: 0x9b45ff,
        count: 22,
        speed: 2.8,
        spread: 1.15,
        lifetime: this.duration * 0.95,
        upwardBias: 0.22,
      });
    }
  }

  /**
   * O fan comum chega a 7 m; o de Corte Duplo cresce com uma borda violeta e
   * corre até 10 m, mantendo a barriga voltada para o alvo.
   */
  private layoutStrokes(progress: number): void {
    const radius = THREE.MathUtils.lerp(WAVE_RADIUS_START, WAVE_RADIUS_END, progress);
    for (const stroke of this.strokes) {
      stroke.scale.set(radius, 1, radius);
      stroke.position.set(0, 0, 0);
      stroke.rotation.x = WIND_WAVE_PITCH;
    }
    if (this.shadowActive) {
      this.shadowStroke.scale.set(radius * 1.18, 1.04, radius * 1.18);
      this.shadowStroke.position.set(0, -0.08, -0.06);
      this.shadowStroke.rotation.x = WIND_WAVE_PITCH;
    }
  }

  public update(delta: number): boolean {
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    // Espera a lâmina fechar o rastro antes de soltar a onda.
    if (this.age < 0) {
      this.group.visible = false;
      return true;
    }
    this.group.visible = true;
    const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
    const travelProgress = THREE.MathUtils.clamp(
      this.age / Math.max(0.001, this.distance / this.speed),
      0,
      1
    );

    const currentPos = this.startPos.clone().lerp(this.targetPos, travelProgress);
    currentPos.y = this.startPos.y + WIND_WAVE_HEIGHT;
    this.group.position.copy(currentPos);

    const fade = 1 - progress;
    setWarriorSlashTime(this.strokeMaterial, this.age * 2.4, travelProgress * 0.5);
    setWarriorSlashTime(this.shadowMaterial, this.age * 2.9, travelProgress * 0.5);
    this.strokeMaterial.uniforms.uOpacity.value = fade;
    this.shadowMaterial.uniforms.uOpacity.value = this.shadowActive ? fade * 0.58 : 0;
    this.layoutStrokes(travelProgress);

    if (this.actualLightHandle) {
      this.actualLightHandle.light.intensity *= Math.max(0, 1 - elapsed * 5);
      this.actualLightHandle.light.position.copy(this.group.position);
    }

    this.particles.update(elapsed);
    this.voidEmbers.update(elapsed);

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
    this.voidEmbers.reset();
    this.shadowActive = false;
    this.shadowStroke.visible = false;
    this.shadowMaterial.uniforms.uOpacity.value = 0;
    this.strokeMaterial.uniforms.uOpacity.value = 0;
  }

  public dispose(): void {
    this.strokeGeometry.dispose();
    this.strokeMaterial.dispose();
    this.shadowMaterial.dispose();
    this.particles.dispose();
    this.voidEmbers.dispose();
  }
}

interface WarriorVerticalArcOptions {
  readonly position: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly type?: WarriorSlashPlayOptions['type'];
  readonly scale?: number;
  readonly tint?: number;
}

/* ════════════════════════ PULO ATACANDO (skill 3) ════════════════════════ */

export interface WarriorJumpDiveOptions {
  /** Posição dos pés do personagem no momento do cast. */
  readonly position: THREE.Vector3;
  /** Direção planar do ataque. */
  readonly forward: THREE.Vector3;
  /** Segundos até a espada bater no chão (impacto no fim da animação). */
  readonly impactDelay?: number;
  readonly scale?: number;
}

interface JumpDiveShakeRequest {
  readonly intensity: number;
  readonly duration: number;
}

/**
 * Pulo Atacando: SEM rastro de lâmina e SEM linha no chão. Todo o efeito é o
 * IMPACTO, no frame exato em que a espada bate no chão: um TORNADO DE CHAMAS
 * GRANDE sobe girando de um ponto BEM À FRENTE do herói — três fitas
 * helicoidais de fogo formando o funil, chamas lambendo a boca — junto da
 * onda de choque, clarão, faíscas e brasas. Inimigos num raio de 4 metros
 * são levantados por 1 segundo em chamas (aplicado pelo Game).
 */
/** Onde a espada bate no chão, em metros à frente dos pés (bem afastado do herói). */
const JUMP_DIVE_IMPACT_AHEAD = 4;
/** Altura do tornado de chamas, em metros. */
const JUMP_DIVE_TORNADO_HEIGHT = 11.5;
/** O funil: largo no chão, fechando ao subir (raio base e topo, em metros). */
const JUMP_DIVE_TORNADO_RADIUS_BASE = 3.2;
const JUMP_DIVE_TORNADO_RADIUS_TOP = 0.65;
/** Segundos de vida do tornado a partir do impacto. */
const JUMP_DIVE_TORNADO_TIME = 1.25;
/** O tornado nasce JÁ GIGANTE em décimos de segundo (impacto é instantâneo). */
const JUMP_DIVE_TORNADO_POP_IN = 0.12;
/** Margem após a vida do tornado antes de devolver o slot ao pool. */
const JUMP_DIVE_END_BUFFER = 0.35;
const JUMP_DIVE_TORNADO_BANDS = 3;
const JUMP_DIVE_BASE_FLAMES = 16;
/** Segundos do clarão vertical no ponto de impacto. */
const JUMP_DIVE_FLARE_TIME = 0.3;
/** Segundos da onda de choque expandindo no chão após o impacto. */
const JUMP_DIVE_SHOCKWAVE_TIME = 0.55;

/**
 * Cada fita do tornado: [voltas da hélice, largura da fita, rad/s do giro].
 * A fita de dentro gira mais rápido, como o miolo de um redemoinho de fogo.
 */
const JUMP_TORNADO_BAND_PARAMS: readonly (readonly [number, number, number])[] = [
  [2.4, 1.7, 2.6],
  [3.0, 1.4, 3.9],
  [3.7, 1.05, 5.4],
];

/**
 * UMA FITA DO TORNADO: superfície helicoidal enrolada num cone (funil). É a
 * mesma fita de energia do rastro do giratório, só que enrolada em espiral:
 * girando o mesh, o fogo sobe em hélice como um tornado de chamas de verdade.
 */
function createFireTornadoBandGeometry(
  turns: number,
  height: number,
  radiusBase: number,
  radiusTop: number,
  bandWidth: number,
  angularSegments: number
): THREE.BufferGeometry {
  const vertexCount = (angularSegments + 1) * 2;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  for (let a = 0; a <= angularSegments; a++) {
    const t = a / angularSegments;
    const angle = t * turns * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Funil: o raio fecha devagar (o olho do tornado fica estreito no topo).
    const radius = THREE.MathUtils.lerp(radiusBase, radiusTop, Math.pow(t, 0.8));
    const half = (bandWidth * 0.5) * (1 - 0.3 * t);
    const inner = Math.max(0.04, radius - half);
    const outer = radius + half;
    const y = t * height;
    const base = a * 2;
    positions[base * 3] = cos * inner;
    positions[base * 3 + 1] = y;
    positions[base * 3 + 2] = sin * inner;
    positions[(base + 1) * 3] = cos * outer;
    positions[(base + 1) * 3 + 1] = y;
    positions[(base + 1) * 3 + 2] = sin * outer;
    // u sobe com a hélice: as estrias do shader correm para cima do tornado.
    uvs[base * 2] = t;
    uvs[base * 2 + 1] = 0;
    uvs[(base + 1) * 2] = t;
    uvs[(base + 1) * 2 + 1] = 1;
  }
  for (let a = 0; a < angularSegments; a++) {
    const i0 = a * 2;
    const i1 = a * 2 + 1;
    const i2 = (a + 1) * 2 + 1;
    const i3 = (a + 1) * 2;
    indices.push(i0, i1, i2);
    indices.push(i0, i2, i3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Pulo Atacando do guerreiro: só o IMPACTO no fim da animação. Quando a
 * espada bate no chão, um TORNADO DE CHAMAS GIGANTE nasce de uma vez, gira
 * vivo e apaga, junto com a onda de choque enorme, o clarão, as faíscas e
 * as brasas — tudo no mesmo frame do golpe.
 */
class WarriorJumpDiveEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  /** Tudo que nasce no ponto onde a espada bate. */
  private readonly impactGroup = new THREE.Group();
  /** O tornado: fitas espiraladas + chamas da base. */
  private readonly tornadoGroup = new THREE.Group();
  private readonly tornadoBands: THREE.Mesh[] = [];
  private readonly tornadoBandMaterials: WarriorSlashMaterial[] = [];
  private readonly baseFlames: THREE.Sprite[] = [];
  private readonly shockwaveMesh: THREE.Mesh;
  private readonly flareSprite: THREE.Sprite;
  private readonly baseGlowSprite: THREE.Sprite;
  private readonly shockwaveMaterial: EnergyShaderMaterial;
  private readonly tornadoBandGeometries: THREE.BufferGeometry[] = [];
  private readonly sparks: PooledParticleCloud;
  private readonly embers: PooledParticleCloud;
  private lightHandle: VFXLightHandle | null = null;

  private age = 0;
  private impactDelay = 1.15;
  private baseScale = 1;
  private impacted = false;
  private shakeRequest: JumpDiveShakeRequest | null = null;
  private readonly tmpVec = new THREE.Vector3();

  public constructor(
    private readonly resources: WarriorSlashResources,
    private readonly lightPool: VFXLightPool
  ) {
    this.group.name = 'WarriorJumpDiveVFX';
    this.group.visible = false;
    this.impactGroup.name = 'WarriorJumpDiveImpact';
    this.impactGroup.position.set(0, 0, JUMP_DIVE_IMPACT_AHEAD);
    this.tornadoGroup.name = 'WarriorJumpDiveTornado';
    this.tornadoGroup.visible = false;

    // Onda de choque no chão abrindo a partir do impacto.
    this.shockwaveMaterial = createMagicCircleMaterial({
      colorA: 0xfff0cd,
      colorB: 0xffb43c,
      opacity: 0,
      intensity: 1.8,
      thickness: 0.85,
      distortion: 1.15,
    });
    this.shockwaveMesh = new THREE.Mesh(this.resources.ring, this.shockwaveMaterial);
    this.shockwaveMesh.name = 'WarriorJumpDiveShockwave';
    this.shockwaveMesh.rotation.x = -Math.PI / 2;
    this.shockwaveMesh.position.set(0, 0.03, 0);
    this.shockwaveMesh.frustumCulled = false;
    this.shockwaveMesh.renderOrder = 4;
    this.shockwaveMesh.visible = false;

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
      sprite.visible = false;
      return sprite;
    };

    this.flareSprite = makeSprite('WarriorJumpDiveImpactFlare', resources.impactFlare, 0xfff0cd);
    this.baseGlowSprite = makeSprite('WarriorJumpDiveBaseGlow', resources.softGlow, 0xff8a2a);

    // As fitas do tornado: a de fora é mais vermelha, a de dentro mais quente.
    const bandColors: readonly (readonly [number, number, number])[] = [
      [0xffa53a, 0xff4d12, 0x6a0d00],
      [0xffd98a, 0xff7a1f, 0x7a1000],
      [0xfff3c4, 0xffa53a, 0x8a2a00],
    ];
    for (let i = 0; i < JUMP_DIVE_TORNADO_BANDS; i++) {
      const [turns, width] = JUMP_TORNADO_BAND_PARAMS[i];
      const geometry = createFireTornadoBandGeometry(
        turns,
        JUMP_DIVE_TORNADO_HEIGHT,
        JUMP_DIVE_TORNADO_RADIUS_BASE * (1 - i * 0.22),
        JUMP_DIVE_TORNADO_RADIUS_TOP + i * 0.06,
        width,
        64
      );
      const material = createWarriorSlashMaterial({
        colorA: bandColors[i][0],
        colorB: bandColors[i][1],
        colorC: bandColors[i][2],
        opacity: 0,
        intensity: 2.1 + i * 0.25,
        thickness: 1.35,
        distortion: 1.5,
        breakup: 0.62 + i * 0.06,
        saturation: 1.3,
      });
      const band = new THREE.Mesh(geometry, material);
      band.name = `WarriorJumpDiveTornadoBand${i}`;
      band.frustumCulled = false;
      band.renderOrder = 7;
      this.tornadoBandGeometries.push(geometry);
      this.tornadoBandMaterials.push(material);
      this.tornadoBands.push(band);
      this.tornadoGroup.add(band);
    }

    // Chamas lambendo a boca do funil, ao redor da base do tornado.
    const baseColors = [0xffe9c0, 0xffb457, 0xff7a1f, 0xff4d12];
    for (let i = 0; i < JUMP_DIVE_BASE_FLAMES; i++) {
      const flame = makeSprite(
        `WarriorJumpDiveBaseFlame${i}`,
        resources.softGlow,
        baseColors[i % baseColors.length]
      );
      this.baseFlames.push(flame);
      this.tornadoGroup.add(flame);
    }

    this.sparks = new PooledParticleCloud(70, resources.softGlow);
    this.embers = new PooledParticleCloud(120, resources.softGlow);

    this.impactGroup.add(this.tornadoGroup, this.shockwaveMesh, this.flareSprite, this.baseGlowSprite);
    this.group.add(this.impactGroup);
  }

  public play(options: WarriorJumpDiveOptions): void {
    const forward = new THREE.Vector3(options.forward.x, 0, options.forward.z);
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
    forward.normalize();

    this.baseScale = options.scale ?? 1;
    this.age = 0;
    this.impacted = false;
    this.shakeRequest = null;
    this.impactDelay = THREE.MathUtils.clamp(options.impactDelay ?? 1.15, 0.05, 4);

    this.group.position.copy(options.position);
    this.group.rotation.set(0, Math.atan2(forward.x, forward.z), 0);
    this.group.visible = false;

    const seed = Math.random() * 10;
    this.shockwaveMesh.visible = false;
    this.shockwaveMaterial.uniforms.uOpacity.value = 0;
    this.shockwaveMaterial.uniforms.uTime.value = 0;
    this.shockwaveMesh.scale.setScalar(1.2);
    this.tornadoGroup.visible = false;

    for (let i = 0; i < this.tornadoBandMaterials.length; i++) {
      const material = this.tornadoBandMaterials[i];
      material.uniforms.uOpacity.value = 0;
      material.uniforms.uSeed.value = seed + i * 1.9;
      material.uniforms.uTime.value = 0;
      material.uniforms.uProgress.value = 0;
    }
    for (const flame of this.baseFlames) this.resetFlameSprite(flame);

    this.flareSprite.visible = false;
    (this.flareSprite.material as THREE.SpriteMaterial).opacity = 0;
    this.baseGlowSprite.visible = false;
    (this.baseGlowSprite.material as THREE.SpriteMaterial).opacity = 0;
  }

  private resetFlameSprite(flame: THREE.Sprite): void {
    flame.visible = false;
    flame.scale.set(0.001, 0.001, 1);
    (flame.material as THREE.SpriteMaterial).opacity = 0;
  }

  /** O Game chama a cada frame; devolve o tremor do impacto uma única vez. */
  public consumeImpactShake(): JumpDiveShakeRequest | null {
    const request = this.shakeRequest;
    this.shakeRequest = null;
    return request;
  }

  public update(delta: number): boolean {
    const step = Math.max(0, delta);
    this.age += step;

    // Nada antes da espada bater no chão: o efeito é só o impacto.
    if (this.age < this.impactDelay) {
      this.group.visible = false;
      return true;
    }
    this.group.visible = true;

    if (!this.impacted) this.triggerImpact();
    this.updateImpact(step);

    this.sparks.update(step);
    this.embers.update(step);
    return this.age < this.impactDelay + JUMP_DIVE_TORNADO_TIME + JUMP_DIVE_END_BUFFER;
  }

  private triggerImpact(): void {
    this.impacted = true;
    this.tornadoGroup.visible = true;

    // Clarão vertical grande onde a espada encontra o chão.
    this.flareSprite.visible = true;
    this.flareSprite.position.set(0, 0.9, 0.1);
    this.flareSprite.scale.set(3.4, 4.6, 1);
    (this.flareSprite.material as THREE.SpriteMaterial).opacity = 0.95;

    // Brasa acesa na boca do tornado.
    this.baseGlowSprite.visible = true;
    this.baseGlowSprite.position.set(0, 0.35, 0);
    this.baseGlowSprite.scale.set(6, 3.4, 1);
    (this.baseGlowSprite.material as THREE.SpriteMaterial).opacity = 0.9;

    // A onda de choque abre no chão.
    this.shockwaveMesh.visible = true;
    this.shockwaveMesh.scale.setScalar(1.0 * this.baseScale);
    this.shockwaveMaterial.uniforms.uOpacity.value = 0.32;

    // Faíscas do golpe + brasas de fogo alimentando o tornado.
    this.sparks.setTexture(this.resources.softGlow);
    this.sparks.emit(new THREE.Vector3(0, 0.6, 0.1), {
      color: 0xffd76a,
      count: 56,
      speed: 8,
      spread: 3.6,
      lifetime: 0.75,
      upwardBias: 0.8,
    });
    this.embers.setTexture(this.resources.softGlow);
    this.embers.emit(new THREE.Vector3(0, 0.8, 0), {
      color: 0xff7a1f,
      count: 92,
      speed: 4.6,
      spread: 2.7,
      lifetime: 1.2,
      upwardBias: 2.8,
    });

    // Luz de fogo acesa no coração do tornado.
    this.lightHandle = this.lightPool.acquire();
    if (this.lightHandle) {
      const light = this.lightHandle.light;
      light.color.set(0xff9a3a);
      light.intensity = 6.5 * this.baseScale;
      light.distance = 17 * this.baseScale;
      light.position.copy(this.impactWorld(this.tmpVec.set(0, 4.2, 0)));
    }

    // Impacto pesado: tremor forte sem sacudir a câmera demais.
    this.shakeRequest = { intensity: 0.22, duration: 0.45 };
  }

  private updateImpact(step: number): void {
    const sinceImpact = this.age - this.impactDelay;

    // 1) Clarão do impacto: forte e curto.
    const flareT = THREE.MathUtils.clamp(sinceImpact / JUMP_DIVE_FLARE_TIME, 0, 1);
    this.flareSprite.visible = flareT < 1;
    (this.flareSprite.material as THREE.SpriteMaterial).opacity = (1 - flareT) * 0.95;
    this.flareSprite.scale.set(3.4 + flareT * 2.6, 4.6 + flareT * 3.4, 1);
    this.baseGlowSprite.visible = sinceImpact < JUMP_DIVE_TORNADO_TIME;
    (this.baseGlowSprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.9 - sinceImpact * 0.95);

    // 2) O TORNADO: nasce gigante no mesmo frame do golpe e vive girando.
    const tornadoT = THREE.MathUtils.clamp(sinceImpact / JUMP_DIVE_TORNADO_TIME, 0, 1);
    // Pop-in rapidíssimo — o impacto não pode esperar o fogo "crescer".
    const popIn = THREE.MathUtils.clamp(sinceImpact / JUMP_DIVE_TORNADO_POP_IN, 0, 1);
    const popScale = THREE.MathUtils.lerp(0.55, 1, popIn);
    // Sustain: depois do pop, o funil estica um pouco e apaga devagar.
    const stretch = 1 + Math.max(0, tornadoT - 0.35) * 0.28;
    const tornadoFade = tornadoT < 0.7
      ? 1
      : Math.pow(1 - (tornadoT - 0.7) / 0.3, 1.2);

    // Fogo vivo: duas frequências fora de fase tremulam o funil.
    const flickerX = 1 + Math.sin(sinceImpact * 18.7) * 0.05 + Math.sin(sinceImpact * 7.3) * 0.035;
    for (let i = 0; i < this.tornadoBands.length; i++) {
      const band = this.tornadoBands[i];
      const [, , speed] = JUMP_TORNADO_BAND_PARAMS[i];
      band.rotation.y = sinceImpact * speed + i * 2.1;
      band.scale.set(popScale * flickerX, popScale * stretch, popScale * flickerX);
      const material = this.tornadoBandMaterials[i];
      material.uniforms.uOpacity.value = tornadoFade;
      setWarriorSlashTime(material, sinceImpact * (2.2 + i * 0.5), 0);
    }

    // Chamas lambendo a boca do funil, cada uma tremulando por conta própria.
    for (let i = 0; i < this.baseFlames.length; i++) {
      const flame = this.baseFlames[i];
      const angle = (i / this.baseFlames.length) * Math.PI * 2 + sinceImpact * 2.4;
      const wobble = Math.sin(sinceImpact * 15.3 + i * 2.7) * 0.14;
      const radius = JUMP_DIVE_TORNADO_RADIUS_BASE * (0.72 + wobble);
      const envelope = Math.sin(Math.PI * Math.min(1, tornadoT / 0.85));
      flame.visible = tornadoFade > 0.02;
      flame.position.set(
        Math.cos(angle) * radius,
        0.12 + Math.abs(Math.sin(sinceImpact * 9.1 + i)) * 0.42,
        Math.sin(angle) * radius
      );
      (flame.material as THREE.SpriteMaterial).opacity = envelope * (0.55 + 0.35 * Math.abs(Math.sin(sinceImpact * 12.7 + i * 1.9)));
      const flameScale = (1.25 + 0.5 * envelope) * popScale;
      flame.scale.set(flameScale, flameScale * 2.2, 1);
    }

    // 3) A onda de choque abre grande no chão a partir do impacto.
    const shockT = THREE.MathUtils.clamp(sinceImpact / JUMP_DIVE_SHOCKWAVE_TIME, 0, 1);
    this.shockwaveMesh.scale.setScalar((1.0 + shockT * 9.5) * this.baseScale);
    this.shockwaveMaterial.uniforms.uTime.value = sinceImpact * 1.35;
    this.shockwaveMaterial.uniforms.uOpacity.value = (1 - shockT) * 0.32;

    if (this.lightHandle) {
      this.lightHandle.light.intensity *= Math.max(0, 1 - step * 1.15);
    }
  }

  /** Ponto local do impacto convertido para o mundo (o grupo só tem yaw). */
  private impactWorld(out: THREE.Vector3): THREE.Vector3 {
    const yaw = this.group.rotation.y;
    const x = out.x;
    const z = out.z + JUMP_DIVE_IMPACT_AHEAD;
    out.set(
      this.group.position.x + Math.sin(yaw) * z + Math.cos(yaw) * x,
      this.group.position.y + out.y,
      this.group.position.z + Math.cos(yaw) * z - Math.sin(yaw) * x
    );
    return out;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.impacted = false;
    this.shakeRequest = null;
    this.lightHandle?.release();
    this.lightHandle = null;

    this.tornadoGroup.visible = false;
    this.shockwaveMaterial.uniforms.uOpacity.value = 0;
    this.shockwaveMesh.visible = false;
    for (const material of this.tornadoBandMaterials) material.uniforms.uOpacity.value = 0;

    for (const flame of this.baseFlames) {
      this.resetFlameSprite(flame);
    }
    this.flareSprite.visible = false;
    (this.flareSprite.material as THREE.SpriteMaterial).opacity = 0;
    this.baseGlowSprite.visible = false;
    (this.baseGlowSprite.material as THREE.SpriteMaterial).opacity = 0;

    this.sparks.reset();
    this.embers.reset();
  }

  public dispose(): void {
    for (const geometry of this.tornadoBandGeometries) geometry.dispose();
    for (const material of this.tornadoBandMaterials) material.dispose();
    this.shockwaveMaterial.dispose();
    (this.flareSprite.material as THREE.Material).dispose();
    (this.baseGlowSprite.material as THREE.Material).dispose();
    for (const flame of this.baseFlames) {
      (flame.material as THREE.Material).dispose();
    }
    this.sparks.dispose();
    this.embers.dispose();
  }
}

/** Arco de lâmina em pé que aparece no lugar e some — o golpe do Corte Duplo. */
class WarriorVerticalArcEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly mainMesh: THREE.Mesh;
  private readonly coreMesh: THREE.Mesh;
  private readonly mainMat: WarriorSlashMaterial;
  private readonly coreMat: WarriorSlashMaterial;
  private readonly mainGeometry: THREE.BufferGeometry;
  private readonly coreGeometry: THREE.BufferGeometry;
  private age = 0;
  private duration = 0.34;
  private baseScale = 1;

  public constructor() {
    this.group.name = 'WarriorVerticalArc';
    this.group.visible = false;

    this.mainGeometry = createWindArcGeometry(1.35, 0.8, 0.9, 3, 26);
    this.coreGeometry = createWindArcGeometry(1.3, 0.28, 0.75, 2, 26);

    this.mainMat = createWarriorSlashMaterial({
      colorA: 0xfff4dc,
      colorB: 0xffa53a,
      colorC: 0x3a1c05,
      opacity: 1,
      intensity: 2.1,
      thickness: 1.3,
      distortion: 1.2,
      breakup: 0.5,
      saturation: 1.4,
    });
    this.coreMat = createWarriorSlashMaterial({
      colorA: 0xffffff,
      colorB: 0xffd79a,
      colorC: 0x4a2405,
      opacity: 0.95,
      intensity: 2.3,
      thickness: 0.6,
      distortion: 0.9,
      breakup: 0.3,
      saturation: 1.15,
    });

    this.mainMesh = new THREE.Mesh(this.mainGeometry, this.mainMat);
    this.coreMesh = new THREE.Mesh(this.coreGeometry, this.coreMat);
    this.mainMesh.frustumCulled = false;
    this.coreMesh.frustumCulled = false;
    this.mainMesh.renderOrder = 7;
    this.coreMesh.renderOrder = 8;
    this.group.add(this.mainMesh, this.coreMesh);
  }

  public play(options: WarriorVerticalArcOptions): void {
    const cfg = configForType(options.type);
    const tint = options.tint ?? cfg.colors.glow;
    const seed = Math.random() * 10;

    this.baseScale = options.scale ?? 1;
    this.duration = 0.34;
    this.age = 0;

    this.group.visible = true;
    this.group.position.copy(options.position);
    this.group.position.y += 1.1;
    const yaw = Math.atan2(options.forward.x, options.forward.z);
    this.group.rotation.set(0.05, yaw, (Math.random() - 0.5) * 0.5);
    this.group.scale.setScalar(this.baseScale * 0.55);

    this.mainMat.uniforms.uColorA.value.set(cfg.colors.core);
    this.mainMat.uniforms.uColorB.value.set(tint);
    this.mainMat.uniforms.uColorC.value.set(cfg.colors.dark);
    this.mainMat.uniforms.uOpacity.value = 1;
    this.mainMat.uniforms.uIntensity.value = cfg.intensity * 1.25;
    this.mainMat.uniforms.uBreakup.value = cfg.breakup;
    this.mainMat.uniforms.uSaturation.value = cfg.saturation;
    this.mainMat.uniforms.uSeed.value = seed;
    this.mainMat.uniforms.uTime.value = 0;
    this.mainMat.uniforms.uProgress.value = 0;

    this.coreMat.uniforms.uColorA.value.set(cfg.colors.core);
    this.coreMat.uniforms.uColorB.value.set(tint);
    this.coreMat.uniforms.uColorC.value.set(cfg.colors.dark);
    this.coreMat.uniforms.uOpacity.value = 0.95;
    this.coreMat.uniforms.uIntensity.value = cfg.intensity * 1.4;
    this.coreMat.uniforms.uBreakup.value = cfg.breakup * 0.6;
    this.coreMat.uniforms.uSaturation.value = cfg.saturation;
    this.coreMat.uniforms.uSeed.value = seed + 4.1;
    this.coreMat.uniforms.uTime.value = 0;
    this.coreMat.uniforms.uProgress.value = 0;
  }

  public update(delta: number): boolean {
    const step = Math.max(0, delta);
    this.age += step;
    const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
    const fade = Math.pow(1 - progress, 1.1);

    setWarriorSlashTime(this.mainMat, this.age * 3.2, progress);
    setWarriorSlashTime(this.coreMat, this.age * 3.6, progress);
    this.mainMat.uniforms.uOpacity.value = fade;
    this.coreMat.uniforms.uOpacity.value = fade * 0.9;

    // Abre rápido e some: o arco nasce, corta o espaço e evapora.
    const scale = this.baseScale * (0.55 + progress * 0.75);
    this.mainMesh.scale.setScalar(scale);
    this.coreMesh.scale.setScalar(scale * 1.04);

    return this.age < this.duration;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.mainMat.uniforms.uOpacity.value = 0;
    this.coreMat.uniforms.uOpacity.value = 0;
  }

  public dispose(): void {
    this.mainGeometry.dispose();
    this.coreGeometry.dispose();
    this.mainMat.dispose();
    this.coreMat.dispose();
  }
}

class WarriorSpinWaveEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly mainRing: THREE.Mesh;
  private readonly coreRing: THREE.Mesh;
  private readonly outerRing: THREE.Mesh;
  private readonly mainMat: WarriorSlashMaterial;
  private readonly coreMat: WarriorSlashMaterial;
  private readonly outerMat: EnergyShaderMaterial;
  private readonly glow: THREE.Sprite;
  private readonly flare: THREE.Sprite;
  private readonly particles: PooledParticleCloud;
  private readonly embers: PooledParticleCloud;
  private readonly mainGeo: THREE.BufferGeometry;
  private readonly coreGeo: THREE.BufferGeometry;
  private readonly outerGeo: THREE.BufferGeometry;
  private lightHandle: VFXLightHandle | null = null;

  private age = 0;
  private duration = 0.75;
  private maxRadius = 7.0;
  private baseScale = 1;
  private forward = new THREE.Vector3(0, 0, 1);

  constructor(
    private readonly resources: WarriorSlashResources,
    private readonly lightPool: VFXLightPool
  ) {
    this.group.name = 'WarriorSpinWave';
    this.group.visible = false;

    // Quase círculo completo 350° para efeito de círculo de ar quase fechado
    const almostFull = (350 * Math.PI) / 180;
    const startBack = Math.PI; // começa na costa

    this.mainGeo = createArcRibbonGeometry(0.3, 1.1, startBack, almostFull, 4, 64);
    this.coreGeo = createArcRibbonGeometry(0.45, 0.95, startBack, almostFull, 2, 64);
    this.outerGeo = createArcRibbonGeometry(0.2, 1.4, startBack, almostFull, 3, 64);

    this.mainMat = createWarriorSlashMaterial({
      colorA: SPIN_CONFIG.colors.core,
      colorB: SPIN_CONFIG.colors.glow,
      colorC: SPIN_CONFIG.colors.dark,
      opacity: 1,
      intensity: 1.75,
      thickness: 1.6,
      distortion: 1.2,
      breakup: SPIN_CONFIG.breakup,
      saturation: SPIN_CONFIG.saturation,
    });
    this.coreMat = createWarriorSlashMaterial({
      colorA: SPIN_CONFIG.colors.core,
      colorB: SPIN_CONFIG.colors.glow,
      colorC: SPIN_CONFIG.colors.dark,
      opacity: 0.95,
      intensity: 2.0,
      thickness: 0.6,
      distortion: 0.9,
      breakup: SPIN_CONFIG.breakup * 0.6,
      saturation: 1.1,
    });
    this.outerMat = createMagicCircleMaterial({
      colorA: 0xffffff,
      colorB: 0x5efff6,
      opacity: 0,
      intensity: 1.8,
      thickness: 0.9,
      distortion: 1.2,
    });

    this.mainRing = new THREE.Mesh(this.mainGeo, this.mainMat);
    this.coreRing = new THREE.Mesh(this.coreGeo, this.coreMat);
    this.outerRing = new THREE.Mesh(this.resources.ring, this.outerMat);

    this.mainRing.frustumCulled = false;
    this.coreRing.frustumCulled = false;
    this.outerRing.frustumCulled = false;
    this.mainRing.renderOrder = 6;
    this.coreRing.renderOrder = 7;
    this.outerRing.renderOrder = 5;
    this.outerRing.rotation.x = -Math.PI / 2;
    this.outerRing.position.y = 0.02;

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

    this.glow = makeSprite('SpinGlow', resources.softGlow, 0x5efff6);
    this.flare = makeSprite('SpinFlare', resources.impactFlare, 0xffffff);

    this.particles = new PooledParticleCloud(64, resources.softGlow);
    this.embers = new PooledParticleCloud(48, resources.softGlow);

    this.group.add(this.outerRing, this.mainRing, this.coreRing, this.glow, this.flare, this.particles.points, this.embers.points);
  }

  public play(options: { position: THREE.Vector3; forward: THREE.Vector3; type?: 'spin' | 'spin_frost'; scale?: number; maxRadius?: number }): void {
    const isFrost = options.type === 'spin_frost';
    const cfg = isFrost ? SPIN_FROST_CONFIG : SPIN_CONFIG;

    this.age = 0;
    this.duration = cfg.duration;
    this.maxRadius = options.maxRadius ?? cfg.waveMaxRadius ?? 7.0;
    this.baseScale = options.scale ?? 1;
    this.forward.copy(options.forward).setY(0).normalize();
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, 1);

    this.group.visible = true;
    this.group.position.copy(options.position);
    this.group.position.y += 0.35; // chão + leve altura
    this.group.scale.setScalar(1);

    const yaw = Math.atan2(this.forward.x, this.forward.z);
    this.group.rotation.set(0.08, yaw, 0);

    // Rebuild if needed for maxRadius? We scale instead
    const seed = Math.random() * 10;
    this.mainMat.uniforms.uColorA.value.set(cfg.colors.core);
    this.mainMat.uniforms.uColorB.value.set(cfg.colors.glow);
    this.mainMat.uniforms.uColorC.value.set(cfg.colors.dark);
    this.mainMat.uniforms.uOpacity.value = 1;
    this.mainMat.uniforms.uIntensity.value = cfg.intensity;
    this.mainMat.uniforms.uThickness.value = cfg.thickness;
    this.mainMat.uniforms.uBreakup.value = cfg.breakup;
    this.mainMat.uniforms.uSaturation.value = cfg.saturation;
    this.mainMat.uniforms.uSeed.value = seed;
    this.mainMat.uniforms.uTime.value = 0;
    this.mainMat.uniforms.uProgress.value = 0;

    this.coreMat.uniforms.uColorA.value.set(cfg.colors.core);
    this.coreMat.uniforms.uColorB.value.set(cfg.colors.glow);
    this.coreMat.uniforms.uColorC.value.set(cfg.colors.dark);
    this.coreMat.uniforms.uOpacity.value = 0.9;
    this.coreMat.uniforms.uIntensity.value = cfg.intensity * 1.2;
    this.coreMat.uniforms.uThickness.value = cfg.thickness * 0.5;
    this.coreMat.uniforms.uBreakup.value = cfg.breakup * 0.6;
    this.coreMat.uniforms.uSaturation.value = cfg.saturation * 0.9;
    this.coreMat.uniforms.uSeed.value = seed + 4.4;
    this.coreMat.uniforms.uTime.value = 0;
    this.coreMat.uniforms.uProgress.value = 0;

    this.outerMat.uniforms.uColorA.value.set(cfg.colors.core);
    this.outerMat.uniforms.uColorB.value.set(cfg.colors.glow);
    this.outerMat.uniforms.uOpacity.value = 0.65;
    this.outerMat.uniforms.uIntensity.value = 1.7;
    this.outerMat.uniforms.uTime.value = 0;

    (this.glow.material as THREE.SpriteMaterial).opacity = 0.75;
    (this.glow.material as THREE.SpriteMaterial).color.set(cfg.colors.glow);
    this.glow.position.set(0, 0.5, 0);
    this.glow.scale.setScalar(1.5 * this.baseScale);

    (this.flare.material as THREE.SpriteMaterial).opacity = 0.85;
    (this.flare.material as THREE.SpriteMaterial).color.set(cfg.colors.core);
    this.flare.position.set(0, 0.6, 0);
    this.flare.scale.setScalar(2.0 * this.baseScale);

    this.mainRing.scale.setScalar(0.35 * this.baseScale);
    this.coreRing.scale.setScalar(0.35 * this.baseScale);
    this.outerRing.scale.setScalar(0.4 * this.baseScale);

    this.lightHandle = this.lightPool.acquire();
    if (this.lightHandle) {
      this.lightHandle.light.color.set(cfg.colors.glow);
      this.lightHandle.light.intensity = 2.8 * this.baseScale;
      this.lightHandle.light.distance = 9 * this.baseScale;
      this.lightHandle.light.position.copy(this.group.position);
      this.lightHandle.light.position.y += 0.8;
    }

    this.particles.setTexture(this.resources.softGlow);
    this.particles.emit(new THREE.Vector3(), {
      color: cfg.colors.glow,
      count: 42,
      speed: 4.8 * this.baseScale,
      spread: 1.6,
      lifetime: this.duration * 1.1,
      upwardBias: 0.25,
    });

    this.embers.setTexture(this.resources.softGlow);
    this.embers.emit(new THREE.Vector3(), {
      color: cfg.colors.core,
      count: 28,
      speed: 3.2 * this.baseScale,
      spread: 1.3,
      lifetime: this.duration * 1.2,
      upwardBias: 0.3,
    });
  }

  public update(delta: number): boolean {
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
    const fade = 1 - progress;

    // Expansão até 7 metros: scale vai de 0.35 até maxRadius / outerRadius
    // mainGeo outer ~1.1, então scale final = maxRadius / 1.1
    const targetScale = this.maxRadius / 1.1;
    const currentScale = THREE.MathUtils.lerp(0.35, targetScale, THREE.MathUtils.clamp(progress * 1.15, 0, 1));

    setWarriorSlashTime(this.mainMat, this.age * 1.8, progress);
    setWarriorSlashTime(this.coreMat, this.age * 2.1, progress);
    this.outerMat.uniforms.uTime.value = this.age * 1.4;

    this.mainMat.uniforms.uOpacity.value = fade;
    this.coreMat.uniforms.uOpacity.value = fade * 0.9;
    this.outerMat.uniforms.uOpacity.value = fade * 0.55;

    this.mainRing.scale.setScalar(currentScale * this.baseScale);
    this.coreRing.scale.setScalar(currentScale * this.baseScale * 1.02);
    this.outerRing.scale.setScalar((0.4 + progress * (this.maxRadius / 0.26)) * this.baseScale * 0.5);

    (this.glow.material as THREE.SpriteMaterial).opacity = fade * 0.75;
    this.glow.scale.setScalar((1.5 + progress * 2.5) * this.baseScale);

    (this.flare.material as THREE.SpriteMaterial).opacity = fade * 0.85;
    this.flare.scale.setScalar((2.0 + progress * 1.8) * this.baseScale);
    (this.flare.material as THREE.SpriteMaterial).rotation = progress * 2.0;

    if (this.lightHandle) {
      this.lightHandle.light.intensity *= Math.max(0, 1 - elapsed * 4.5);
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
    this.mainMat.uniforms.uOpacity.value = 0;
    this.coreMat.uniforms.uOpacity.value = 0;
    this.outerMat.uniforms.uOpacity.value = 0;
    (this.glow.material as THREE.SpriteMaterial).opacity = 0;
    (this.flare.material as THREE.SpriteMaterial).opacity = 0;
  }

  public dispose(): void {
    this.mainGeo.dispose();
    this.coreGeo.dispose();
    this.outerGeo.dispose();
    this.mainMat.dispose();
    this.coreMat.dispose();
    this.outerMat.dispose();
    (this.glow.material as THREE.Material).dispose();
    (this.flare.material as THREE.Material).dispose();
    this.particles.dispose();
    this.embers.dispose();
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
  private readonly spinPool: VFXPool<WarriorSpinWaveEffect>;
  private readonly activeSpin: WarriorSpinWaveEffect[] = [];
  private readonly verticalArcPool: VFXPool<WarriorVerticalArcEffect>;
  private readonly activeVerticalArcs: WarriorVerticalArcEffect[] = [];
  private readonly jumpDivePool: VFXPool<WarriorJumpDiveEffect>;
  private readonly activeJumpDive: WarriorJumpDiveEffect[] = [];
  private readonly cameraShake = new CameraShake();
  /**
   * Efeitos modulares do guerreiro em um group próprio que o Game adiciona na
   * cena uma vez. Hoje só o pilar de cura do mini-boss é usado daqui; o rastro
   * de fita curva ficou desligado por duplicar o arco clássico em pool.
   */
  private readonly trails = new WarriorSlashTrailVFX();
  public readonly group: THREE.Group;

  public constructor(
    private readonly scene: THREE.Scene,
    private readonly lightPool: VFXLightPool
  ) {
    this.group = this.trails.group;
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
    this.spinPool = new VFXPool(
      () => new WarriorSpinWaveEffect(this.resources, lightPool),
      8
    );
    this.verticalArcPool = new VFXPool(() => new WarriorVerticalArcEffect(), 12);
    this.jumpDivePool = new VFXPool(
      () => new WarriorJumpDiveEffect(this.resources, lightPool),
      6
    );
  }

  /**
   * Arco de lâmina vertical que nasce no lugar — cada aresta do Corte Duplo.
   * `tint` deixa cada arco com um tom diferente dentro da mesma tempestade.
   */
  public playVerticalArc(options: WarriorVerticalArcOptions): void {
    const arc = this.verticalArcPool.acquire();
    if (!arc) return;
    arc.play(options);
    this.scene.add(arc.group);
    this.activeVerticalArcs.push(arc);
  }

  /**
   * Pulo Atacando: o MESMO rastro de lâmina do giratório (anel dourado de
   * 340° que nasce nas costas, mesma espessura), só que EM PÉ — vertical,
   * envolvendo o herói. O anel rola para frente durante o salto, engrossa e
   * termina cortando o chão na aterrissagem, rasgando um rastro reto de fogo
   * de 3 metros no piso, com as chamas subindo um pouco no ponto do impacto.
   */
  public playJumpDive(options: WarriorJumpDiveOptions): void {
    const effect = this.jumpDivePool.acquire();
    if (!effect) return;
    effect.play(options);
    this.scene.add(effect.group);
    this.activeJumpDive.push(effect);
  }

  public play(options: WarriorSlashPlayOptions): void {
    const effect = this.pool.acquire();
    if (!effect) return;
    effect.play(options);
    this.scene.add(effect.group);
    this.active.push(effect);

    // Impact shake - subtle but punchy for large blade
    const intensity = options.type === 'dark_flame'
      ? 0.078
      : options.type === 'combo3' || options.type === 'flame'
        ? 0.055
        : options.type === 'combo2'
          ? 0.038
          : options.type === 'auto'
            ? 0.042
            : options.type === 'spin' || options.type === 'spin_frost'
              ? 0.06
              : 0.03;
    const duration = options.type === 'dark_flame'
      ? 0.26
      : options.type === 'combo3' || options.type === 'flame'
        ? 0.20
        : options.type === 'auto'
          ? 0.16
          : options.type === 'spin' || options.type === 'spin_frost'
            ? 0.22
            : 0.14;
    this.cameraShake.add(intensity, duration);
  }

  public playImpact(position: THREE.Vector3, scale = 1, style?: WarriorHitImpactStyle): void {
    const impact = this.impactPool.acquire();
    if (!impact) {
      this.cameraShake.add(0.02 * scale, 0.1);
      return;
    }
    impact.play(position, scale, style);
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
    const intensity = options.type === 'dark_flame'
      ? 0.066
      : options.type === 'auto'
        ? 0.038
        : options.type === 'combo3'
          ? 0.05
          : 0.028;
    this.cameraShake.add(intensity, options.type === 'dark_flame' ? 0.19 : 0.13);
  }

  public playSpin(options: { position: THREE.Vector3; forward: THREE.Vector3; type?: 'spin' | 'spin_frost'; scale?: number; maxRadius?: number }): void {
    // Spin = rastro quase círculo completo começando na costa + círculo de ar expandindo 7m
    const spinType = options.type ?? 'spin';

    // 1. Rastro de lâmina quase círculo completo (começa na costa, rabo fino no final, meio grosso)
    this.play({
      position: options.position.clone(),
      forward: options.forward.clone(),
      type: spinType,
      scale: options.scale ?? 1.15,
    });

    // 2. Círculo de ar quase fechado expandindo até 7m (efeito corta do ar)
    const wave = this.spinPool.acquire();
    if (!wave) return;
    wave.play({
      position: options.position.clone(),
      forward: options.forward.clone(),
      type: spinType,
      scale: options.scale ?? 1.15,
      maxRadius: options.maxRadius ?? 7.0,
    });
    this.scene.add(wave.group);
    this.activeSpin.push(wave);

    // Shake mais forte para giratório
    this.cameraShake.add(spinType === 'spin_frost' ? 0.068 : 0.062, 0.24);
  }

  /**
   * O rastro modular novo (fita curva colorida por estilo) foi retirado do
   * fluxo de combate: duplicava o arco clássico em pool. Continua disponível
   * em `./warrior/` para uso pontual; aqui só o pilar de cura do mini-boss,
   * que não tem equivalente no sistema antigo, é encaminhado.
   */
  public triggerMiniBossHeal(playerRoot: THREE.Object3D): void {
    this.trails.triggerMiniBossHeal(playerRoot);
  }

  public update(delta: number): void {
    this.trails.update(delta);
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
    for (let i = this.activeSpin.length - 1; i >= 0; i--) {
      const spin = this.activeSpin[i];
      if (spin.update(delta)) continue;
      this.spinPool.release(spin);
      this.activeSpin.splice(i, 1);
    }
    for (let i = this.activeVerticalArcs.length - 1; i >= 0; i--) {
      const arc = this.activeVerticalArcs[i];
      if (arc.update(delta)) continue;
      this.verticalArcPool.release(arc);
      this.activeVerticalArcs.splice(i, 1);
    }
    for (let i = this.activeJumpDive.length - 1; i >= 0; i--) {
      const dive = this.activeJumpDive[i];
      const alive = dive.update(delta);
      // O tremor de câmera só existe quando a lâmina bate no chão; consumido
      // depois do update para valer já no frame do impacto.
      const shake = dive.consumeImpactShake();
      if (shake) this.cameraShake.add(shake.intensity, shake.duration);
      if (alive) continue;
      this.jumpDivePool.release(dive);
      this.activeJumpDive.splice(i, 1);
    }
  }

  public applyCameraShake(camera: THREE.Camera, delta: number): void {
    this.cameraShake.apply(camera, delta);
  }

  public clear(): void {
    this.trails.reset();
    for (const e of this.active) this.pool.release(e);
    this.active.length = 0;
    for (const e of this.activeImpacts) this.impactPool.release(e);
    this.activeImpacts.length = 0;
    for (const e of this.activeTraveling) this.travelingPool.release(e);
    this.activeTraveling.length = 0;
    for (const e of this.activeSpin) this.spinPool.release(e);
    this.activeSpin.length = 0;
    for (const e of this.activeVerticalArcs) this.verticalArcPool.release(e);
    this.activeVerticalArcs.length = 0;
    for (const e of this.activeJumpDive) this.jumpDivePool.release(e);
    this.activeJumpDive.length = 0;
    this.cameraShake.clear();
  }

  public dispose(): void {
    this.clear();
    this.trails.dispose();
    this.pool.dispose();
    this.impactPool.dispose();
    this.travelingPool.dispose();
    this.spinPool.dispose();
    this.verticalArcPool.dispose();
    this.jumpDivePool.dispose();
    this.resources.quad.dispose();
    this.resources.ring.dispose();
    this.resources.softGlow.dispose();
    this.resources.impactFlare.dispose();
    this.resources.slashArc.dispose();
  }

  public get activeCount(): number {
    return this.active.length
      + this.activeImpacts.length
      + this.activeTraveling.length
      + this.activeSpin.length
      + this.activeVerticalArcs.length
      + this.activeJumpDive.length;
  }
}
