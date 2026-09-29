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
import {
  WarriorSlashVFX as WarriorSlashTrailVFX,
} from './warrior/WarriorSlashVFX';

export interface WarriorSlashPlayOptions {
  readonly position: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly type?: 'basic' | 'combo2' | 'combo3' | 'auto' | 'spin' | 'spin_frost';
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
  private readonly particles: PooledParticleCloud;
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

    for (let index = 0; index < WAVE_STROKES; index += 1) {
      const stroke = new THREE.Mesh(this.strokeGeometry, this.strokeMaterial);
      stroke.name = `WindWaveStroke${index}`;
      stroke.frustumCulled = false;
      stroke.renderOrder = 7;
      this.strokes.push(stroke);
      this.group.add(stroke);
    }

    this.particles = new PooledParticleCloud(32, resources.softGlow);
    this.group.add(this.particles.points);
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

    // A onda sai da borda do rastro da lâmina e voa para a frente até bater no
    // monstro, sem nunca passar de 7 m do jogador. `frontDistance` é a
    // distância do arco da frente até o jogador.
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
    const frontDistance = THREE.MathUtils.clamp(
      delta.length(),
      WIND_WAVE_START_OFFSET,
      WIND_WAVE_MAX_DISTANCE
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
    this.strokeMaterial.uniforms.uSeed.value = Math.random() * 10;
    this.strokeMaterial.uniforms.uTime.value = 0;
    this.strokeMaterial.uniforms.uProgress.value = 0;

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
  }

  /**
   * Um único leque grande de vento, deitado como o rastro da lâmina, com a
   * barriga para o monstro. Ele abre enquanto avança até o alvo (máx. 7 m).
   */
  private layoutStrokes(progress: number): void {
    const radius = THREE.MathUtils.lerp(WAVE_RADIUS_START, WAVE_RADIUS_END, progress);
    for (const stroke of this.strokes) {
      stroke.scale.set(radius, 1, radius);
      stroke.position.set(0, 0, 0);
      stroke.rotation.x = WIND_WAVE_PITCH;
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
    this.strokeMaterial.uniforms.uOpacity.value = fade;
    this.layoutStrokes(travelProgress);

    if (this.actualLightHandle) {
      this.actualLightHandle.light.intensity *= Math.max(0, 1 - elapsed * 5);
      this.actualLightHandle.light.position.copy(this.group.position);
    }

    this.particles.update(elapsed);

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
    this.strokeMaterial.uniforms.uOpacity.value = 0;
  }

  public dispose(): void {
    this.strokeGeometry.dispose();
    this.strokeMaterial.dispose();
    this.particles.dispose();
  }
}

interface WarriorVerticalArcOptions {
  readonly position: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly type?: WarriorSlashPlayOptions['type'];
  readonly scale?: number;
  readonly tint?: number;
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

  public play(options: WarriorSlashPlayOptions): void {
    const effect = this.pool.acquire();
    if (!effect) return;
    effect.play(options);
    this.scene.add(effect.group);
    this.active.push(effect);

    // Impact shake - subtle but punchy for large blade
    const intensity = options.type === 'combo3' ? 0.055 : options.type === 'combo2' ? 0.038 : options.type === 'auto' ? 0.042 : options.type === 'spin' || options.type === 'spin_frost' ? 0.06 : 0.03;
    const duration = options.type === 'combo3' ? 0.20 : options.type === 'auto' ? 0.16 : options.type === 'spin' || options.type === 'spin_frost' ? 0.22 : 0.14;
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
      + this.activeVerticalArcs.length;
  }
}
