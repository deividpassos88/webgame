#!/usr/bin/env node
/**
 * Pré-visualização dos decalques de impacto de chão das skills 1 e 2 da Maga.
 *
 * As texturas são geradas em `src/vfx/GroundDecalTextures.ts` (DataTexture, sem
 * canvas). Como o sandbox não tem navegador, este script reimplementa a MESMA
 * matemática em JS e grava PNGs — assim dá para conferir "chão rachado" (skill
 * 1, água) e "poça congelada" (skill 2, gelo) sem abrir o jogo.
 *
 * Regra: qualquer mudança de desenho precisa ser feita nos dois lugares.
 *
 * Uso:  node tools/preview-ground-decals.mjs [dir] [tamanho] [fundo]
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const outDir = resolve(process.argv[2] ?? 'artifacts');
const size = Number(process.argv[3] ?? 512);
const background = process.argv[4] ?? 'stone';

// ---------------------------------------------------------------- constantes
// Espelha src/vfx/GroundDecalTextures.ts.
const CRACK_SEED = 11;
const CRACK_COUNT = 8;
const BRANCH_COUNT = 4;
const FROST_SEED = 29;
const FROST_SHARDS = 13;
const FROST_INNER = 7;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0 || 1e-6));
  return t * t * (3 - 2 * t);
};
const hash = (value, seed) => {
  const v = Math.sin(value * 127.1 + seed * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const angleDelta = (a, b) => {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
};
const wobble = (radius, index, seed) => 0.06 * Math.sin(radius * 3.4 + index * 2.3 + seed)
  + 0.022 * Math.sin(radius * 8.7 - index * 1.7 + seed * 0.5);

function cracked(x, y) {
  const r = Math.hypot(x, y);
  if (r > 1.02) return [0, 0, 0, 0];
  const angle = Math.atan2(y, x);

  const baseAngle = [];
  for (let index = 0; index < CRACK_COUNT; index += 1) {
    baseAngle.push((index / CRACK_COUNT) * Math.PI * 2 + (hash(index, CRACK_SEED) - 0.5) * 0.5);
  }
  const branchStart = [];
  const branchAngle = [];
  for (let index = 0; index < BRANCH_COUNT; index += 1) {
    branchStart.push(0.34 + hash(index + 40, CRACK_SEED) * 0.3);
    branchAngle.push(hash(index + 70, CRACK_SEED) * Math.PI * 2);
  }

  const width = 0.026 - 0.009 * r;
  let crack = 0;
  let dust = 0;
  for (let index = 0; index < CRACK_COUNT; index += 1) {
    const theta = baseAngle[index] + wobble(r, index, CRACK_SEED);
    const lateral = Math.abs(angleDelta(angle, theta)) * Math.max(r, 0.045);
    const line = Math.exp(-Math.pow(lateral / width, 2));
    const chunks = r < 0.2 ? 1 : clamp01(0.45 + 0.55 * Math.sin(r * 11 + index * 2.7));
    if (line > 0.01) crack = Math.max(crack, line * mix(0.75, 1, chunks) * (1 - smoothstep(0.55, 0.95, r) * 0.45));
    const band = Math.abs(lateral - width * 1.9);
    if (band < width * 2) dust = Math.max(dust, Math.exp(-Math.pow(band / (width * 0.85), 2)));
  }
  for (let index = 0; index < BRANCH_COUNT; index += 1) {
    const start2 = branchStart[index];
    if (r < start2) continue;
    const theta = branchAngle[index] + wobble(r, index + 20, CRACK_SEED) * 0.7;
    const lateral = Math.abs(angleDelta(angle, theta)) * Math.max(r, 0.045);
    const line = Math.exp(-Math.pow(lateral / (width * 0.62), 2))
      * smoothstep(start2, start2 + 0.06, r)
      * (1 - smoothstep(0.62, 0.86, r));
    crack = Math.max(crack, line * 0.8);
  }
  let debris = 0;
  for (let index = 0; index < 22; index += 1) {
    const distance = 0.14 + hash(index, CRACK_SEED + 3) * 0.6;
    const speckAngle = hash(index + 11, CRACK_SEED + 5) * Math.PI * 2;
    const d = Math.hypot(x - Math.cos(speckAngle) * distance, y - Math.sin(speckAngle) * distance);
    const speckSize = 0.011 + hash(index + 23, CRACK_SEED + 7) * 0.017;
    debris = Math.max(debris, Math.exp(-Math.pow(d / speckSize, 2)) * (1 - smoothstep(0.55, 0.9, r) * 0.4));
  }

  const mask = 1 - smoothstep(0.8, 1.0, r);
  const hotCenter = Math.exp(-Math.pow(r / 0.13, 2)) * 0.85;
  const alpha = clamp01((crack * 0.95 + dust * 0.24 + hotCenter * 0.8 + debris * 0.3) * mask);
  const dark = crack > 0.02 ? clamp01(crack * 1.25 - debris * 0.5) : 0;
  const earth = [0.58, 0.5, 0.42];
  let red = mix(earth[0], 0.035, dark);
  let green = mix(earth[1], 0.03, dark);
  let blue = mix(earth[2], 0.035, dark);
  const glow = clamp01(dust * 0.75 + debris * 0.85 + hotCenter);
  red = mix(red, 0.98, glow * 0.85);
  green = mix(green, 0.86, glow * 0.85);
  blue = mix(blue, 0.62, glow * 0.85);
  return [clamp01(red), clamp01(green), clamp01(blue), alpha];
}

function frozen(x, y) {
  const r = Math.hypot(x, y);
  if (r > 1.02) return [0, 0, 0, 0];
  const angle = Math.atan2(y, x);

  const outerLength = [];
  const outerAngle = [];
  for (let index = 0; index < FROST_SHARDS; index += 1) {
    const alternate = index % 2 === 0 ? 1 : 0.72;
    outerLength.push((0.34 + hash(index, FROST_SEED) * 0.3) * alternate);
    outerAngle.push((index / FROST_SHARDS) * Math.PI * 2 + (hash(index + 31, FROST_SEED) - 0.5) * 0.2);
  }
  const innerLength = [];
  const innerAngle = [];
  for (let index = 0; index < FROST_INNER; index += 1) {
    innerLength.push(0.2 + hash(index + 61, FROST_SEED) * 0.16);
    innerAngle.push((index / FROST_INNER) * Math.PI * 2 + (hash(index + 91, FROST_SEED) - 0.5) * 0.5);
  }

  const mask = 1 - smoothstep(0.8, 0.99, r);
  const sheet = smoothstep(0.02, 0.24, r) * (1 - smoothstep(0.44, 0.9, r));

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

  const spin = x * 3.6 + y * 2.1 + Math.sin(y * 2.4) * 1.5;
  const plates = clamp01(0.55 + 0.45 * Math.sin(spin) * Math.sin(y * 3.3 - x * 2.2))
    * (1 - smoothstep(0.5, 0.88, r));
  const rim = Math.exp(-Math.pow((r - 0.74) / 0.035, 2)) * 0.6;
  const core = Math.exp(-Math.pow(r / 0.17, 2)) * 0.5;
  const frost = clamp01(shards + rim + core);
  const alpha = clamp01((sheet * 0.34 + plates * 0.2 + frost * 0.55) * mask);
  const deep = 1 - smoothstep(0.18, 0.9, r);
  const bright = clamp01(shards * 0.8 + rim * 0.85 + core * 0.7);
  const plateTint = mix(-0.04, 0.05, plates);
  return [
    clamp01(mix(mix(0.36, 0.82, deep) + plateTint, 1, bright * 0.65)),
    clamp01(mix(mix(0.6, 0.93, deep) + plateTint, 1, bright * 0.8)),
    clamp01(mix(mix(0.93, 1.0, deep) + plateTint * 0.5, 1, bright)),
    alpha,
  ];
}

// ------------------------------------------------------------------- PNG
function writePng(path, pixels, width, height) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([length, typeAndData, crc]);
  };
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let py = 0; py < height; py += 1) {
    raw[py * (width * 3 + 1)] = 0;
    pixels.copy(raw, py * (width * 3 + 1) + 1, py * width * 3, (py + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

/** Fundo do piso da dungeon, para julgar o contraste do decalque. */
function floorPixel(px, py, size) {
  if (background === 'white') return [255, 255, 255];
  if (background === 'dark') return [18, 16, 22];
  const tile = 0.5 + 0.5 * Math.sin(px * 0.09) * Math.sin(py * 0.09);
  const base = 62 + tile * 16;
  return [base + 4, base, base + 8];
}

function renderPixels(sample, size) {
  const pixels = Buffer.alloc(size * size * 3);
  for (let py = 0; py < size; py += 1) {
    const y = (py / (size - 1)) * 2 - 1;
    for (let px = 0; px < size; px += 1) {
      const x = (px / (size - 1)) * 2 - 1;
      const [cr, cg, cb, ca] = sample(x, y);
      const [br, bg, bb] = floorPixel(px, py, size);
      const offset = (py * size + px) * 3;
      pixels[offset] = Math.round(mix(br, cr * 255, ca));
      pixels[offset + 1] = Math.round(mix(bg, cg * 255, ca));
      pixels[offset + 2] = Math.round(mix(bb, cb * 255, ca));
    }
  }
  return pixels;
}

function render(name, sample, pixels) {
  const path = join(outDir, `${name}.png`);
  writePng(path, pixels, size, size);
  console.log(`Gravado ${path} (${size}x${size}, fundo ${background})`);
}

/** Os dois impactos lado a lado (skill 1 à esquerda, skill 2 à direita). */
function writeCombined(crackedPixels, frozenPixels) {
  const gap = Math.round(size * 0.04);
  const width = size * 2 + gap;
  const combined = Buffer.alloc(width * size * 3);
  const gapColor = [30, 28, 34];
  for (let py = 0; py < size; py += 1) {
    crackedPixels.copy(combined, py * width * 3, py * size * 3, (py + 1) * size * 3);
    const frozenStart = py * width * 3 + (size + gap) * 3;
    frozenPixels.copy(combined, frozenStart, py * size * 3, (py + 1) * size * 3);
    for (let index = 0; index < gap; index += 1) {
      const offset = py * width * 3 + (size + index) * 3;
      combined[offset] = gapColor[0];
      combined[offset + 1] = gapColor[1];
      combined[offset + 2] = gapColor[2];
    }
  }
  const path = join(outDir, 'ground-decals-combinado.png');
  writePng(path, combined, width, size);
  console.log(`Gravado ${path} (${width}x${size}: skill 1 | skill 2)`);
}

mkdirSync(outDir, { recursive: true });
const crackedPixels = renderPixels(cracked, size);
const frozenPixels = renderPixels(frozen, size);
render('ground-cracked-skill1', cracked, crackedPixels);
render('ground-frozen-skill2', frozen, frozenPixels);
writeCombined(crackedPixels, frozenPixels);
