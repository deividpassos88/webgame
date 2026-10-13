import * as THREE from 'three';
import type { PoolableVFX } from '../VFXPool';
import { VFXLightPool, type VFXLightHandle } from '../VFXLightPool';
import { PooledParticleCloud } from '../ParticleManager';
import { createMagicCircleMaterial, type EnergyShaderMaterial } from '../VFXMaterials';

/**
 * Golpe Flamejante — VÓRTICE DE ÁGUA/ENERGIA.
 *
 * Referência visual (imagem enviada pelo usuário): um redemoinho azul de
 * aparência molhada, com anéis empilhados que abrem para cima, fitas em
 * espiral correndo pela parede do funil, miolo quase branco, detritos escuros
 * girando em volta e uma coroa de gotas batendo no chão. Tudo iluminado por
 * uma luz azul forte, com sombra (piscina escura) na base e nos vãos entre os
 * anéis.
 *
 * Como o efeito é montado (poucas draw calls, nada de alocação por frame):
 * - 3 FITAS HELICOIDAIS em geometria própria (cone invertido: larga em cima,
 *   ponta fina no chão) com shader dedicado — estrias de correnteza que sobem
 *   a espiral, fio de luz no meio da fita e azul profundo nas bordas.
 * - 5 ANÉIS (torus) abraçando o cone, cada um com o seu shader de "clarão
 *   correndo pelo aro" e fase própria: é o empilhado luminoso da imagem.
 * - 2 DISCOS DE ONDULAÇÃO no topo (o "espelho d'água"): anéis concêntricos
 *   girando, miolo branco na boca do funil e borda escurecendo (sombra).
 * - 10 DETRITOS escuros girando em órbitas e tombando (pedras da imagem).
 * - COROA DE GOTAS: sprites com física simples (sobem, abrem e caem) + uma
 *   nuvem de partículas de spray ciano.
 * - 1 piscina escura no chão (sombra), 1 anel de choque e 1 luz azul do pool.
 */

/** Boca do funil (topo), em metros. */
export const WATER_VORTEX_TOP_RADIUS = 3.3;
/** Ponta do funil (no chão), em metros. */
export const WATER_VORTEX_TIP_RADIUS = 0.42;
/** Altura do funil, em metros. */
export const WATER_VORTEX_HEIGHT = 5.4;
/** Segundos do nascimento (pop-in) do vórtice. */
export const WATER_VORTEX_RISE_SECONDS = 0.16;
/** Segundos girando cheio antes de começar a apagar. */
export const WATER_VORTEX_HOLD_SECONDS = 1.15;
/** Segundos de apagamento. */
export const WATER_VORTEX_FADE_SECONDS = 0.42;
/** Vida total do efeito (nascimento + giro + apagamento). */
export const WATER_VORTEX_TOTAL_SECONDS =
  WATER_VORTEX_RISE_SECONDS + WATER_VORTEX_HOLD_SECONDS + WATER_VORTEX_FADE_SECONDS;
/** Quantas fitas em espiral formam a parede do funil. */
const WATER_VORTEX_BANDS = 3;
/** Quantos anéis empilhados abraçam o cone. */
const WATER_VORTEX_RINGS = 5;
/** Quantos detritos escuros giram em volta. */
const WATER_VORTEX_DEBRIS = 10;
/** Quantas gotas formam a coroa de respingo. */
const WATER_VORTEX_DROPS = 14;
/** Gravidade da coroa de gotas (m/s²), mais leve que a real para durar mais. */
const WATER_VORTEX_DROP_GRAVITY = 9.4;
/** Vida de cada partícula do spray de água, em segundos. */
const WATER_VORTEX_SPRAY_SECONDS = 0.85;
/** Intervalo entre jatos de spray que sobem pela parede do funil. */
const WATER_VORTEX_SPRAY_INTERVAL = 0.16;

/** Paleta da imagem: branco-água no miolo, ciano vivo, azul profundo e sombra. */
export const WATER_VORTEX_COLORS = {
  core: 0xeafcff,
  bright: 0x8beeff,
  mid: 0x27b4ff,
  deep: 0x0b46d6,
  dark: 0x03102e,
} as const;

interface WaterVortexResources {
  readonly softGlow: THREE.Texture;
  readonly impactFlare: THREE.Texture;
  readonly quad: THREE.PlaneGeometry;
  readonly ring: THREE.RingGeometry;
}

export interface WaterVortexOptions {
  readonly position: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly scale?: number;
}

/** Pedido de tremor de câmera devolvido uma única vez ao Game. */
export interface WaterVortexShakeRequest {
  readonly intensity: number;
  readonly duration: number;
}

/* ------------------------------------------------------------------------ */
/* Shaders próprios do vórtice                                                */
/* ------------------------------------------------------------------------ */

const VORTEX_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Fita do funil: vUv.x corre ao longo da hélice (0 na ponta, 1 na boca) e
 * vUv.y atravessa a fita (0 na borda interna, 1 na externa).
 */
function createVortexBandMaterial(options: {
  readonly opacity: number;
  readonly intensity: number;
  readonly seed: number;
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: options.opacity },
      uIntensity: { value: options.intensity },
      uSeed: { value: options.seed },
      uCore: { value: new THREE.Color(WATER_VORTEX_COLORS.core) },
      uBright: { value: new THREE.Color(WATER_VORTEX_COLORS.bright) },
      uMid: { value: new THREE.Color(WATER_VORTEX_COLORS.mid) },
      uDeep: { value: new THREE.Color(WATER_VORTEX_COLORS.deep) },
    },
    vertexShader: VORTEX_VERTEX,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uOpacity;
      uniform float uIntensity;
      uniform float uSeed;
      uniform vec3 uCore;
      uniform vec3 uBright;
      uniform vec3 uMid;
      uniform vec3 uDeep;
      varying vec2 vUv;
      void main() {
        float along = clamp(vUv.x, 0.0, 1.0);
        float across = abs(vUv.y - 0.5) * 2.0;

        // Fio de luz no meio da fita, com a água escurecendo para as bordas.
        float core = pow(1.0 - across, 1.7);
        float edge = pow(1.0 - across, 0.55);

        // Correnteza: estrias que sobem a espiral (duas frequências fora de fase).
        float flow = 0.66 + 0.34 * sin(along * 34.0 - uTime * 5.2 + uSeed);
        float shimmer = 0.78 + 0.22 * sin(along * 9.0 - uTime * 2.1 + uSeed * 3.1);

        // Nem a ponta nem a boca terminam em corte reto.
        float fadeBottom = smoothstep(0.0, 0.09, along);
        float fadeTop = 1.0 - smoothstep(0.74, 1.0, along) * 0.5;

        // Sombra no lado de fora da fita: é o vão escuro entre os anéis.
        float shadow = 1.0 - 0.42 * smoothstep(0.5, 1.0, across);

        vec3 color = mix(uDeep, uMid, edge);
        color = mix(color, uBright, pow(edge, 2.0));
        color = mix(color, uCore, pow(core, 1.3));

        float alpha = core * flow * shimmer * fadeBottom * fadeTop * shadow * uOpacity;
        gl_FragColor = vec4(color * uIntensity, clamp(alpha, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/**
 * Anel empilhado (torus): vUv.x dá a volta no aro e vUv.y atravessa o tubo.
 * O brilho corre pelo aro e o tubo tem bordas suaves, como água iluminada.
 */
function createVortexRingMaterial(options: {
  readonly opacity: number;
  readonly intensity: number;
  readonly phase: number;
  readonly streaks: number;
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: options.opacity },
      uIntensity: { value: options.intensity },
      uPhase: { value: options.phase },
      uStreaks: { value: options.streaks },
      uColor: { value: new THREE.Color(WATER_VORTEX_COLORS.bright) },
      uDeep: { value: new THREE.Color(WATER_VORTEX_COLORS.deep) },
    },
    vertexShader: VORTEX_VERTEX,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uOpacity;
      uniform float uIntensity;
      uniform float uPhase;
      uniform float uStreaks;
      uniform vec3 uColor;
      uniform vec3 uDeep;
      varying vec2 vUv;
      void main() {
        float tube = pow(1.0 - abs(vUv.y - 0.5) * 2.0, 0.55);
        float wave = 0.5 + 0.5 * sin(vUv.x * 6.28318 * uStreaks - uTime * 3.4 + uPhase);
        float streak = 0.42 + 0.58 * pow(wave, 2.0);
        // Metade de dentro do aro fica azul profundo: dá volume ao anel.
        float depth = smoothstep(0.35, 1.0, vUv.y);
        vec3 color = mix(uDeep, uColor, streak);
        float alpha = tube * streak * uOpacity;
        gl_FragColor = vec4(color * uIntensity, clamp(alpha, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/**
 * Espelho d'água do topo (CAMADA DE LUZ): anéis concêntricos girando e o ARO
 * brilhante em volta do olho do vórtice. O miolo em si NÃO é claro — na
 * referência o centro é um buraco escuro; quem desenha a escuridão é a camada
 * de sombra logo abaixo.
 */
function createVortexSurfaceMaterial(options: {
  readonly opacity: number;
  readonly intensity: number;
  readonly rings: number;
  readonly speed: number;
  readonly twist: number;
  readonly mouthRadius: number;
  readonly outerFade: number;
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: options.opacity },
      uIntensity: { value: options.intensity },
      uRings: { value: options.rings },
      uSpeed: { value: options.speed },
      uTwist: { value: options.twist },
      uMouth: { value: options.mouthRadius },
      uOuterFade: { value: options.outerFade },
      uCore: { value: new THREE.Color(WATER_VORTEX_COLORS.core) },
      uBright: { value: new THREE.Color(WATER_VORTEX_COLORS.bright) },
      uMid: { value: new THREE.Color(WATER_VORTEX_COLORS.mid) },
      uDark: { value: new THREE.Color(WATER_VORTEX_COLORS.dark) },
    },
    vertexShader: VORTEX_VERTEX,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uOpacity;
      uniform float uIntensity;
      uniform float uRings;
      uniform float uSpeed;
      uniform float uTwist;
      uniform float uMouth;
      uniform float uOuterFade;
      uniform vec3 uCore;
      uniform vec3 uBright;
      uniform vec3 uMid;
      uniform vec3 uDark;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float angle = atan(p.y, p.x);

        // Anéis em espiral viajando para fora, girando com o vórtice.
        float phase = r * uRings - uTime * uSpeed + angle * uTwist;
        float ring = pow(abs(sin(phase * 3.14159)), 3.0);
        // Aro aceso na borda do olho: é ele que recorta o buraco escuro.
        float eyeRim = 1.0 - smoothstep(0.0, 0.055, abs(r - uMouth));
        float rim = smoothstep(1.0, uOuterFade, r);

        vec3 color = mix(uMid, uBright, ring);
        color = mix(color, uCore, eyeRim);

        float alpha = (ring * 0.55 + eyeRim * 0.95) * rim * uOpacity;
        gl_FragColor = vec4(color * uIntensity, clamp(alpha, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/**
 * CAMADA DE SOMBRA (blending normal): é ela que dá o contraste da referência.
 * Desenha as faixas ESCURAS entre os anéis, o miolo do olho e o vão entre as
 * fitas do funil — em modo aditivo seria impossível escurecer a cena.
 */
function createVortexShadowMaterial(options: {
  readonly opacity: number;
  readonly mode: 'surface' | 'band';
  readonly rings: number;
  readonly speed: number;
  readonly twist: number;
  readonly mouthRadius: number;
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: options.opacity },
      uRings: { value: options.rings },
      uSpeed: { value: options.speed },
      uTwist: { value: options.twist },
      uMouth: { value: options.mouthRadius },
      uMode: { value: options.mode === 'surface' ? 1 : 0 },
      uDark: { value: new THREE.Color(WATER_VORTEX_COLORS.dark) },
      uDeep: { value: new THREE.Color(WATER_VORTEX_COLORS.deep) },
    },
    vertexShader: VORTEX_VERTEX,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uOpacity;
      uniform float uRings;
      uniform float uSpeed;
      uniform float uTwist;
      uniform float uMouth;
      uniform float uMode;
      uniform vec3 uDark;
      uniform vec3 uDeep;
      varying vec2 vUv;
      void main() {
        float alpha;
        float depth;
        if (uMode > 0.5) {
          // Disco do topo: a sombra preenche os vãos entre os anéis e o olho.
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          if (r > 1.0) discard;
          float angle = atan(p.y, p.x);
          float phase = r * uRings - uTime * uSpeed + angle * uTwist;
          float ring = pow(abs(sin(phase * 3.14159)), 3.0);
          float gaps = (1.0 - ring) * smoothstep(0.16, 0.5, r);
          float eye = smoothstep(uMouth * 1.2, uMouth * 0.25, r);
          alpha = (gaps * 0.6 + eye * 0.95) * smoothstep(1.0, 0.7, r);
          depth = eye;
        } else {
          // Fita do funil: a sombra fecha a borda externa da fita (o vão
          // escuro entre uma fita e a próxima) e a base, onde bate pouca luz.
          float along = clamp(vUv.x, 0.0, 1.0);
          float across = abs(vUv.y - 0.5) * 2.0;
          float band = smoothstep(0.35, 1.0, across);
          float base = smoothstep(0.18, 0.0, along);
          alpha = (band * 0.72 + base * 0.85) * (1.0 - smoothstep(0.86, 1.0, along));
          depth = base;
        }
        vec3 color = mix(uDeep, uDark, depth);
        gl_FragColor = vec4(color, clamp(alpha * uOpacity, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
}

/**
 * UMA FITA DO FUNIL: superfície helicoidal enrolada num cone invertido — larga
 * na boca, fina na ponta. Girando o mesh, a água sobe em espiral como na
 * imagem.
 */
function createVortexBandGeometry(
  turns: number,
  height: number,
  radiusBottom: number,
  radiusTop: number,
  widthBottom: number,
  widthTop: number,
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
    // Cone invertido: a ponta no chão é fina e a boca (topo) é larga.
    const radius = THREE.MathUtils.lerp(radiusBottom, radiusTop, Math.pow(t, 1.35));
    const half = 0.5 * THREE.MathUtils.lerp(widthBottom, widthTop, t);
    const inner = Math.max(0.03, radius - half);
    const outer = radius + half;
    const y = t * height;
    const base = a * 2;
    positions[base * 3] = cos * inner;
    positions[base * 3 + 1] = y;
    positions[base * 3 + 2] = sin * inner;
    positions[(base + 1) * 3] = cos * outer;
    positions[(base + 1) * 3 + 1] = y;
    positions[(base + 1) * 3 + 2] = sin * outer;
    // u sobe pela hélice: as estrias do shader correm do chão para a boca.
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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** [voltas da hélice, largura da fita na ponta, largura na boca, rad/s]. */
const BAND_PARAMS: readonly (readonly [number, number, number, number])[] = [
  [2.2, 0.62, 1.18, 2.3],
  [2.9, 0.5, 0.95, 3.2],
  [3.6, 0.38, 0.74, 4.1],
];

/** [fração da altura, fase do brilho no aro, rad/s do giro, riscos no aro]. */
const RING_PARAMS: readonly (readonly [number, number, number, number])[] = [
  [0.2, 0.4, 1.5, 3],
  [0.35, 2.1, 1.9, 4],
  [0.5, 3.8, 2.4, 5],
  [0.66, 1.2, 3.0, 6],
  [0.82, 5.0, 3.6, 7],
];

interface DebrisOrbit {
  readonly radius: number;
  readonly height: number;
  readonly speed: number;
  readonly phase: number;
  readonly tilt: number;
  readonly spinX: number;
  readonly spinZ: number;
  readonly scale: number;
}

/** Órbitas dos detritos escuros: raio, altura, velocidade, inclinação e tombo. */
const DEBRIS_ORBITS: readonly DebrisOrbit[] = Array.from(
  { length: WATER_VORTEX_DEBRIS },
  (_, index) => {
    const golden = index * 2.399963;
    return {
      radius: 1.0 + ((index * 7) % WATER_VORTEX_DEBRIS) / WATER_VORTEX_DEBRIS * 1.9,
      height: 0.55 + ((index * 5) % 7) / 7 * 2.6,
      speed: 1.5 + (index % 4) * 0.45,
      phase: golden,
      tilt: 0.5 + (index % 3) * 0.35,
      spinX: 1.1 + (index % 5) * 0.6,
      spinZ: 1.7 + (index % 4) * 0.55,
      scale: 0.72 + ((index * 3) % 5) / 5 * 0.95,
    };
  }
);

interface DropState {
  readonly sprite: THREE.Sprite;
  readonly velocity: THREE.Vector3;
  readonly scale: number;
}

/** Coroa de gotas: altura e abertura amarradas ao índice (sem aleatório). */
const DROP_PARAMS: readonly (readonly [number, number, number])[] = Array.from(
  { length: WATER_VORTEX_DROPS },
  (_, index) => {
    const spread = (index * 2.399963) % (Math.PI * 2);
    const outward = 1.5 + (index % 5) * 0.55;
    const up = 3.1 + (index % 4) * 0.62;
    return [spread, outward, up] as const;
  }
);

/** Suavização 0..1 (smoothstep) usada na abertura do spray. */
function smooth01(t: number): number {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

/** Vórtice do Golpe Flamejante: nasce no ponto do golpe, gira e apaga. */
export class WaterVortexEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();

  private readonly bodyGroup = new THREE.Group();
  private readonly bands: THREE.Mesh[] = [];
  private readonly bandMaterials: THREE.ShaderMaterial[] = [];
  /** Cópias escuras de cada fita: os vãos de sombra entre as fitas de água. */
  private readonly bandShadowMaterials: THREE.ShaderMaterial[] = [];
  private readonly bandGeometries: THREE.BufferGeometry[] = [];
  private readonly rings: THREE.Mesh[] = [];
  private readonly ringMaterials: THREE.ShaderMaterial[] = [];
  private readonly ringGeometries: THREE.BufferGeometry[] = [];
  private readonly surfaces: THREE.Mesh[] = [];
  private readonly surfaceMaterials: THREE.ShaderMaterial[] = [];
  /** Camadas escuras do topo e da base: o contraste da referência. */
  private readonly shadowSurfaces: THREE.Mesh[] = [];
  private readonly shadowSurfaceMaterials: THREE.ShaderMaterial[] = [];
  private readonly debris: THREE.Mesh[] = [];
  private readonly debrisGeometry: THREE.IcosahedronGeometry;
  private readonly debrisMaterial: THREE.MeshStandardMaterial;
  private readonly drops: DropState[] = [];
  private readonly coreSprites: THREE.Sprite[] = [];
  private readonly poolMesh: THREE.Mesh;
  private readonly poolMaterial: THREE.MeshBasicMaterial;
  private readonly shockMaterial: EnergyShaderMaterial;
  private readonly shockMesh: THREE.Mesh;
  private readonly spray: PooledParticleCloud;
  private lightHandle: VFXLightHandle | null = null;

  private age = 0;
  private baseScale = 1;
  private shakeRequest: WaterVortexShakeRequest | null = null;
  private sprayTimer = 0;
  private readonly tmpVec = new THREE.Vector3();

  public constructor(
    resources: WaterVortexResources,
    private readonly lightPool: VFXLightPool
  ) {
    this.group.name = 'WarriorWaterVortexVFX';
    this.group.visible = false;
    this.bodyGroup.name = 'WarriorWaterVortexBody';

    // 1) As fitas em espiral do funil.
    for (let i = 0; i < WATER_VORTEX_BANDS; i++) {
      const [turns, widthBottom, widthTop] = BAND_PARAMS[i];
      const geometry = createVortexBandGeometry(
        turns,
        WATER_VORTEX_HEIGHT,
        WATER_VORTEX_TIP_RADIUS * (1 - i * 0.12),
        WATER_VORTEX_TOP_RADIUS * (1 - i * 0.1),
        widthBottom,
        widthTop,
        72
      );
      const material = createVortexBandMaterial({
        opacity: 0,
        intensity: 2.0 + i * 0.35,
        seed: i * 2.7,
      });
      const band = new THREE.Mesh(geometry, material);
      band.name = `WarriorWaterVortexBand${i}`;
      band.frustumCulled = false;
      band.renderOrder = 7;
      this.bandGeometries.push(geometry);
      this.bandMaterials.push(material);
      this.bands.push(band);
      this.bodyGroup.add(band);

      // A MESMA geometria com material escuro, desenhada ANTES da fita: os
      // vãos entre uma fita e a próxima ficam com sombra de verdade.
      const shadowMaterial = createVortexShadowMaterial({
        opacity: 0,
        mode: 'band',
        rings: 1,
        speed: 0,
        twist: 0,
        mouthRadius: 0,
      });
      const shadowBand = new THREE.Mesh(geometry, shadowMaterial);
      shadowBand.name = `WarriorWaterVortexBandShadow${i}`;
      shadowBand.frustumCulled = false;
      shadowBand.renderOrder = 4;
      this.bandShadowMaterials.push(shadowMaterial);
      this.bodyGroup.add(shadowBand);
    }

    // 2) Os anéis empilhados abraçando o cone (radius segue o próprio funil).
    for (let i = 0; i < WATER_VORTEX_RINGS; i++) {
      const [heightFraction, phase, , streaks] = RING_PARAMS[i];
      const radius = THREE.MathUtils.lerp(
        WATER_VORTEX_TIP_RADIUS,
        WATER_VORTEX_TOP_RADIUS,
        Math.pow(heightFraction, 1.35)
      );
      const geometry = new THREE.TorusGeometry(radius, 0.075 + radius * 0.045, 8, 54);
      geometry.rotateX(Math.PI / 2);
      const material = createVortexRingMaterial({
        opacity: 0,
        intensity: 1.9 + i * 0.12,
        phase,
        streaks,
      });
      const ring = new THREE.Mesh(geometry, material);
      ring.name = `WarriorWaterVortexRing${i}`;
      ring.position.y = heightFraction * WATER_VORTEX_HEIGHT;
      ring.frustumCulled = false;
      ring.renderOrder = 6;
      this.ringGeometries.push(geometry);
      this.ringMaterials.push(material);
      this.rings.push(ring);
      this.bodyGroup.add(ring);
    }

    // 3) Espelho d'água: disco de anéis justos do tamanho da boca + um disco
    //    externo mais largo e discreto, que fecha a borda escura da imagem.
    const surfaceInner = createVortexSurfaceMaterial({
      opacity: 0,
      intensity: 1.85,
      rings: 4.2,
      speed: 2.4,
      twist: 1.5,
      mouthRadius: 0.34,
      outerFade: 0.72,
    });
    const innerDisc = new THREE.Mesh(resources.quad, surfaceInner);
    innerDisc.name = 'WarriorWaterVortexSurface';
    innerDisc.rotation.x = -Math.PI / 2;
    innerDisc.position.y = WATER_VORTEX_HEIGHT;
    innerDisc.scale.setScalar(WATER_VORTEX_TOP_RADIUS * 2);
    innerDisc.frustumCulled = false;
    innerDisc.renderOrder = 5;
    this.surfaceMaterials.push(surfaceInner);
    this.surfaces.push(innerDisc);

    const surfaceOuter = createVortexSurfaceMaterial({
      opacity: 0,
      intensity: 0.95,
      rings: 7.4,
      speed: 1.6,
      twist: 1.15,
      mouthRadius: 0.1,
      outerFade: 0.82,
    });
    const outerDisc = new THREE.Mesh(resources.quad, surfaceOuter);
    outerDisc.name = 'WarriorWaterVortexSurfaceOuter';
    outerDisc.rotation.x = -Math.PI / 2;
    outerDisc.position.y = WATER_VORTEX_HEIGHT - 0.05;
    outerDisc.scale.setScalar(WATER_VORTEX_TOP_RADIUS * 2.5);
    outerDisc.frustumCulled = false;
    outerDisc.renderOrder = 4;
    this.surfaceMaterials.push(surfaceOuter);
    this.surfaces.push(outerDisc);

    // 4) Detritos escuros (as pedras que giram na imagem). Um material só:
    //    azul-marinho fosco com emissivo baixo, para pegar a luz do vórtice.
    // Sombra dos dois discos, logo abaixo deles (mesma escala, y um pouco
    // menor para a luz passar por cima).
    const shadowOf = (source: THREE.Mesh, name: string, rings: number, speed: number) => {
      const material = createVortexShadowMaterial({
        opacity: 0,
        mode: 'surface',
        rings,
        speed,
        twist: 1.4,
        mouthRadius: 0.34,
      });
      const mesh = new THREE.Mesh(resources.quad, material);
      mesh.name = name;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = source.position.y - 0.06;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      this.shadowSurfaceMaterials.push(material);
      this.shadowSurfaces.push(mesh);
      return mesh;
    };
    const innerShadow = shadowOf(innerDisc, 'WarriorWaterVortexSurfaceShadow', 4.2, 2.4);
    const outerShadow = shadowOf(outerDisc, 'WarriorWaterVortexSurfaceShadowOuter', 7.4, 1.6);

    this.bodyGroup.add(innerShadow, outerShadow, innerDisc, outerDisc);

    this.debrisGeometry = new THREE.IcosahedronGeometry(0.33, 0);
    this.debrisMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a1a2e,
      roughness: 0.88,
      metalness: 0.05,
      emissive: new THREE.Color(WATER_VORTEX_COLORS.deep),
      emissiveIntensity: 0.16,
      flatShading: true,
    });
    for (let i = 0; i < WATER_VORTEX_DEBRIS; i++) {
      const rock = new THREE.Mesh(this.debrisGeometry, this.debrisMaterial);
      rock.name = `WarriorWaterVortexDebris${i}`;
      rock.frustumCulled = false;
      rock.renderOrder = 3;
      const scale = DEBRIS_ORBITS[i].scale;
      rock.scale.set(scale, scale * (0.75 + (i % 3) * 0.18), scale * 0.9);
      this.debris.push(rock);
      this.bodyGroup.add(rock);
    }

    // 5) Brilho do miolo: o núcleo quase branco que atravessa o funil.
    const makeGlow = (name: string, map: THREE.Texture, color: number) => {
      const material = new THREE.SpriteMaterial({
        map,
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.name = name;
      sprite.frustumCulled = false;
      sprite.visible = false;
      return sprite;
    };
    // Miolo: um fio de luz vertical curto, não um clarão — na referência quem
    // brilha é a parede do funil, o centro é escuro.
    const heart = makeGlow('WarriorWaterVortexHeart', resources.impactFlare, WATER_VORTEX_COLORS.core);
    heart.position.set(0, 1.15, 0);
    heart.scale.set(0.85, 2.6, 1);
    const mouthGlow = makeGlow('WarriorWaterVortexMouth', resources.softGlow, WATER_VORTEX_COLORS.bright);
    mouthGlow.position.set(0, WATER_VORTEX_HEIGHT - 0.15, 0);
    mouthGlow.scale.set(3.6, 1.5, 1);
    const tipGlow = makeGlow('WarriorWaterVortexTip', resources.softGlow, WATER_VORTEX_COLORS.core);
    tipGlow.position.set(0, 0.26, 0);
    tipGlow.scale.set(2.2, 1, 1);
    for (const sprite of [heart, mouthGlow, tipGlow]) {
      this.coreSprites.push(sprite);
      this.bodyGroup.add(sprite);
    }

    // 6) Piscina escura no chão (a sombra molhada da base).
    this.poolMaterial = new THREE.MeshBasicMaterial({
      color: 0x02091a,
      alphaMap: resources.softGlow,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    this.poolMesh = new THREE.Mesh(resources.quad, this.poolMaterial);
    this.poolMesh.name = 'WarriorWaterVortexPool';
    this.poolMesh.rotation.x = -Math.PI / 2;
    this.poolMesh.position.y = 0.02;
    this.poolMesh.frustumCulled = false;
    this.poolMesh.renderOrder = 2;

    // 7) Coroa de gotas: sprites com física própria (sobem, abrem e caem).
    for (let i = 0; i < WATER_VORTEX_DROPS; i++) {
      const sprite = makeGlow(`WarriorWaterVortexDrop${i}`, resources.softGlow, WATER_VORTEX_COLORS.bright);
      this.drops.push({
        sprite,
        velocity: new THREE.Vector3(),
        scale: 0.42 + (i % 4) * 0.13,
      });
      this.bodyGroup.add(sprite);
    }

    // 8) Anel de choque no chão, na cor da água.
    this.shockMaterial = createMagicCircleMaterial({
      colorA: WATER_VORTEX_COLORS.core,
      colorB: WATER_VORTEX_COLORS.mid,
      opacity: 0,
      intensity: 1.9,
      thickness: 0.95,
      distortion: 1.4,
    });
    this.shockMesh = new THREE.Mesh(resources.ring, this.shockMaterial);
    this.shockMesh.name = 'WarriorWaterVortexShockwave';
    this.shockMesh.rotation.x = -Math.PI / 2;
    this.shockMesh.position.y = 0.03;
    this.shockMesh.frustumCulled = false;
    this.shockMesh.renderOrder = 4;
    this.shockMesh.visible = false;

    this.spray = new PooledParticleCloud(120, resources.softGlow);

    this.group.add(this.bodyGroup, this.poolMesh, this.shockMesh);
  }

  public play(options: WaterVortexOptions): void {
    const forward = new THREE.Vector3(options.forward.x, 0, options.forward.z);
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
    forward.normalize();

    this.baseScale = options.scale ?? 1;
    this.age = 0;
    this.sprayTimer = 0;
    this.shakeRequest = null;

    this.group.position.copy(options.position);
    this.group.rotation.set(0, Math.atan2(forward.x, forward.z), 0);
    this.group.scale.setScalar(this.baseScale);
    this.group.visible = true;

    for (const material of this.bandMaterials) {
      material.uniforms.uTime.value = 0;
      material.uniforms.uOpacity.value = 0;
    }
    for (const material of this.ringMaterials) {
      material.uniforms.uTime.value = 0;
      material.uniforms.uOpacity.value = 0;
    }
    for (const material of this.surfaceMaterials) {
      material.uniforms.uTime.value = 0;
      material.uniforms.uOpacity.value = 0;
    }
    for (const material of this.bandShadowMaterials) {
      material.uniforms.uTime.value = 0;
      material.uniforms.uOpacity.value = 0;
    }
    for (const material of this.shadowSurfaceMaterials) {
      material.uniforms.uTime.value = 0;
      material.uniforms.uOpacity.value = 0;
    }
    for (let i = 0; i < this.rings.length; i++) {
      this.rings[i].rotation.y = RING_PARAMS[i][1];
      this.rings[i].visible = true;
    }
    for (const band of this.bands) band.visible = true;
    for (const surface of this.surfaces) surface.visible = true;

    for (const sprite of this.coreSprites) {
      sprite.visible = true;
      (sprite.material as THREE.SpriteMaterial).opacity = 0;
    }

    // A coroa de gotas nasce junto com o impacto, em volta da ponta.
    for (let i = 0; i < this.drops.length; i++) {
      const drop = this.drops[i];
      const [angle, outward, up] = DROP_PARAMS[i];
      const material = drop.sprite.material as THREE.SpriteMaterial;
      material.opacity = 0;
      drop.sprite.visible = true;
      drop.sprite.position.set(
        Math.cos(angle) * 0.4,
        0.12,
        Math.sin(angle) * 0.4
      );
      drop.velocity.set(Math.cos(angle) * outward, up, Math.sin(angle) * outward);
      drop.sprite.scale.setScalar(drop.scale * this.baseScale);
    }

    this.poolMaterial.opacity = 0;
    this.poolMesh.visible = true;
    this.poolMesh.scale.setScalar(WATER_VORTEX_TOP_RADIUS * 2.6);
    this.shockMesh.visible = true;
    this.shockMesh.scale.setScalar(1.1);
    this.shockMaterial.uniforms.uOpacity.value = 0.42;
    this.shockMaterial.uniforms.uTime.value = 0;

    // Spray fino de água: uma primeira pancada e depois jatos em espiral.
    this.spray.emit(this.tmpVec.set(0, 0.35, 0), {
      color: WATER_VORTEX_COLORS.bright,
      count: 54,
      speed: 4.4,
      spread: 2.1,
      lifetime: WATER_VORTEX_SPRAY_SECONDS,
      upwardBias: 1.9,
      size: [0.24, 0.6],
    });

    this.lightHandle = this.lightPool.acquire();
    if (this.lightHandle) {
      const light = this.lightHandle.light;
      light.color.set(WATER_VORTEX_COLORS.mid);
      light.intensity = 0;
      light.distance = 26 * this.baseScale;
      light.position.copy(this.group.position);
      light.position.y += 2.6 * this.baseScale;
    }

    // Impacto pesado e curto: tremor discreto, o vórtice é água, não trovão.
    this.shakeRequest = { intensity: 0.07 * this.baseScale, duration: 0.26 };
  }

  /** O Game chama a cada frame; devolve o tremor do impacto uma única vez. */
  public consumeImpactShake(): WaterVortexShakeRequest | null {
    const request = this.shakeRequest;
    this.shakeRequest = null;
    return request;
  }

  public update(delta: number): boolean {
    const step = Math.max(0, delta);
    this.age += step;
    if (this.age >= WATER_VORTEX_TOTAL_SECONDS) return false;

    const rise = THREE.MathUtils.clamp(this.age / WATER_VORTEX_RISE_SECONDS, 0, 1);
    const grow = 1 - Math.pow(1 - rise, 3);
    const fade = this.age <= WATER_VORTEX_HOLD_SECONDS
      ? 1
      : THREE.MathUtils.clamp(
        (WATER_VORTEX_TOTAL_SECONDS - this.age) / WATER_VORTEX_FADE_SECONDS,
        0,
        1
      );
    const strength = fade;

    // 1) Fitas: cada uma gira na sua velocidade e abre na proporção do pop-in.
    for (let i = 0; i < this.bands.length; i++) {
      const band = this.bands[i];
      const [, , , spin] = BAND_PARAMS[i];
      band.rotation.y = this.age * spin;
      band.scale.setScalar(0.72 + grow * 0.28);
      const material = this.bandMaterials[i];
      material.uniforms.uTime.value = this.age;
      material.uniforms.uOpacity.value = strength * (0.9 + i * 0.05);
      // A sombra gira junto com a fita: os vãos escuros acompanham a água.
      const shadow = this.bandShadowMaterials[i];
      if (shadow) {
        shadow.uniforms.uTime.value = this.age;
        shadow.uniforms.uOpacity.value = strength * 0.85;
      }
    }

    // 2) Anéis empilhados: girando, com o aro brilhando em ondas.
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const [, , spin] = RING_PARAMS[i];
      ring.rotation.y = this.age * spin;
      ring.scale.setScalar(0.66 + grow * 0.34);
      const material = this.ringMaterials[i];
      material.uniforms.uTime.value = this.age;
      material.uniforms.uOpacity.value = strength * 0.85;
    }

    // 3) Espelho d'água: abre a partir da boca do funil.
    for (const surface of this.surfaces) {
      surface.visible = true;
    }
    this.surfaces[0].scale.setScalar(WATER_VORTEX_TOP_RADIUS * 2 * (0.55 + grow * 0.45));
    this.surfaces[1].scale.setScalar(WATER_VORTEX_TOP_RADIUS * 2.5 * (0.7 + grow * 0.3));
    this.shadowSurfaces[0].scale.copy(this.surfaces[0].scale);
    this.shadowSurfaces[1].scale.copy(this.surfaces[1].scale);
    for (const material of this.surfaceMaterials) {
      material.uniforms.uTime.value = this.age;
      material.uniforms.uOpacity.value = strength * 0.95;
    }
    for (const material of this.shadowSurfaceMaterials) {
      material.uniforms.uTime.value = this.age;
      material.uniforms.uOpacity.value = strength * 0.9;
    }

    // 4) Detritos: órbita em volta do funil + tombo próprio.
    for (let i = 0; i < this.debris.length; i++) {
      const rock = this.debris[i];
      const orbit = DEBRIS_ORBITS[i];
      const angle = orbit.phase + this.age * orbit.speed;
      const bob = Math.sin(this.age * 2.2 + orbit.phase) * 0.12;
      rock.position.set(
        Math.cos(angle) * orbit.radius,
        orbit.height + bob,
        Math.sin(angle) * orbit.radius
      );
      rock.rotation.set(
        this.age * orbit.spinX + orbit.tilt,
        angle,
        this.age * orbit.spinZ
      );
      rock.visible = strength > 0.05;
    }

    // 5) Miolo: brilho branco pulsando dentro do funil.
    const pulse = 0.86 + Math.sin(this.age * 16.5) * 0.08 + Math.sin(this.age * 6.1) * 0.06;
    // Miolo discreto: fio de luz no eixo do funil + brilho na boca e no pé.
    const heart = this.coreSprites[0];
    (heart.material as THREE.SpriteMaterial).opacity = Math.min(1, grow) * strength * 0.5 * pulse;
    heart.scale.set(0.85 + grow * 0.3, 2.6 + grow * 0.9, 1);
    const mouthGlow = this.coreSprites[1];
    (mouthGlow.material as THREE.SpriteMaterial).opacity = strength * 0.5 * pulse;
    mouthGlow.scale.set(3.6 * (0.7 + grow * 0.3), 1.5 * (0.7 + grow * 0.3), 1);
    const tipGlow = this.coreSprites[2];
    (tipGlow.material as THREE.SpriteMaterial).opacity = strength * 0.6 * pulse;
    tipGlow.scale.set(2.2 * (0.6 + grow * 0.4), 1 * (0.6 + grow * 0.4), 1);

    // 6) Coroa de gotas: física simples (sobe, abre e cai de volta).
    for (const drop of this.drops) {
      const material = drop.sprite.material as THREE.SpriteMaterial;
      drop.velocity.y -= WATER_VORTEX_DROP_GRAVITY * step;
      drop.sprite.position.addScaledVector(drop.velocity, step);
      if (drop.sprite.position.y < 0.06) {
        drop.sprite.position.y = 0.06;
        drop.velocity.set(0, 0, 0);
      }
      // A gota aparece no nascimento e some com o efeito; nunca "pisca".
      const dropLife = THREE.MathUtils.clamp(this.age / 0.35, 0, 1);
      material.opacity = dropLife * strength * 0.85;
    }

    // 7) Piscina escura (sombra) e anel de choque.
    this.poolMaterial.opacity = Math.min(1, grow) * strength * 0.68;
    const shockT = THREE.MathUtils.clamp(this.age / 0.5, 0, 1);
    this.shockMesh.scale.setScalar((1.1 + shockT * 6.4) * (0.6 + grow * 0.4));
    this.shockMaterial.uniforms.uTime.value = this.age;
    this.shockMaterial.uniforms.uOpacity.value = (1 - shockT) * 0.3 * strength;
    this.shockMesh.visible = this.shockMaterial.uniforms.uOpacity.value > 0.01;

    // 8) Spray: jatos periódicos subindo em espiral pela parede do funil.
    this.sprayTimer += step;
    if (this.sprayTimer >= WATER_VORTEX_SPRAY_INTERVAL && this.age < WATER_VORTEX_HOLD_SECONDS) {
      this.sprayTimer = 0;
      const angle = this.age * 5.4;
      const radius = 0.5 + (1 - smooth01(this.age / WATER_VORTEX_HOLD_SECONDS)) * 1.6;
      this.spray.add(this.tmpVec.set(Math.cos(angle) * radius, 0.3, Math.sin(angle) * radius), {
        color: WATER_VORTEX_COLORS.bright,
        count: 5,
        speed: 2.2,
        spread: 1.2,
        lifetime: WATER_VORTEX_SPRAY_SECONDS,
        upwardBias: 3.4,
        size: [0.18, 0.44],
        opacity: strength,
      });
    }
    this.spray.setOpacity(strength);
    this.spray.update(step);

    // 9) Luz azul do vórtice: forte no impacto, tremulando como água.
    if (this.lightHandle) {
      const light = this.lightHandle.light;
      light.intensity = strength * (8.5 + Math.sin(this.age * 12.3) * 1.1) * this.baseScale;
      light.position.copy(this.group.position);
      light.position.y += 2.4 * this.baseScale;
    }

    return true;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.shakeRequest = null;
    this.sprayTimer = 0;
    this.lightHandle?.release();
    this.lightHandle = null;

    for (const material of this.bandMaterials) material.uniforms.uOpacity.value = 0;
    for (const material of this.ringMaterials) material.uniforms.uOpacity.value = 0;
    for (const material of this.surfaceMaterials) material.uniforms.uOpacity.value = 0;
    for (const material of this.bandShadowMaterials) material.uniforms.uOpacity.value = 0;
    for (const material of this.shadowSurfaceMaterials) material.uniforms.uOpacity.value = 0;
    for (const sprite of this.coreSprites) {
      sprite.visible = false;
      (sprite.material as THREE.SpriteMaterial).opacity = 0;
    }
    for (const drop of this.drops) {
      drop.sprite.visible = false;
      (drop.sprite.material as THREE.SpriteMaterial).opacity = 0;
    }
    this.poolMaterial.opacity = 0;
    this.poolMesh.visible = false;
    this.shockMesh.visible = false;
    this.shockMaterial.uniforms.uOpacity.value = 0;
    this.spray.reset();
  }

  public dispose(): void {
    for (const geometry of this.bandGeometries) geometry.dispose();
    for (const material of this.bandMaterials) material.dispose();
    for (const geometry of this.ringGeometries) geometry.dispose();
    for (const material of this.ringMaterials) material.dispose();
    for (const material of this.surfaceMaterials) material.dispose();
    for (const material of this.bandShadowMaterials) material.dispose();
    for (const material of this.shadowSurfaceMaterials) material.dispose();
    this.debrisGeometry.dispose();
    this.debrisMaterial.dispose();
    this.poolMaterial.dispose();
    this.shockMaterial.dispose();
    for (const sprite of this.coreSprites) (sprite.material as THREE.Material).dispose();
    for (const drop of this.drops) (drop.sprite.material as THREE.Material).dispose();
    this.spray.dispose();
  }
}

export { createVortexBandGeometry as createWaterVortexBandGeometry };
