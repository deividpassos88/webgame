import * as THREE from 'three';
import type { PoolableVFX } from '../VFXPool';
import { VFXLightPool, type VFXLightHandle } from '../VFXLightPool';
import { PooledParticleCloud } from '../ParticleManager';
import {
  ICE_CRYSTAL_COLORS,
  createShardGeometry,
  createCrystalMaterial as createCoreCrystalMaterial,
  createInstancedShardSet,
  disposeInstancedShardSet,
  type CrystalMaterial,
  type InstancedShardSet,
} from '../ice/IceCrystalCore';

/**
 * Giro Glacial — anel de cristais de gelo que emerge do chão ao redor do
 * guerreiro, acompanhando a progressão do giro da lâmina.
 *
 * A referência visual é a formação de gelo em linha: cristais 3D compridos,
 * pontudos, facetados e irregulares, com base azul profunda, corpo azul claro
 * e bordas luminosas em ciano/branco, rachaduras azul-ciano no chão e névoa
 * fria discreta. Aqui a formação em linha vira um CÍRCULO ao redor do
 * personagem: cada aglomerado nasce em sequência, na mesma direção do rastro
 * da espada, inclinado para fora do círculo.
 *
 * Desempenho (WebGL desktop/tablet):
 * - Todos os cristais grandes são UM InstancedMesh; os fragmentos pequenos são
 *   outro — 2 draw calls para ~80 cristais.
 * - A animação de emergir/estilhaçar é feita no vertex shader via atributos
 *   instanciados (aDelay/aSeed) — nenhuma matriz é atualizada por frame.
 * - Rachaduras são um único disco com shader procedural.
 * - UMA luz do pool para o efeito inteiro (nunca uma luz por cristal).
 * - Partículas: três nuvens fixas (brilhos, névoa e estilhaços) com limites
 *   baixos, reutilizadas pelo pool.
 */

/** Parâmetros de ajuste do Giro Glacial (tamanho, brilho e duração). */
export const GLACIAL_CRYSTALS_TUNING = {
  /** Raio do círculo de cristais ao redor do personagem (metros). */
  ringRadius: 3.2,
  /** Quantos aglomerados de cristais formam o círculo. */
  clusterCount: 11,
  /** Altura do cristal principal de cada aglomerado (mín/máx, metros). */
  mainHeight: [1.45, 2.35] as const,
  /** Largura da base em função da altura (base mais larga, ponta fina). */
  baseWidthRatio: 0.21,
  /** Inclinação para fora do círculo (mín/máx, radianos). */
  outwardTilt: [0.24, 0.52] as const,
  /** Segundos até o primeiro cristal nascer (sobrescrito pelo timing da skill). */
  emergeDelaySeconds: 0.12,
  /** Segundos até o círculo fechar (sobrescrito pelo momento de impacto). */
  ringCompleteSeconds: 0.62,
  /** Quanto tempo cada cristal leva para emergir do chão. */
  growSeconds: 0.22,
  /** Quanto tempo o gelo permanece formado depois do círculo fechar. */
  holdSeconds: 0.95,
  /** Duração do estilhaçamento final. */
  shatterSeconds: 0.5,
  /** Intensidade do brilho das bordas (fresnel ciano/branco). */
  rimGlow: 1.25,
  /** Intensidade da luz pontual única do efeito. */
  lightIntensity: 3.0,
  /** Opacidade do corpo do cristal (quase sólido, como gelo denso). */
  crystalOpacity: 0.96,
  /** Cores do gelo (paleta compartilhada da referência). */
  colors: ICE_CRYSTAL_COLORS,
} as const;

/** Capacidade máxima de instâncias (compartilhada por todo o anel). */
const BIG_SHARD_CAPACITY = 40;
const SMALL_SHARD_CAPACITY = 56;

/* ------------------------------------------------------------------------ */
/* Geometria                                                                  */
/* ------------------------------------------------------------------------ */

/** Disco plano no plano XZ para as rachaduras procedurais no chão. */
function createCrackDiscGeometry(segments: number): THREE.BufferGeometry {
  const geometry = new THREE.CircleGeometry(1, segments);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export interface GlacialCrystalResources {
  /** Variações de espigão grande/pequeno compartilhadas por todas as instâncias. */
  readonly bigShard: THREE.BufferGeometry;
  readonly smallShard: THREE.BufferGeometry;
  readonly crackDisc: THREE.BufferGeometry;
  dispose(): void;
}

/** Geometrias construídas uma única vez e compartilhadas pelo pool. */
export function createGlacialCrystalResources(): GlacialCrystalResources {
  const bigShard = createShardGeometry(911, 6, 1);
  const smallShard = createShardGeometry(347, 5, 1.2);
  const crackDisc = createCrackDiscGeometry(48);
  return {
    bigShard,
    smallShard,
    crackDisc,
    dispose() {
      bigShard.dispose();
      smallShard.dispose();
      crackDisc.dispose();
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Shaders                                                                    */
/* ------------------------------------------------------------------------ */

const CRACK_VERTEX = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CRACK_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uReveal;
  uniform float uFade;
  uniform float uTime;
  uniform float uClusters;
  uniform float uSeed;
  uniform float uGlow;
  varying vec2 vPos;

  const float PI = 3.14159265;
  const float RING_R = 0.74; // raio dos cristais no espaço do disco unitário

  void main() {
    vec2 p = vPos;
    float r = length(p);
    float ang = atan(p.x, p.y);

    // Revela no sentido do giro, começando nas costas (mesma fase dos cristais).
    float f = fract((ang - PI) / (2.0 * PI));
    float reveal = smoothstep(f, f + 0.07, uReveal);

    // Rachaduras principais: uma por aglomerado, serrilhadas pelo raio.
    float jag = sin(r * 21.0 + uSeed * 7.0) * 0.14 + sin(r * 47.0 - uSeed * 3.0) * 0.06;
    float trunk = pow(abs(cos((ang + jag) * uClusters * 0.5 + uSeed)), 48.0);
    float env = smoothstep(0.16, 0.5, r) * (1.0 - smoothstep(RING_R * 1.02, 1.0, r));

    // Teia fina ligando as bases dos cristais.
    float web = pow(abs(cos(ang * uClusters + r * 10.0 + uSeed * 2.0)), 22.0);
    float webEnv = smoothstep(RING_R - 0.32, RING_R - 0.05, r)
      * (1.0 - smoothstep(RING_R + 0.02, RING_R + 0.2, r));

    // Geada discreta cobrindo o piso dentro do anel.
    float frost = (1.0 - smoothstep(RING_R * 0.35, RING_R * 1.08, r)) * 0.05;

    float flicker = 0.88 + 0.12 * sin(uTime * 9.0 + r * 14.0);
    float alpha = (trunk * env + web * webEnv * 0.6 + frost) * reveal * uFade * flicker;
    if (alpha <= 0.003) discard;

    vec3 col = uColor * (1.0 + (1.0 - r) * 0.35) * uGlow;
    gl_FragColor = vec4(col, alpha);
  }
`;

/* ------------------------------------------------------------------------ */
/* Efeito                                                                     */
/* ------------------------------------------------------------------------ */

export interface GlacialCrystalRingOptions {
  /** Centro do efeito: posição do pé do personagem no instante do cast. */
  readonly position: THREE.Vector3;
  /** Frente planar do personagem (define onde o círculo "começa"). */
  readonly forward: THREE.Vector3;
  readonly scale?: number;
  /** Raio do círculo de cristais; default do tuning. */
  readonly ringRadius?: number;
  /** Segundos (desde o cast) até o primeiro cristal nascer. */
  readonly emergeDelaySeconds?: number;
  /** Segundos (desde o cast) até o círculo fechar — momento do impacto. */
  readonly ringCompleteSeconds?: number;
}

interface ClusterInfo {
  readonly local: THREE.Vector3;
  readonly spawnAt: number;
}

type CrackMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uColor: { value: THREE.Color };
    uReveal: { value: number };
    uFade: { value: number };
    uTime: { value: number };
    uClusters: { value: number };
    uSeed: { value: number };
    uGlow: { value: number };
  };
};

function createCrystalMaterial(): CrystalMaterial {
  return createCoreCrystalMaterial({
    growSeconds: GLACIAL_CRYSTALS_TUNING.growSeconds,
    rimGlow: GLACIAL_CRYSTALS_TUNING.rimGlow,
    opacity: GLACIAL_CRYSTALS_TUNING.crystalOpacity,
  });
}

function createCrackMaterial(): CrackMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(GLACIAL_CRYSTALS_TUNING.colors.cracks) },
      uReveal: { value: 0 },
      uFade: { value: 1 },
      uTime: { value: 0 },
      uClusters: { value: GLACIAL_CRYSTALS_TUNING.clusterCount },
      uSeed: { value: 0 },
      uGlow: { value: 1 },
    },
    vertexShader: CRACK_VERTEX,
    fragmentShader: CRACK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }) as CrackMaterial;
}

const TMP_MATRIX = new THREE.Matrix4();
const TMP_POS = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_QUAT2 = new THREE.Quaternion();
const TMP_SCALE = new THREE.Vector3();
const TMP_AXIS = new THREE.Vector3();
const TMP_OUT = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Anel de cristais do Giro Glacial. O centro do efeito é a posição do
 * personagem no cast; o group gira só no eixo Y (yaw da frente planar), então
 * funciona em qualquer orientação do personagem — os cristais são sempre
 * verticais em relação ao mundo e inclinados para fora do círculo.
 */
export class GlacialCrystalRingEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();

  private readonly big: InstancedShardSet;
  private readonly small: InstancedShardSet;
  private readonly bigShards: THREE.InstancedMesh;
  private readonly smallShards: THREE.InstancedMesh;
  private readonly bigDelays: THREE.InstancedBufferAttribute;
  private readonly bigSeeds: THREE.InstancedBufferAttribute;
  private readonly smallDelays: THREE.InstancedBufferAttribute;
  private readonly smallSeeds: THREE.InstancedBufferAttribute;
  private readonly crystalMat: CrystalMaterial;
  private readonly crackMat: CrackMaterial;
  private readonly crackMesh: THREE.Mesh;
  private readonly sparkles: PooledParticleCloud;
  private readonly mist: PooledParticleCloud;
  private readonly shardsBurst: PooledParticleCloud;
  private lightHandle: VFXLightHandle | null = null;

  private readonly clusters: ClusterInfo[] = [];
  private age = 0;
  private emergeDelay: number = GLACIAL_CRYSTALS_TUNING.emergeDelaySeconds;
  private sweepSeconds = 0.5;
  private holdEnd = 1.5;
  private totalLife = 2.5;
  private baseScale = 1;
  private spawnFxIndex = 0;
  private shatterEmitted = false;

  public constructor(
    resources: GlacialCrystalResources,
    private readonly glowTexture: THREE.Texture,
    private readonly lightPool: VFXLightPool
  ) {
    this.group.name = 'WarriorGlacialCrystals';
    this.group.visible = false;

    this.crystalMat = createCrystalMaterial();

    // Geometrias próprias (atributos instanciados não podem ser partilhados
    // entre efeitos simultâneos), mas reutilizando os MESMOS Float32Arrays de
    // posição das geometrias-base do recurso compartilhado.
    this.big = createInstancedShardSet(resources.bigShard, BIG_SHARD_CAPACITY, this.crystalMat);
    this.bigShards = this.big.mesh;
    this.bigShards.name = 'GlacialBigShards';
    this.bigDelays = this.big.delays;
    this.bigSeeds = this.big.seeds;

    this.small = createInstancedShardSet(resources.smallShard, SMALL_SHARD_CAPACITY, this.crystalMat);
    this.smallShards = this.small.mesh;
    this.smallShards.name = 'GlacialSmallShards';
    this.smallDelays = this.small.delays;
    this.smallSeeds = this.small.seeds;

    this.crackMat = createCrackMaterial();
    this.crackMesh = new THREE.Mesh(resources.crackDisc, this.crackMat);
    this.crackMesh.name = 'GlacialGroundCracks';
    this.crackMesh.position.y = 0.03;
    this.crackMesh.renderOrder = 4;
    this.crackMesh.frustumCulled = false;

    this.sparkles = new PooledParticleCloud(56, glowTexture);
    this.mist = new PooledParticleCloud(48, glowTexture, { blending: 'normal' });
    this.shardsBurst = new PooledParticleCloud(72, glowTexture);

    this.group.add(
      this.crackMesh,
      this.bigShards,
      this.smallShards,
      this.sparkles.points,
      this.mist.points,
      this.shardsBurst.points
    );
  }

  public play(options: GlacialCrystalRingOptions): void {
    const tuning = GLACIAL_CRYSTALS_TUNING;
    const scale = options.scale ?? 1;
    const ringRadius = options.ringRadius ?? tuning.ringRadius * scale;

    this.age = 0;
    this.baseScale = scale;
    this.spawnFxIndex = 0;
    this.shatterEmitted = false;
    this.emergeDelay = Math.max(0.02, options.emergeDelaySeconds ?? tuning.emergeDelaySeconds);
    const ringComplete = options.ringCompleteSeconds ?? tuning.ringCompleteSeconds;
    this.sweepSeconds = THREE.MathUtils.clamp(ringComplete - this.emergeDelay, 0.25, 1.4);
    this.holdEnd = this.emergeDelay + this.sweepSeconds + tuning.holdSeconds;
    this.totalLife = this.holdEnd + tuning.shatterSeconds + 0.7;

    // Centro explícito do efeito: o pé do personagem no cast. Só o yaw da
    // frente planar entra na rotação — cristais sempre de pé no mundo.
    this.group.visible = true;
    this.group.position.copy(options.position);
    const forward = TMP_OUT.copy(options.forward).setY(0);
    const yaw = forward.lengthSq() > 1e-8 ? Math.atan2(forward.x, forward.z) : 0;
    this.group.rotation.set(0, yaw, 0);
    this.group.scale.setScalar(1);

    // Monta o anel: aglomerados em sequência angular, começando nas costas
    // (mesma fase do rastro da lâmina) e seguindo o sentido do giro.
    this.clusters.length = 0;
    let bigCount = 0;
    let smallCount = 0;
    const K = tuning.clusterCount;

    const addBig = (x: number, z: number, h: number, delay: number): void => {
      if (bigCount >= BIG_SHARD_CAPACITY) return;
      const w = h * tuning.baseWidthRatio * (0.8 + Math.random() * 0.45);
      this.composeShardMatrix(x, z, w, h, tuning.outwardTilt[0], tuning.outwardTilt[1]);
      this.bigShards.setMatrixAt(bigCount, TMP_MATRIX);
      this.bigDelays.setX(bigCount, delay);
      this.bigSeeds.setX(bigCount, Math.random() * 10);
      bigCount++;
    };
    const addSmall = (x: number, z: number, h: number, delay: number): void => {
      if (smallCount >= SMALL_SHARD_CAPACITY) return;
      const w = h * (0.3 + Math.random() * 0.25);
      this.composeShardMatrix(x, z, w, h, 0.1, 0.9);
      this.smallShards.setMatrixAt(smallCount, TMP_MATRIX);
      this.smallDelays.setX(smallCount, delay);
      this.smallSeeds.setX(smallCount, Math.random() * 10);
      smallCount++;
    };

    for (let i = 0; i < K; i++) {
      const f = i / K;
      // Começa atrás (PI) e segue o mesmo sentido do rastro giratório (+yaw).
      const ang = Math.PI + f * Math.PI * 2 + (Math.random() - 0.5) * ((Math.PI * 2) / K) * 0.42;
      const rad = ringRadius + (Math.random() - 0.5) * 0.85 * scale;
      const cx = Math.sin(ang) * rad;
      const cz = Math.cos(ang) * rad;
      const spawnAt = this.emergeDelay + f * this.sweepSeconds;
      this.clusters.push({ local: new THREE.Vector3(cx, 0, cz), spawnAt });

      // Cristal principal + 1 médio, alturas e inclinações variadas.
      const mainH = THREE.MathUtils.lerp(tuning.mainHeight[0], tuning.mainHeight[1], Math.random()) * scale;
      addBig(cx, cz, mainH, spawnAt + Math.random() * 0.03);
      if (Math.random() < 0.85) {
        addBig(
          cx + (Math.random() - 0.5) * 0.75 * scale,
          cz + (Math.random() - 0.5) * 0.75 * scale,
          mainH * (0.5 + Math.random() * 0.25),
          spawnAt + 0.04 + Math.random() * 0.07
        );
      }
      // Fragmentos pequenos entre os cristais maiores.
      const fragments = 2 + Math.floor(Math.random() * 2);
      for (let fIdx = 0; fIdx < fragments; fIdx++) {
        addSmall(
          cx + (Math.random() - 0.5) * 1.3 * scale,
          cz + (Math.random() - 0.5) * 1.3 * scale,
          (0.24 + Math.random() * 0.38) * scale,
          spawnAt + 0.05 + Math.random() * 0.1
        );
      }
    }

    this.bigShards.count = bigCount;
    this.smallShards.count = smallCount;
    this.bigShards.instanceMatrix.needsUpdate = true;
    this.smallShards.instanceMatrix.needsUpdate = true;
    this.bigDelays.needsUpdate = true;
    this.bigSeeds.needsUpdate = true;
    this.smallDelays.needsUpdate = true;
    this.smallSeeds.needsUpdate = true;

    // Uniforms reiniciados por cast.
    this.crystalMat.uniforms.uTime.value = 0;
    this.crystalMat.uniforms.uBreak.value = 0;
    this.crystalMat.uniforms.uGlow.value = tuning.rimGlow;
    this.crystalMat.uniforms.uOpacity.value = tuning.crystalOpacity;

    this.crackMat.uniforms.uReveal.value = 0;
    this.crackMat.uniforms.uFade.value = 1;
    this.crackMat.uniforms.uTime.value = 0;
    this.crackMat.uniforms.uSeed.value = Math.random() * 10;
    this.crackMat.uniforms.uClusters.value = K;
    this.crackMesh.scale.setScalar(ringRadius / 0.74);

    // UMA luz fria para o anel inteiro.
    this.lightHandle = this.lightPool.acquire();
    if (this.lightHandle) {
      this.lightHandle.light.color.set(tuning.colors.rim);
      this.lightHandle.light.intensity = 0;
      this.lightHandle.light.distance = ringRadius * 2.6;
      this.lightHandle.light.position.copy(options.position);
      this.lightHandle.light.position.y += 1.1;
    }

    this.sparkles.setTexture(this.glowTexture);
    this.mist.setTexture(this.glowTexture);
    this.shardsBurst.setTexture(this.glowTexture);
  }

  /** Matriz do cristal: posição no anel, yaw aleatório e tombo para fora. */
  private composeShardMatrix(
    x: number,
    z: number,
    width: number,
    height: number,
    tiltMin: number,
    tiltMax: number
  ): void {
    TMP_POS.set(x, 0, z);
    TMP_OUT.set(x, 0, z);
    if (TMP_OUT.lengthSq() < 1e-8) TMP_OUT.set(0, 0, 1);
    TMP_OUT.normalize();
    // Eixo tangente ao círculo: girar o topo em direção a "fora".
    TMP_AXIS.crossVectors(UP, TMP_OUT).normalize();
    const tilt = THREE.MathUtils.lerp(tiltMin, tiltMax, Math.random());
    TMP_QUAT.setFromAxisAngle(TMP_AXIS, tilt);
    TMP_QUAT2.setFromAxisAngle(UP, Math.random() * Math.PI * 2);
    TMP_QUAT.multiply(TMP_QUAT2);
    TMP_SCALE.set(width, height, width * (0.72 + Math.random() * 0.5));
    TMP_MATRIX.compose(TMP_POS, TMP_QUAT, TMP_SCALE);
  }

  public update(delta: number): boolean {
    const tuning = GLACIAL_CRYSTALS_TUNING;
    const elapsed = Math.max(0, delta);
    this.age += elapsed;

    this.crystalMat.uniforms.uTime.value = this.age;
    this.crackMat.uniforms.uTime.value = this.age;

    // O círculo fecha acompanhando a progressão do giro.
    const reveal = THREE.MathUtils.clamp((this.age - this.emergeDelay) / this.sweepSeconds, 0, 1);
    this.crackMat.uniforms.uReveal.value = reveal;

    // Faíscas + névoa fria no instante em que cada aglomerado emerge.
    while (
      this.spawnFxIndex < this.clusters.length &&
      this.age >= this.clusters[this.spawnFxIndex].spawnAt
    ) {
      const cluster = this.clusters[this.spawnFxIndex];
      this.sparkles.add(TMP_POS.copy(cluster.local).setY(0.35), {
        color: tuning.colors.sparkle,
        count: 3,
        speed: 1.9 * this.baseScale,
        spread: 0.8,
        lifetime: 0.55,
        upwardBias: 0.5,
        size: [7, 18],
      });
      this.mist.add(TMP_POS.copy(cluster.local).setY(0.22), {
        color: tuning.colors.mist,
        count: 2,
        speed: 0.55,
        spread: 0.5,
        lifetime: 1.3,
        upwardBias: 0.3,
        opacity: 0.16,
        growth: 1.6,
        size: [26, 52],
      });
      this.spawnFxIndex++;
    }

    // Estilhaçamento final: o gelo se desfaz em fragmentos e partículas.
    const br = THREE.MathUtils.clamp((this.age - this.holdEnd) / tuning.shatterSeconds, 0, 1);
    this.crystalMat.uniforms.uBreak.value = br;
    this.crackMat.uniforms.uFade.value = 1 - THREE.MathUtils.smoothstep(br, 0, 0.75);

    if (br > 0 && !this.shatterEmitted) {
      this.shatterEmitted = true;
      for (const cluster of this.clusters) {
        this.shardsBurst.add(TMP_POS.copy(cluster.local).setY(0.7), {
          color: tuning.colors.sparkle,
          count: 5,
          speed: 3.4 * this.baseScale,
          spread: 1.1,
          lifetime: 0.6,
          upwardBias: 0.35,
          size: [6, 16],
          growth: -0.8,
        });
        this.mist.add(TMP_POS.copy(cluster.local).setY(0.4), {
          color: tuning.colors.mist,
          count: 1,
          speed: 0.8,
          spread: 0.7,
          lifetime: 1.0,
          upwardBias: 0.4,
          opacity: 0.14,
          growth: 1.8,
          size: [30, 56],
        });
      }
    }

    // Envelope da luz única: acende com a formação, pico na quebra, apaga.
    if (this.lightHandle) {
      const spike = br > 0 ? (1 - br) * 0.8 : 0;
      this.lightHandle.light.intensity =
        tuning.lightIntensity * this.baseScale * (reveal * (1 - br * br) * 0.9 + spike);
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
    this.bigShards.count = 0;
    this.smallShards.count = 0;
    this.crystalMat.uniforms.uBreak.value = 0;
    this.crackMat.uniforms.uReveal.value = 0;
    this.lightHandle?.release();
    this.lightHandle = null;
    this.sparkles.reset();
    this.mist.reset();
    this.shardsBurst.reset();
  }

  public dispose(): void {
    // As posições pertencem ao recurso compartilhado; aqui saem só os
    // atributos instanciados e materiais próprios deste efeito.
    disposeInstancedShardSet(this.big);
    disposeInstancedShardSet(this.small);
    this.crystalMat.dispose();
    this.crackMat.dispose();
    this.sparkles.dispose();
    this.mist.dispose();
    this.shardsBurst.dispose();
  }
}
