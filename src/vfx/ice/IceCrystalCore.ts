import * as THREE from 'three';

/**
 * Núcleo visual compartilhado dos cristais de gelo da referência: espigões 3D
 * compridos, pontudos, facetados e irregulares, com azul profundo na base,
 * azul claro no corpo e bordas luminosas em ciano/branco.
 *
 * Este módulo é só a "matéria-prima" (geometria + material + animação de
 * emergir/estilhaçar no shader). Quem define a FORMAÇÃO é cada efeito:
 * - Maga (skill 2): linha/onda de cristais crescendo do personagem ao alvo
 *   (`IceCrystalWaveVFX`), exatamente como a imagem de referência;
 * - Guerreiro (Giro Glacial): a mesma receita adaptada em círculo
 *   (`warrior/GlacialCrystalsVFX`).
 *
 * Desempenho: os cristais são InstancedMesh (1 draw call por malha), a
 * animação é 100% no vertex shader via atributos instanciados (aDelay/aSeed)
 * e as normais facetadas vêm de dFdx/dFdy — nenhuma matriz ou normal é
 * recalculada por frame na CPU.
 */

/** Paleta do gelo da referência (base -> corpo -> ponta -> borda). */
export const ICE_CRYSTAL_COLORS = {
  deepBase: 0x0b2f6e,
  body: 0x4fa8e8,
  tip: 0xd9f4ff,
  rim: 0x58e6ff,
  cracks: 0x45d5ff,
  mist: 0xbfe6ff,
  sparkle: 0xcdf3ff,
} as const;

/** RNG determinístico: a malha dos cristais é estável entre execuções. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Um espigão de gelo facetado e irregular: base poligonal larga (enterrada de
 * leve para nunca flutuar), anel intermediário deslocado e ponta fina fora do
 * eixo. Non-indexed: as normais planas vêm de dFdx/dFdy no fragment shader,
 * então só a posição é enviada à GPU.
 */
export function createShardGeometry(seed: number, sides: number, spiky: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const baseY = -0.16; // base enterrada: nada flutua em micro-desníveis
  const midY = 0.4 + rng() * 0.12;
  const base: THREE.Vector3[] = [];
  const mid: THREE.Vector3[] = [];
  const twist = (rng() - 0.5) * 0.7;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + (rng() - 0.5) * (0.9 / sides);
    const rb = 1 * (0.78 + rng() * 0.42);
    base.push(new THREE.Vector3(Math.sin(a) * rb, baseY, Math.cos(a) * rb));
    const rm = (0.42 + rng() * 0.2) * spiky;
    const am = a + twist / sides + (rng() - 0.5) * 0.2;
    mid.push(new THREE.Vector3(Math.sin(am) * rm, midY + (rng() - 0.5) * 0.08, Math.cos(am) * rm));
  }
  const tip = new THREE.Vector3((rng() - 0.5) * 0.3, 1, (rng() - 0.5) * 0.3);

  const positions: number[] = [];
  const push = (v: THREE.Vector3) => positions.push(v.x, v.y, v.z);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    // Face lateral base -> meio (dois triângulos, facetas bem definidas).
    push(base[i]); push(base[j]); push(mid[i]);
    push(base[j]); push(mid[j]); push(mid[i]);
    // Faceta meio -> ponta.
    push(mid[i]); push(mid[j]); push(tip);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

const CRYSTAL_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uGrow;
  uniform float uBreak;
  attribute float aDelay;
  attribute float aSeed;
  varying vec3 vWorldPos;
  varying float vLocalY;
  varying float vSeed;
  varying float vFade;

  float easeOutBack(float t) {
    float c1 = 1.70158;
    float c3 = c1 + 1.0;
    float x = t - 1.0;
    return 1.0 + c3 * x * x * x + c1 * x * x;
  }

  void main() {
    vSeed = aSeed;
    float raw = (uTime - aDelay) / max(uGrow, 0.0001);
    float t = clamp(raw, 0.0, 1.0);
    float rise = raw <= 0.0 ? 0.0 : easeOutBack(t);
    // Estilhaçamento com leve defasagem por cristal (quebra orgânica).
    float br = clamp(uBreak * 1.35 - fract(aSeed * 7.31) * 0.35, 0.0, 1.0);

    vec3 pos = position;
    vLocalY = clamp(pos.y, 0.0, 1.0);
    // Nasce fino e engrossa; encolhe de leve ao quebrar.
    pos.xz *= (0.5 + 0.5 * rise) * (1.0 - 0.38 * br * br);
    // Emerge do chão subindo pelo próprio eixo inclinado; afunda ao quebrar.
    pos.y -= (1.0 - rise) * 1.35;
    pos.y -= br * br * 1.6;
    // Tremor curto no instante da quebra.
    pos.x += sin(uTime * 41.0 + aSeed * 29.0) * 0.035 * br * (1.0 - br);
    pos.z += cos(uTime * 37.0 + aSeed * 13.0) * 0.035 * br * (1.0 - br);

    vFade = (raw <= 0.0 ? 0.0 : 1.0) * (1.0 - smoothstep(0.45, 1.0, br));

    #ifdef USE_INSTANCING
      vec4 world = modelMatrix * instanceMatrix * vec4(pos, 1.0);
    #else
      vec4 world = modelMatrix * vec4(pos, 1.0);
    #endif
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CRYSTAL_FRAGMENT = /* glsl */ `
  uniform vec3 uColorBase;
  uniform vec3 uColorBody;
  uniform vec3 uColorTip;
  uniform vec3 uColorRim;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uTime;
  varying vec3 vWorldPos;
  varying float vLocalY;
  varying float vSeed;
  varying float vFade;

  void main() {
    if (vFade <= 0.002) discard;
    // Normal plana por faceta (gelo lapidado), sem atributo de normal.
    vec3 n = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    vec3 v = normalize(cameraPosition - vWorldPos);
    if (dot(n, v) < 0.0) n = -n;

    // Azul profundo na base -> azul claro no corpo -> ponta quase branca.
    vec3 col = mix(uColorBase, uColorBody, smoothstep(0.03, 0.55, vLocalY));
    col = mix(col, uColorTip, smoothstep(0.7, 1.0, vLocalY));

    // Iluminação facetada fake (chave fria + ambiente) — luz nenhuma da cena.
    vec3 L = normalize(vec3(0.35, 0.85, 0.4));
    float diff = max(dot(n, L), 0.0);
    col *= 0.48 + 0.78 * diff;

    // Brilho interno gelado, pulsando de leve.
    col += uColorBody * (0.07 + 0.05 * sin(uTime * 3.1 + vSeed * 17.0));

    // Bordas luminosas em ciano/branco (fresnel).
    float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.3);
    col += mix(uColorRim, vec3(1.0), 0.4) * fresnel * uGlow;

    // Ponta acesa.
    col += vec3(0.78, 0.94, 1.0) * smoothstep(0.86, 1.0, vLocalY) * 0.45 * uGlow;

    gl_FragColor = vec4(col, uOpacity * vFade);
  }
`;

export type CrystalMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uTime: { value: number };
    uGrow: { value: number };
    uBreak: { value: number };
    uColorBase: { value: THREE.Color };
    uColorBody: { value: THREE.Color };
    uColorTip: { value: THREE.Color };
    uColorRim: { value: THREE.Color };
    uGlow: { value: number };
    uOpacity: { value: number };
  };
};

export interface CrystalMaterialOptions {
  readonly growSeconds: number;
  readonly rimGlow: number;
  readonly opacity: number;
}

export function createCrystalMaterial(options: CrystalMaterialOptions): CrystalMaterial {
  const c = ICE_CRYSTAL_COLORS;
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uGrow: { value: options.growSeconds },
      uBreak: { value: 0 },
      uColorBase: { value: new THREE.Color(c.deepBase) },
      uColorBody: { value: new THREE.Color(c.body) },
      uColorTip: { value: new THREE.Color(c.tip) },
      uColorRim: { value: new THREE.Color(c.rim) },
      uGlow: { value: options.rimGlow },
      uOpacity: { value: options.opacity },
    },
    vertexShader: CRYSTAL_VERTEX,
    fragmentShader: CRYSTAL_FRAGMENT,
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
  }) as CrystalMaterial;
}

export interface InstancedShardSet {
  readonly geometry: THREE.BufferGeometry;
  readonly mesh: THREE.InstancedMesh;
  readonly delays: THREE.InstancedBufferAttribute;
  readonly seeds: THREE.InstancedBufferAttribute;
}

/**
 * Cria um InstancedMesh de espigões a partir de uma geometria-base
 * compartilhada. Os atributos instanciados (aDelay/aSeed) são próprios de cada
 * efeito (efeitos simultâneos não podem dividir o mesmo buffer), mas o
 * Float32Array de posições é o MESMO da geometria-base.
 */
export function createInstancedShardSet(
  source: THREE.BufferGeometry,
  capacity: number,
  material: CrystalMaterial
): InstancedShardSet {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', source.getAttribute('position'));
  const delays = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  const seeds = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  geometry.setAttribute('aDelay', delays);
  geometry.setAttribute('aSeed', seeds);
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 3;
  return { geometry, mesh, delays, seeds };
}

/** Libera a geometria de um conjunto instanciado sem tocar as posições compartilhadas. */
export function disposeInstancedShardSet(set: InstancedShardSet): void {
  set.geometry.deleteAttribute('position');
  set.geometry.dispose();
  set.mesh.dispose();
}
