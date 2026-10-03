import * as THREE from 'three';

/**
 * Textura do anel de impacto do ataque básico da Maga.
 *
 * É o desenho da referência que o usuário mandou: um anel fino branco-azulado
 * com raios que cruzam para dentro e para fora, névoa irregular em volta e o
 * miolo vazio. Fica numa billboard (sprite), então aparece sempre de frente
 * para a câmera, igual à referência, em qualquer ângulo de jogo.
 *
 * É gerada em `DataTexture` (sem canvas) para funcionar também nos testes, que
 * rodam sem DOM. A MESMA matemática vive em `tools/preview-impact-ring.mjs`,
 * que grava um PNG para conferir o desenho sem abrir o jogo — mudou aqui,
 * muda lá.
 */

/** Tamanhos/cores do desenho (espelhados no script de pré-visualização). */
const RING_RADIUS = 0.58;
const RING_WIDTH = 0.062;
const HALO = 0.42;
const SPIKES = 48;
const SEED = 7;

const CORE: readonly [number, number, number] = [0.965, 0.988, 1];
const GLOW: readonly [number, number, number] = [0.435, 0.839, 1];
const DEEP: readonly [number, number, number] = [0.122, 0.42, 1];

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

/** Ruído barato e determinístico por índice de setor. */
function hash(value: number): number {
  const v = Math.sin(value * 127.1 + SEED * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Cor (rgb 0..1) e alfa (0..1) do anel num ponto do quad em [-1, 1]. */
function sample(x: number, y: number): [number, number, number, number] {
  const r = Math.hypot(x, y);
  if (r > 1.42) return [0, 0, 0, 0];
  const angle = Math.atan2(y, x);

  // Anel levemente irregular (não é um círculo de neon perfeito).
  const wobble = 1 + 0.008 * Math.sin(angle * 5 + SEED) + 0.006 * Math.sin(angle * 11 - SEED * 2);
  const radius = RING_RADIUS * wobble;
  const d = Math.abs(r - radius);

  // Anel fino + névoa azul irregular em volta.
  const ring = Math.exp(-Math.pow(d / (RING_WIDTH * (1 + 0.25 * Math.sin(angle * 5))), 2));
  const mist = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(angle * 9 + SEED * 3));
  const halo = Math.exp(-Math.pow(d / (RING_WIDTH * (4.4 + 1.6 * mist)), 2)) * HALO * (0.75 + 0.5 * mist);

  // Raios: cada setor tem comprimento, brilho e abertura próprios.
  const sector = (angle / (Math.PI * 2) + 1) * SPIKES;
  const index = Math.floor(sector);
  const frac = sector - index;
  const centered = Math.abs(frac - 0.5) * 2;
  const h1 = hash(index);
  const h2 = hash(index + 91.3);
  const h3 = hash(index + 777.7);
  const hero = h2 > 0.66 ? 2.6 : 1;
  const width = 0.04 + 0.07 * h1;
  const lenOut = 0.34 * (0.35 + 0.9 * h2) * hero;
  const lenIn = 0.14 * (0.3 + 0.7 * h3);
  // O raio é uma cunha: fino no anel, abrindo conforme se afasta dele.
  const span = d / (r >= radius ? lenOut : lenIn);
  const widthAt = width * (1 + 2.4 * span);
  const spike = Math.max(0, 1 - centered / widthAt);
  const spikeShape = spike * spike * (3 - 2 * spike);
  const fall = Math.exp(-Math.pow(span, 1.9));
  const brightness = 0.3 + 1.5 * h2 * (h1 > 0.45 ? 1 : 0.78);
  const ray = spikeShape * fall * brightness;

  const body = ring + ray * 0.9;
  // Miolo vazio e nada de raio comprido até a borda do sprite.
  const hole = smoothstep(0.17, 0.34, r);
  const reach = smoothstep(1.02, 0.86, r) + 0.25;
  const alpha = clamp01((body + halo * 0.5) * reach) * hole;
  if (alpha <= 0.0005) return [0, 0, 0, 0];

  const t = clamp01(body);
  const toGlow = clamp01(t * 1.6);
  let red = mix(DEEP[0], GLOW[0], toGlow);
  let green = mix(DEEP[1], GLOW[1], toGlow);
  let blue = mix(DEEP[2], GLOW[2], toGlow);
  // Ponta do raio puxa para o azul profundo; o anel estoura em branco.
  const tip = clamp01(span * 0.9) * (1 - clamp01(ring * 1.4)) * 0.7;
  red = mix(red, DEEP[0], tip);
  green = mix(green, DEEP[1], tip);
  blue = mix(blue, DEEP[2], tip);
  const white = clamp01(ring * 1.3 + ray * (0.45 + 0.5 * h2) - 0.15);
  return [
    mix(red, CORE[0], white),
    mix(green, CORE[1], white),
    mix(blue, CORE[2], white),
    alpha,
  ];
}

/**
 * Gera a textura do anel (RGBA, mipmaps ligados). `size` é o lado em pixels.
 */
export function createImpactRingTexture(size = 512): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const x = ((px + 0.5) / size) * 2 - 1;
      const y = 1 - ((py + 0.5) / size) * 2;
      const [red, green, blue, alpha] = sample(x, y);
      const offset = (py * size + px) * 4;
      data[offset] = Math.round(clamp01(red) * 255);
      data[offset + 1] = Math.round(clamp01(green) * 255);
      data[offset + 2] = Math.round(clamp01(blue) * 255);
      data[offset + 3] = Math.round(clamp01(alpha) * 255);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'MageImpactRingTexture';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
