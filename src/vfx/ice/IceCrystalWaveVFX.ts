import * as THREE from 'three';
import { VFXPool, type PoolableVFX } from '../VFXPool';
import { VFXLightPool, type VFXLightHandle } from '../VFXLightPool';
import { PooledParticleCloud } from '../ParticleManager';
import {
  ICE_CRYSTAL_COLORS,
  createShardGeometry,
  createCrystalMaterial,
  createInstancedShardSet,
  disposeInstancedShardSet,
  type CrystalMaterial,
  type InstancedShardSet,
} from './IceCrystalCore';

/**
 * Skill 2 da Maga (gelo) — a onda de cristais da imagem de referência:
 * uma crista LARGA de cristais 3D facetados que irrompe do chão a partir da
 * Maga e avança na direção do alvo, crescendo em tamanho até o cristal-herói
 * gigante e inclinado na ponta. No chão fica só um lustre de geada discreto
 * (sem desenhos de linhas) e uma NÉVOA DE GELO densa rolando entre as bases,
 * com faíscas frias; no fim o gelo permanece um instante e se desfaz em
 * fragmentos e partículas enquanto a névoa se dissipa por último.
 *
 * Sincronia com a mecânica: a frente de erupção viaja na MESMA velocidade do
 * projétil de gelo (que continua carregando o dano/alcance/recarga reais), e
 * o comprimento da linha é a distância real até o ponto de impacto resolvido
 * no disparo — o cristal-herói nasce onde o feitiço acerta.
 *
 * Desempenho (WebGL desktop/tablet): 2 InstancedMeshes para todos os
 * cristais, 1 InstancedMesh de billboards para a névoa inteira, 1 plano de
 * geada procedural, 3 nuvens de partículas com limites baixos e UMA luz do
 * pool por onda (nunca por cristal).
 */

/** Parâmetros de ajuste da onda de gelo (tamanho, brilho e duração). */
export const ICE_CRYSTAL_WAVE_TUNING = {
  /** Altura do primeiro cristal (perto da Maga) e do cristal-herói no fim. */
  heightRange: [0.6, 4.5] as const,
  /** Curva do crescimento ao longo da linha (maior = estoura no final). */
  heightCurve: 1.4,
  /** Metros entre aglomerados de cristais (menor = crista mais cheia). */
  clusterSpacing: 1.0,
  /** Inclinação (radianos) para longe da Maga: início -> cristal-herói. */
  leanRange: [0.16, 0.5] as const,
  /** Largura da cunha de cristais no início e no fim da linha (área total). */
  spreadRange: [1.3, 3.6] as const,
  /** Largura da base em função da altura (base larga, ponta fina). */
  baseWidthRatio: 0.21,
  /** Quanto tempo cada cristal leva para emergir do chão. */
  growSeconds: 0.26,
  /** Quanto tempo o gelo permanece formado depois da linha completa. */
  holdSeconds: 1.15,
  /** Duração do estilhaçamento final. */
  shatterSeconds: 0.55,
  /** Intensidade do brilho das bordas (fresnel ciano/branco). */
  rimGlow: 1.3,
  /** Opacidade do corpo do cristal (gelo denso). */
  crystalOpacity: 0.96,
  /** Intensidade da luz pontual única que acompanha a frente da onda. */
  lightIntensity: 3.4,
  /** Largura da faixa de geada no chão (acompanha a cunha de cristais). */
  groundWidth: 9.0,
  /** Opacidade máxima de cada bolsão da névoa de gelo. */
  fogOpacity: 0.2,
  /** Tamanho dos bolsões de névoa no início e no fim da linha (metros). */
  fogSizeRange: [1.7, 4.2] as const,
  /** Velocidade padrão da frente quando o preset não informar (m/s). */
  defaultTravelSpeed: 24,
} as const;

const BIG_SHARD_CAPACITY = 56;
const SMALL_SHARD_CAPACITY = 80;
const FOG_CAPACITY = 24;
const MAX_CLUSTERS = 16;

/* ------------------------------------------------------------------------ */
/* Shader da geada no chão (lustre congelado, SEM linhas desenhadas)          */
/* ------------------------------------------------------------------------ */

const FROST_VERTEX = /* glsl */ `
  varying vec2 vLocal;
  void main() {
    vLocal = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FROST_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLen;      // comprimento útil da linha de cristais (m)
  uniform float uLenTotal; // escala Z do plano (m)
  uniform float uZCenter;  // centro do plano no eixo da linha (m)
  uniform float uWidth;    // escala X do plano (m)
  uniform float uFront;    // frente de erupção (m desde a Maga)
  uniform float uFade;
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vLocal;

  void main() {
    float x = vLocal.x * uWidth;
    float z = vLocal.y * uLenTotal + uZCenter;
    float t = clamp(z / max(uLen, 0.001), 0.0, 1.0);

    // Manchas irregulares de geada (nada de linhas): duas oitavas de ruído
    // barato quebram o contorno como gelo espalhado de verdade.
    float n1 = sin(x * 2.1 + uSeed * 9.0) * sin(z * 1.8 - uSeed * 4.0);
    float n2 = sin(x * 4.9 - z * 3.4 + uSeed * 21.0) * sin(z * 5.2 + x * 1.3 - uSeed * 13.0);
    float frost = smoothstep(-0.15, 0.85, n1 * 0.62 + n2 * 0.38);

    // Mais densa sob a crista e afinando para as bordas da cunha.
    float lateral = exp(-abs(x) * (0.9 - t * 0.3));
    float envZ = smoothstep(-0.8, 0.6, z) * (1.0 - smoothstep(uLen + 0.4, uLen + 2.4, z));
    // Revela acompanhando a frente da onda (nada congela antes do gelo chegar).
    float reveal = smoothstep(z - 0.2, z + 0.9, uFront + 0.6);
    float shimmer = 0.9 + 0.1 * sin(uTime * 2.2 + x * 3.0 + z * 2.0);

    float alpha = frost * lateral * envZ * reveal * uFade * shimmer * (0.1 + 0.1 * t);
    if (alpha <= 0.004) discard;

    // Lustre branco-azulado fosco, como piso congelando.
    vec3 col = mix(uColor, vec3(1.0), 0.45);
    gl_FragColor = vec4(col, alpha);
  }
`;

type FrostMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uColor: { value: THREE.Color };
    uLen: { value: number };
    uLenTotal: { value: number };
    uZCenter: { value: number };
    uWidth: { value: number };
    uFront: { value: number };
    uFade: { value: number };
    uTime: { value: number };
    uSeed: { value: number };
  };
};

function createFrostMaterial(): FrostMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(ICE_CRYSTAL_COLORS.mist) },
      uLen: { value: 10 },
      uLenTotal: { value: 13 },
      uZCenter: { value: 5 },
      uWidth: { value: ICE_CRYSTAL_WAVE_TUNING.groundWidth },
      uFront: { value: 0 },
      uFade: { value: 1 },
      uTime: { value: 0 },
      uSeed: { value: 0 },
    },
    vertexShader: FROST_VERTEX,
    fragmentShader: FROST_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
  }) as FrostMaterial;
}

/* ------------------------------------------------------------------------ */
/* Shader da névoa de gelo (banco de billboards instanciados — 1 draw call)   */
/* ------------------------------------------------------------------------ */

const FOG_VERTEX = /* glsl */ `
  uniform float uTime;
  attribute float aDelay;
  attribute float aSeed;
  varying vec2 vQuad;
  varying float vSeed;
  varying float vAppear;

  void main() {
    vQuad = position.xy;
    vSeed = aSeed;
    // Cada bolsão aparece quando a frente da onda passa por ele e incha devagar.
    float t = clamp((uTime - aDelay) / 1.1, 0.0, 1.0);
    vAppear = t;

    #ifdef USE_INSTANCING
      vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float size = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
    #else
      vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float size = 1.0;
    #endif

    // Deriva lenta: a névoa rola entre as bases, sobe um pouco e vagueia.
    center.y += t * 0.3 + sin(uTime * 0.55 + aSeed * 13.0) * 0.1;
    center.x += sin(uTime * 0.34 + aSeed * 7.0) * 0.22;
    center.z += cos(uTime * 0.29 + aSeed * 5.0) * 0.22;

    // Billboard: o quad sempre encara a câmera.
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float grow = size * (0.7 + 0.4 * t);
    vec3 world = center + (right * position.x + up * position.y) * grow;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FOG_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uTime;
  varying vec2 vQuad;
  varying float vSeed;
  varying float vAppear;

  void main() {
    float r = length(vQuad) * 2.0;
    float soft = 1.0 - smoothstep(0.3, 1.0, r);
    // Quebra orgânica: nunca um círculo perfeito, sempre um rolo de névoa.
    float n = sin(vQuad.x * 8.0 + vSeed * 17.0 + uTime * 0.4)
      * sin(vQuad.y * 7.0 - vSeed * 11.0 + uTime * 0.33);
    soft *= 0.72 + 0.28 * n;

    float alpha = soft * uOpacity * vAppear * uFade;
    if (alpha <= 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

type FogMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uColor: { value: THREE.Color };
    uOpacity: { value: number };
    uFade: { value: number };
    uTime: { value: number };
  };
};

interface FogBank {
  readonly mesh: THREE.InstancedMesh;
  readonly geometry: THREE.BufferGeometry;
  readonly material: FogMaterial;
  readonly delays: THREE.InstancedBufferAttribute;
  readonly seeds: THREE.InstancedBufferAttribute;
}

function createFogBank(quad: THREE.BufferGeometry): FogBank {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', quad.getAttribute('position'));
  geometry.setIndex(quad.getIndex());
  const delays = new THREE.InstancedBufferAttribute(new Float32Array(FOG_CAPACITY), 1);
  const seeds = new THREE.InstancedBufferAttribute(new Float32Array(FOG_CAPACITY), 1);
  geometry.setAttribute('aDelay', delays);
  geometry.setAttribute('aSeed', seeds);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(ICE_CRYSTAL_COLORS.mist) },
      uOpacity: { value: ICE_CRYSTAL_WAVE_TUNING.fogOpacity },
      uFade: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: FOG_VERTEX,
    fragmentShader: FOG_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
  }) as FogMaterial;
  const mesh = new THREE.InstancedMesh(geometry, material, FOG_CAPACITY);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.name = 'IceWaveFog';
  return { mesh, geometry, material, delays, seeds };
}

/* ------------------------------------------------------------------------ */
/* Efeito                                                                     */
/* ------------------------------------------------------------------------ */

export interface IceCrystalWaveOptions {
  /** Centro/origem do efeito: o pé da Maga (chão) no instante do disparo. */
  readonly start: THREE.Vector3;
  /** Direção planar até o alvo (define o eixo da linha). */
  readonly direction: THREE.Vector3;
  /** Comprimento da linha em metros (até o ponto de impacto resolvido). */
  readonly length: number;
  /** Velocidade da frente de erupção (m/s) — igual ao projétil de gelo. */
  readonly travelSpeed?: number;
  readonly scale?: number;
}

interface ClusterInfo {
  readonly local: THREE.Vector3;
  readonly spawnAt: number;
}

interface IceWaveResources {
  readonly bigShard: THREE.BufferGeometry;
  readonly smallShard: THREE.BufferGeometry;
  readonly groundPlane: THREE.BufferGeometry;
  readonly fogQuad: THREE.BufferGeometry;
  dispose(): void;
}

function createIceWaveResources(): IceWaveResources {
  const bigShard = createShardGeometry(911, 6, 1);
  const smallShard = createShardGeometry(347, 5, 1.2);
  const groundPlane = new THREE.PlaneGeometry(1, 1);
  groundPlane.rotateX(-Math.PI / 2);
  const fogQuad = new THREE.PlaneGeometry(1, 1);
  return {
    bigShard,
    smallShard,
    groundPlane,
    fogQuad,
    dispose() {
      bigShard.dispose();
      smallShard.dispose();
      groundPlane.dispose();
      fogQuad.dispose();
    },
  };
}

const TMP_MATRIX = new THREE.Matrix4();
const TMP_POS = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_QUAT2 = new THREE.Quaternion();
const TMP_SCALE = new THREE.Vector3();
const IDENTITY_QUAT = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

class IceCrystalWaveEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();

  private readonly crystalMat: CrystalMaterial;
  private readonly big: InstancedShardSet;
  private readonly small: InstancedShardSet;
  private readonly frostMat: FrostMaterial;
  private readonly frostMesh: THREE.Mesh;
  private readonly fog: FogBank;
  private readonly sparkles: PooledParticleCloud;
  private readonly mist: PooledParticleCloud;
  private readonly shardsBurst: PooledParticleCloud;
  private lightHandle: VFXLightHandle | null = null;

  private readonly clusters: ClusterInfo[] = [];
  private age = 0;
  private lineLength = 10;
  private travelSpeed: number = ICE_CRYSTAL_WAVE_TUNING.defaultTravelSpeed;
  private holdEnd = 2;
  private totalLife = 3;
  private baseScale = 1;
  private spawnFxIndex = 0;
  private shatterEmitted = false;

  public constructor(
    resources: IceWaveResources,
    glowTexture: THREE.Texture,
    private readonly lightPool: VFXLightPool
  ) {
    this.group.name = 'MageIceCrystalWave';
    this.group.visible = false;

    this.crystalMat = createCrystalMaterial({
      growSeconds: ICE_CRYSTAL_WAVE_TUNING.growSeconds,
      rimGlow: ICE_CRYSTAL_WAVE_TUNING.rimGlow,
      opacity: ICE_CRYSTAL_WAVE_TUNING.crystalOpacity,
    });
    this.big = createInstancedShardSet(resources.bigShard, BIG_SHARD_CAPACITY, this.crystalMat);
    this.big.mesh.name = 'IceWaveBigShards';
    this.small = createInstancedShardSet(resources.smallShard, SMALL_SHARD_CAPACITY, this.crystalMat);
    this.small.mesh.name = 'IceWaveSmallShards';

    this.frostMat = createFrostMaterial();
    this.frostMesh = new THREE.Mesh(resources.groundPlane, this.frostMat);
    this.frostMesh.name = 'IceWaveGroundFrost';
    this.frostMesh.position.y = 0.03;
    this.frostMesh.renderOrder = 4;
    this.frostMesh.frustumCulled = false;

    this.fog = createFogBank(resources.fogQuad);

    this.sparkles = new PooledParticleCloud(56, glowTexture);
    this.mist = new PooledParticleCloud(48, glowTexture, { blending: 'normal' });
    this.shardsBurst = new PooledParticleCloud(72, glowTexture);

    this.group.add(
      this.frostMesh,
      this.big.mesh,
      this.small.mesh,
      this.fog.mesh,
      this.sparkles.points,
      this.mist.points,
      this.shardsBurst.points
    );
  }

  public play(options: IceCrystalWaveOptions): void {
    const tuning = ICE_CRYSTAL_WAVE_TUNING;
    const scale = options.scale ?? 1;
    const L = Math.max(3, options.length);
    const speed = Math.max(4, options.travelSpeed ?? tuning.defaultTravelSpeed);

    this.age = 0;
    this.baseScale = scale;
    this.lineLength = L;
    this.travelSpeed = speed;
    this.spawnFxIndex = 0;
    this.shatterEmitted = false;

    // Formação completa quando o último cristal termina de crescer; depois
    // permanece e estilhaça.
    const fullAt = (L - 0.6) / speed + tuning.growSeconds;
    this.holdEnd = fullAt + tuning.holdSeconds;
    this.totalLife = this.holdEnd + tuning.shatterSeconds + 0.7;

    // Centro explícito: o pé da Maga. Só o yaw da direção planar entra na
    // rotação — a linha funciona em qualquer orientação do personagem e os
    // cristais ficam sempre de pé em relação ao mundo.
    const dir = TMP_POS.copy(options.direction).setY(0);
    const yaw = dir.lengthSq() > 1e-8 ? Math.atan2(dir.x, dir.z) : 0;
    this.group.visible = true;
    this.group.position.copy(options.start);
    this.group.rotation.set(0, yaw, 0);
    this.group.scale.setScalar(1);

    // ----------------------------------------------------------------- linha
    this.clusters.length = 0;
    let bigCount = 0;
    let smallCount = 0;
    let fogCount = 0;
    const clusterCount = THREE.MathUtils.clamp(Math.round(L / tuning.clusterSpacing), 7, MAX_CLUSTERS);

    const addBig = (
      x: number,
      z: number,
      h: number,
      lean: number,
      delay: number
    ): void => {
      if (bigCount >= BIG_SHARD_CAPACITY) return;
      const w = h * tuning.baseWidthRatio * (0.8 + Math.random() * 0.45);
      this.composeShardMatrix(x, z, w, h, lean);
      this.big.mesh.setMatrixAt(bigCount, TMP_MATRIX);
      this.big.delays.setX(bigCount, delay);
      this.big.seeds.setX(bigCount, Math.random() * 10);
      bigCount++;
    };
    const addSmall = (x: number, z: number, h: number, lean: number, delay: number): void => {
      if (smallCount >= SMALL_SHARD_CAPACITY) return;
      const w = h * (0.3 + Math.random() * 0.25);
      this.composeShardMatrix(x, z, w, h, lean * 0.6 + (Math.random() - 0.5) * 0.5);
      this.small.mesh.setMatrixAt(smallCount, TMP_MATRIX);
      this.small.delays.setX(smallCount, delay);
      this.small.seeds.setX(smallCount, Math.random() * 10);
      smallCount++;
    };
    const addFog = (x: number, z: number, size: number, delay: number): void => {
      if (fogCount >= FOG_CAPACITY) return;
      TMP_POS.set(x, 0.45 + Math.random() * 0.4, z);
      TMP_SCALE.setScalar(size);
      TMP_MATRIX.compose(TMP_POS, IDENTITY_QUAT, TMP_SCALE);
      this.fog.mesh.setMatrixAt(fogCount, TMP_MATRIX);
      this.fog.delays.setX(fogCount, delay);
      this.fog.seeds.setX(fogCount, Math.random() * 10);
      fogCount++;
    };

    for (let i = 0; i < clusterCount; i++) {
      const t = clusterCount <= 1 ? 1 : i / (clusterCount - 1);
      const isHero = i === clusterCount - 1;
      // Posição ao longo da linha: começa logo à frente da Maga e termina no
      // ponto de impacto (cristal-herói).
      const z = THREE.MathUtils.lerp(0.9, L - 0.6, t)
        + (isHero ? 0 : (Math.random() - 0.5) * 0.45);
      const spread = THREE.MathUtils.lerp(tuning.spreadRange[0], tuning.spreadRange[1], t);
      const x = (Math.random() - 0.5) * spread * (isHero ? 0.25 : 0.8);
      const spawnAt = z / speed;
      this.clusters.push({ local: new THREE.Vector3(x, 0, z), spawnAt });

      // Altura cresce com a curva da referência; o herói é o maior de todos.
      const hBase = THREE.MathUtils.lerp(
        tuning.heightRange[0],
        tuning.heightRange[1],
        Math.pow(t, tuning.heightCurve)
      ) * scale;
      const h = hBase * (isHero ? 1.15 : 0.82 + Math.random() * 0.36);
      const lean = THREE.MathUtils.lerp(tuning.leanRange[0], tuning.leanRange[1], t)
        + (isHero ? 0.04 : (Math.random() - 0.5) * 0.12);

      // Cristal principal + dois flancos espalhados pela cunha: a crista
      // ocupa uma ÁREA larga, não uma fileira fina.
      addBig(x, z, h, lean, spawnAt + Math.random() * 0.02);
      const side = Math.random() < 0.5 ? 1 : -1;
      addBig(
        x + side * (0.5 + Math.random() * spread * 0.5),
        z - 0.25 - Math.random() * 0.35,
        h * (0.5 + Math.random() * 0.22),
        lean + 0.08,
        spawnAt + 0.04 + Math.random() * 0.05
      );
      addBig(
        x - side * (0.45 + Math.random() * spread * 0.45),
        z + 0.1 + Math.random() * 0.3,
        h * (0.38 + Math.random() * 0.2),
        lean + 0.05 + (Math.random() - 0.5) * 0.15,
        spawnAt + 0.06 + Math.random() * 0.06
      );
      // Fragmentos pequenos espalhados até a borda da cunha.
      const fragments = 3 + Math.floor(Math.random() * 2);
      for (let fIdx = 0; fIdx < fragments; fIdx++) {
        addSmall(
          x + (Math.random() - 0.5) * (spread * 1.6 + 0.8),
          z + (Math.random() - 0.5) * 1.1,
          (0.22 + Math.random() * 0.34) * scale * (0.6 + t * 0.8),
          lean,
          spawnAt + 0.06 + Math.random() * 0.1
        );
      }
      // Um bolsão de névoa por aglomerado, rolando entre as bases.
      addFog(
        x + (Math.random() - 0.5) * spread * 0.8,
        z + (Math.random() - 0.5) * 0.6,
        THREE.MathUtils.lerp(tuning.fogSizeRange[0], tuning.fogSizeRange[1], t)
          * scale * (0.85 + Math.random() * 0.3),
        spawnAt + 0.05
      );
    }
    // Névoa extra adensando o cristal-herói (como a base enevoada da imagem).
    const heroCluster = this.clusters[this.clusters.length - 1];
    for (let e = 0; e < 2; e++) {
      addFog(
        heroCluster.local.x + (Math.random() - 0.5) * 2.2,
        heroCluster.local.z - 0.6 - Math.random() * 1.4,
        ICE_CRYSTAL_WAVE_TUNING.fogSizeRange[1] * scale * (0.9 + Math.random() * 0.3),
        heroCluster.spawnAt + 0.1 + e * 0.1
      );
    }

    this.big.mesh.count = bigCount;
    this.small.mesh.count = smallCount;
    this.fog.mesh.count = fogCount;
    this.big.mesh.instanceMatrix.needsUpdate = true;
    this.small.mesh.instanceMatrix.needsUpdate = true;
    this.fog.mesh.instanceMatrix.needsUpdate = true;
    this.big.delays.needsUpdate = true;
    this.big.seeds.needsUpdate = true;
    this.small.delays.needsUpdate = true;
    this.small.seeds.needsUpdate = true;
    this.fog.delays.needsUpdate = true;
    this.fog.seeds.needsUpdate = true;

    // Uniforms reiniciados por onda.
    this.crystalMat.uniforms.uTime.value = 0;
    this.crystalMat.uniforms.uBreak.value = 0;
    this.crystalMat.uniforms.uGlow.value = tuning.rimGlow;
    this.crystalMat.uniforms.uOpacity.value = tuning.crystalOpacity;

    this.fog.material.uniforms.uTime.value = 0;
    this.fog.material.uniforms.uFade.value = 1;
    this.fog.material.uniforms.uOpacity.value = tuning.fogOpacity;

    // Plano de geada cobrindo a linha inteira (1 m atrás até 2 m além).
    const lenTotal = L + 3;
    const zCenter = lenTotal / 2 - 1;
    this.frostMesh.scale.set(tuning.groundWidth, 1, lenTotal);
    this.frostMesh.position.set(0, 0.03, zCenter);
    this.frostMat.uniforms.uLen.value = L;
    this.frostMat.uniforms.uLenTotal.value = lenTotal;
    this.frostMat.uniforms.uZCenter.value = zCenter;
    this.frostMat.uniforms.uWidth.value = tuning.groundWidth;
    this.frostMat.uniforms.uFront.value = 0;
    this.frostMat.uniforms.uFade.value = 1;
    this.frostMat.uniforms.uTime.value = 0;
    this.frostMat.uniforms.uSeed.value = Math.random() * 10;

    // UMA luz fria acompanhando a frente da onda.
    this.lightHandle = this.lightPool.acquire();
    if (this.lightHandle) {
      this.lightHandle.light.color.set(ICE_CRYSTAL_COLORS.rim);
      this.lightHandle.light.intensity = 0;
      this.lightHandle.light.distance = Math.max(8, L * 0.9);
      this.positionLight(0);
    }
  }

  /** Matriz do cristal: posição na linha, yaw aleatório e tombo para frente. */
  private composeShardMatrix(x: number, z: number, width: number, height: number, lean: number): void {
    TMP_POS.set(x, 0, z);
    // Tomba para longe da Maga (+Z local) e rola de leve para o lado, como os
    // cristais da referência; o yaw aleatório varia as facetas expostas.
    TMP_QUAT.setFromAxisAngle(X_AXIS, lean);
    TMP_QUAT2.setFromAxisAngle(Z_AXIS, (Math.random() - 0.5) * 0.2);
    TMP_QUAT.multiply(TMP_QUAT2);
    TMP_QUAT2.setFromAxisAngle(Y_AXIS, Math.random() * Math.PI * 2);
    TMP_QUAT.multiply(TMP_QUAT2);
    TMP_SCALE.set(width, height, width * (0.72 + Math.random() * 0.5));
    TMP_MATRIX.compose(TMP_POS, TMP_QUAT, TMP_SCALE);
  }

  /** A luz única segue a frente de erupção até parar no cristal-herói. */
  private positionLight(front: number): void {
    if (!this.lightHandle) return;
    TMP_POS.set(0, 1.3, THREE.MathUtils.clamp(front, 0.8, this.lineLength - 0.6));
    this.group.localToWorld(TMP_POS);
    this.lightHandle.light.position.copy(TMP_POS);
  }

  public update(delta: number): boolean {
    const tuning = ICE_CRYSTAL_WAVE_TUNING;
    const elapsed = Math.max(0, delta);
    this.age += elapsed;

    this.crystalMat.uniforms.uTime.value = this.age;
    this.frostMat.uniforms.uTime.value = this.age;
    this.fog.material.uniforms.uTime.value = this.age;

    // Frente de erupção em metros — a mesma velocidade do projétil de gelo.
    const front = this.age * this.travelSpeed;
    this.frostMat.uniforms.uFront.value = front;

    // Faíscas frias no instante em que cada aglomerado irrompe.
    while (
      this.spawnFxIndex < this.clusters.length &&
      this.age >= this.clusters[this.spawnFxIndex].spawnAt
    ) {
      const cluster = this.clusters[this.spawnFxIndex];
      this.sparkles.add(TMP_POS.copy(cluster.local).setY(0.4), {
        color: ICE_CRYSTAL_COLORS.sparkle,
        count: 3,
        speed: 2.0 * this.baseScale,
        spread: 0.9,
        lifetime: 0.6,
        upwardBias: 0.5,
        size: [1.6, 3.6],
      });
      this.mist.add(TMP_POS.copy(cluster.local).setY(0.25), {
        color: ICE_CRYSTAL_COLORS.mist,
        count: 2,
        speed: 0.6,
        spread: 0.55,
        lifetime: 1.3,
        upwardBias: 0.3,
        opacity: 0.16,
        growth: 1.6,
        size: [2.8, 4],
      });
      this.spawnFxIndex++;
    }

    // Estilhaçamento final: o gelo se desfaz em fragmentos e partículas.
    const br = THREE.MathUtils.clamp((this.age - this.holdEnd) / tuning.shatterSeconds, 0, 1);
    this.crystalMat.uniforms.uBreak.value = br;
    this.frostMat.uniforms.uFade.value = 1 - THREE.MathUtils.smoothstep(br, 0, 0.75);
    // A névoa é a última a ir embora: segura além da quebra e dissipa no fim.
    const endFade = THREE.MathUtils.clamp((this.totalLife - this.age) / 0.6, 0, 1);
    this.fog.material.uniforms.uFade.value = (1 - br * 0.6) * endFade;

    if (br > 0 && !this.shatterEmitted) {
      this.shatterEmitted = true;
      for (const cluster of this.clusters) {
        this.shardsBurst.add(TMP_POS.copy(cluster.local).setY(0.8), {
          color: ICE_CRYSTAL_COLORS.sparkle,
          count: 4,
          speed: 3.6 * this.baseScale,
          spread: 1.1,
          lifetime: 0.65,
          upwardBias: 0.35,
          size: [1.4, 3.2],
          growth: -0.8,
        });
        this.mist.add(TMP_POS.copy(cluster.local).setY(0.45), {
          color: ICE_CRYSTAL_COLORS.mist,
          count: 1,
          speed: 0.85,
          spread: 0.7,
          lifetime: 1.0,
          upwardBias: 0.4,
          opacity: 0.14,
          growth: 1.8,
          size: [2.8, 4],
        });
      }
    }

    // Envelope da luz única: acende com a frente, pico na quebra, apaga.
    if (this.lightHandle) {
      const formation = THREE.MathUtils.clamp(front / Math.max(1, this.lineLength * 0.4), 0, 1);
      const spike = br > 0 ? (1 - br) * 0.8 : 0;
      this.lightHandle.light.intensity =
        tuning.lightIntensity * this.baseScale * (formation * (1 - br * br) * 0.9 + spike);
      this.positionLight(front);
    }

    const sparklesAlive = this.sparkles.update(elapsed);
    const mistAlive = this.mist.update(elapsed);
    const burstAlive = this.shardsBurst.update(elapsed);

    return this.age < this.totalLife || sparklesAlive || mistAlive || burstAlive;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.spawnFxIndex = 0;
    this.shatterEmitted = false;
    this.clusters.length = 0;
    this.big.mesh.count = 0;
    this.small.mesh.count = 0;
    this.fog.mesh.count = 0;
    this.crystalMat.uniforms.uBreak.value = 0;
    this.frostMat.uniforms.uFront.value = 0;
    this.fog.material.uniforms.uFade.value = 1;
    this.lightHandle?.release();
    this.lightHandle = null;
    this.sparkles.reset();
    this.mist.reset();
    this.shardsBurst.reset();
  }

  public dispose(): void {
    disposeInstancedShardSet(this.big);
    disposeInstancedShardSet(this.small);
    this.fog.geometry.deleteAttribute('position');
    this.fog.geometry.dispose();
    this.fog.material.dispose();
    this.fog.mesh.dispose();
    this.crystalMat.dispose();
    this.frostMat.dispose();
    this.sparkles.dispose();
    this.mist.dispose();
    this.shardsBurst.dispose();
  }
}

/**
 * Fachada em pool da onda de cristais, no mesmo padrão dos outros subsistemas
 * do kit da Maga (projectiles, lasers, impacts...).
 */
export class IceCrystalWaveVFX {
  private readonly resources = createIceWaveResources();
  private readonly pool: VFXPool<IceCrystalWaveEffect>;
  private readonly active: IceCrystalWaveEffect[] = [];

  public constructor(
    private readonly scene: THREE.Scene,
    glowTexture: THREE.Texture,
    lightPool: VFXLightPool
  ) {
    this.pool = new VFXPool(
      () => new IceCrystalWaveEffect(this.resources, glowTexture, lightPool),
      3
    );
  }

  public play(options: IceCrystalWaveOptions): void {
    const wave = this.pool.acquire();
    if (!wave) return;
    wave.play(options);
    this.scene.add(wave.group);
    this.active.push(wave);
  }

  public update(delta: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const wave = this.active[i];
      if (wave.update(delta)) continue;
      this.pool.release(wave);
      this.active.splice(i, 1);
    }
  }

  public clear(): void {
    for (const wave of this.active) this.pool.release(wave);
    this.active.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.pool.dispose();
    this.resources.dispose();
  }

  public get activeCount(): number {
    return this.active.length;
  }
}
