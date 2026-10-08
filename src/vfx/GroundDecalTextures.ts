import * as THREE from 'three';

/**
 * Texturas dos impactos de chão das skills 1 e 2 da Maga.
 *
 * - `createCrackedGroundTexture` (skill 1, feitiço de água): chão rachado —
 *   fissuras escuras e finas abrindo do ponto de impacto, rebordo estreito de
 *   terra levantada e brilho quente no centro. É puramente VISUAL: não altera
 *   geometria do cenário, não abre buraco e não mexe em colisão nenhuma.
 * - `createFrozenGroundTexture` (skill 2, feitiço de gelo): poça congelada —
 *   lâmina de gelo com lascas radiais, placas irregulares e aro de geada, SEM
 *   rachadura de chão.
 *
 * São geradas em `DataTexture` (sem canvas) para funcionarem nos testes, que
 * rodam sem DOM. A MESMA matemática vive em `tools/preview-ground-decals.mjs`,
 * que grava um PNG para conferir o desenho sem abrir o jogo — mudou aqui, muda
 * lá.
 *
 * Escala: a amostra (x, y) vive no quad em [-1, 1]; o decalque cobre um raio de
 * 3 m, então 1.0 no quad = 3 m no mundo.
 */

const CRACK_SEED = 11;
const CRACK_COUNT = 8;
const BRANCH_COUNT = 4;
const FROST_SEED = 29;
const FROST_SHARDS = 13;
const FROST_INNER = 7;

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

/** Ruído determinístico por índice (mesmo em JS puro e no TS do jogo). */
function hash(value: number, seed: number): number {
  const v = Math.sin(value * 127.1 + seed * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Menor diferença angular entre dois ângulos, em radianos (-PI, PI]. */
function angleDelta(a: number, b: number): number {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Serpenteio leve da fissura em função do raio (a fissura quase não curva). */
function wobble(radius: number, index: number, seed: number): number {
  return 0.06 * Math.sin(radius * 3.4 + index * 2.3 + seed)
    + 0.022 * Math.sin(radius * 8.7 - index * 1.7 + seed * 0.5);
}

function createTexture(size: number, fill: (data: Uint8Array) => void): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  fill(data);
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Chão rachado do impacto da skill 1 (água). Traços FINOS: a fissura principal é
 * escura e estreita, com um fio de terra clara de cada lado; o miolo guarda o
 * clarão do golpe que acabou de bater.
 */
export function createCrackedGroundTexture(size = 512): THREE.DataTexture {
  return createTexture(size, (data) => {
    // Direções-base das fissuras (determinísticas, espalhadas sem simetria).
    const baseAngle: number[] = [];
    for (let index = 0; index < CRACK_COUNT; index += 1) {
      baseAngle.push((index / CRACK_COUNT) * Math.PI * 2 + (hash(index, CRACK_SEED) - 0.5) * 0.5);
    }
    // Ramos curtos: começam longe do centro e não chegam à borda.
    const branchStart: number[] = [];
    const branchAngle: number[] = [];
    for (let index = 0; index < BRANCH_COUNT; index += 1) {
      branchStart.push(0.34 + hash(index + 40, CRACK_SEED) * 0.3);
      branchAngle.push(hash(index + 70, CRACK_SEED) * Math.PI * 2);
    }

    for (let py = 0; py < size; py += 1) {
      const y = (py / (size - 1)) * 2 - 1;
      for (let px = 0; px < size; px += 1) {
        const x = (px / (size - 1)) * 2 - 1;
        const r = Math.hypot(x, y);
        const angle = Math.atan2(y, x);
        const offset = (py * size + px) * 4;
        if (r > 1.02) continue;

        // Fissura principal: afina conforme se afasta do impacto.
        const width = 0.026 - 0.009 * r;
        let crack = 0;
        let dust = 0;
        for (let index = 0; index < CRACK_COUNT; index += 1) {
          const theta = baseAngle[index] + wobble(r, index, CRACK_SEED);
          const lateral = Math.abs(angleDelta(angle, theta)) * Math.max(r, 0.045);
          const line = Math.exp(-Math.pow(lateral / width, 2));
          // A fissura vai e volta (quebra em pedaços) longe do centro.
          const chunks = r < 0.2 ? 1 : clamp01(0.45 + 0.55 * Math.sin(r * 11 + index * 2.7));
          if (line > 0.01) crack = Math.max(crack, line * mix(0.75, 1, chunks) * (1 - smoothstep(0.55, 0.95, r) * 0.45));
          const band = Math.abs(lateral - width * 1.9);
          if (band < width * 2) dust = Math.max(dust, Math.exp(-Math.pow(band / (width * 0.85), 2)));
        }

        for (let index = 0; index < BRANCH_COUNT; index += 1) {
          const start = branchStart[index];
          if (r < start) continue;
          const theta = branchAngle[index] + wobble(r, index + 20, CRACK_SEED) * 0.7;
          const lateral = Math.abs(angleDelta(angle, theta)) * Math.max(r, 0.045);
          const line = Math.exp(-Math.pow(lateral / (width * 0.62), 2))
            * smoothstep(start, start + 0.06, r)
            * (1 - smoothstep(0.62, 0.86, r));
          crack = Math.max(crack, line * 0.8);
        }

        // Torrões: pedrinhas levantadas em volta da quebra.
        let debris = 0;
        for (let index = 0; index < 22; index += 1) {
          const distance = 0.14 + hash(index, CRACK_SEED + 3) * 0.6;
          const speckAngle = hash(index + 11, CRACK_SEED + 5) * Math.PI * 2;
          const d = Math.hypot(x - Math.cos(speckAngle) * distance, y - Math.sin(speckAngle) * distance);
          const speckSize = 0.011 + hash(index + 23, CRACK_SEED + 7) * 0.017;
          debris = Math.max(debris, Math.exp(-Math.pow(d / speckSize, 2)) * (1 - smoothstep(0.55, 0.9, r) * 0.4));
        }

        const mask = 1 - smoothstep(0.8, 1.0, r);
        // Terra afundada no miolo e clarão do golpe.
        const sunken = smoothstep(0.12, 0.62, r) * 0;
        const hotCenter = Math.exp(-Math.pow(r / 0.13, 2)) * 0.85;
        const alpha = clamp01((crack * 0.95 + dust * 0.24 + hotCenter * 0.8 + debris * 0.3) * mask);
        if (alpha <= 0.004) continue;

        // Cor: fissura quase preta, terra clara no rebordo/torrões, miolo quente.
        const dark = crack > 0.02 ? clamp01(crack * 1.25 - debris * 0.5) : 0;
        const earth = [0.58, 0.5, 0.42];
        let red = mix(earth[0], 0.035, dark);
        let green = mix(earth[1], 0.03, dark);
        let blue = mix(earth[2], 0.035, dark);
        const glow = clamp01(dust * 0.75 + debris * 0.85 + hotCenter);
        red = mix(red, 0.98, glow * 0.85);
        green = mix(green, 0.86, glow * 0.85);
        blue = mix(blue, 0.62, glow * 0.85);
        const shade = mix(1, 0.72, sunken);
        data[offset] = Math.round(clamp01(red * shade) * 255);
        data[offset + 1] = Math.round(clamp01(green * shade) * 255);
        data[offset + 2] = Math.round(clamp01(blue * shade) * 255);
        data[offset + 3] = Math.round(alpha * 255);
      }
    }
  });
}

/**
 * Poça congelada do impacto da skill 2 (gelo): lâmina translúcida com lascas
 * radiais pontudas, placas irregulares de gelo e aro de geada — gelo, não chão
 * quebrado.
 */
export function createFrozenGroundTexture(size = 512): THREE.DataTexture {
  return createTexture(size, (data) => {
    const outerLength: number[] = [];
    const outerAngle: number[] = [];
    for (let index = 0; index < FROST_SHARDS; index += 1) {
      // Uma lasca longa a cada duas curtas: evita a cara de "estrela de sol".
      const alternate = index % 2 === 0 ? 1 : 0.72;
      outerLength.push((0.34 + hash(index, FROST_SEED) * 0.3) * alternate);
      outerAngle.push((index / FROST_SHARDS) * Math.PI * 2 + (hash(index + 31, FROST_SEED) - 0.5) * 0.2);
    }
    const innerLength: number[] = [];
    const innerAngle: number[] = [];
    for (let index = 0; index < FROST_INNER; index += 1) {
      innerLength.push(0.2 + hash(index + 61, FROST_SEED) * 0.16);
      innerAngle.push((index / FROST_INNER) * Math.PI * 2 + (hash(index + 91, FROST_SEED) - 0.5) * 0.5);
    }

    for (let py = 0; py < size; py += 1) {
      const y = (py / (size - 1)) * 2 - 1;
      for (let px = 0; px < size; px += 1) {
        const x = (px / (size - 1)) * 2 - 1;
        const r = Math.hypot(x, y);
        const angle = Math.atan2(y, x);
        const offset = (py * size + px) * 4;
        if (r > 1.02) continue;

        const mask = 1 - smoothstep(0.8, 0.99, r);
        // Lâmina de gelo: densa no miolo, afinando para a borda.
        const sheet = smoothstep(0.02, 0.24, r) * (1 - smoothstep(0.44, 0.9, r));

        // Lascas: triângulos pontudos saindo do centro (e um anel interno delas).
        let shards = 0;
        for (let index = 0; index < FROST_SHARDS; index += 1) {
          const length = outerLength[index];
          if (r > length) continue;
          const lateral = Math.abs(angleDelta(angle, outerAngle[index])) * Math.max(r, 0.04);
          const half = length * 0.16 * (1 - Math.pow(r / length, 0.8));
          if (lateral > half) continue;
          const edge = 1 - Math.pow(lateral / half, 2);
          shards = Math.max(shards, edge * (1 - smoothstep(length * 0.6, length, r)));
        }
        for (let index = 0; index < FROST_INNER; index += 1) {
          const length = innerLength[index];
          if (r > length + 0.2) continue;
          const lateral = Math.abs(angleDelta(angle, innerAngle[index])) * Math.max(r, 0.04);
          const half = 0.02 * (1 - Math.pow(Math.max(0, r - 0.16) / length, 0.9));
          if (half <= 0.001 || lateral > half) continue;
          const edge = 1 - Math.pow(lateral / half, 2);
          const fade = smoothstep(0.12, 0.2, r) * (1 - smoothstep(0.2, 0.2 + length, r));
          shards = Math.max(shards, edge * fade * 0.9);
        }

        // Placas: manchas largas de gelo (nada de grade regular).
        const spin = x * 3.6 + y * 2.1 + Math.sin(y * 2.4) * 1.5;
        const plates = clamp01(0.55 + 0.45 * Math.sin(spin) * Math.sin(y * 3.3 - x * 2.2))
          * (1 - smoothstep(0.5, 0.88, r));

        // Geada: aro externo + miolo claro.
        const rim = Math.exp(-Math.pow((r - 0.74) / 0.035, 2)) * 0.6;
        const core = Math.exp(-Math.pow(r / 0.17, 2)) * 0.5;
        const frost = clamp01(shards + rim + core);
        const alpha = clamp01((sheet * 0.34 + plates * 0.2 + frost * 0.55) * mask);
        if (alpha <= 0.004) continue;

        // Gelo: centro claro, placas azuladas, lascas quase brancas.
        const deep = 1 - smoothstep(0.18, 0.9, r);
        const bright = clamp01(shards * 0.8 + rim * 0.85 + core * 0.7);
        const plateTint = mix(-0.04, 0.05, plates);
        data[offset] = Math.round(clamp01(mix(mix(0.36, 0.82, deep) + plateTint, 1, bright * 0.65)) * 255);
        data[offset + 1] = Math.round(clamp01(mix(mix(0.6, 0.93, deep) + plateTint, 1, bright * 0.8)) * 255);
        data[offset + 2] = Math.round(clamp01(mix(mix(0.93, 1.0, deep) + plateTint * 0.5, 1, bright)) * 255);
        data[offset + 3] = Math.round(alpha * 255);
      }
    }
  });
}
