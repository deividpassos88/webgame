#!/usr/bin/env node
/**
 * Pré-visualização do anel de impacto do ataque básico da Maga.
 *
 * A textura é gerada em `src/vfx/ImpactRingTexture.ts` (DataTexture, sem
 * canvas). Como o sandbox não tem navegador, este script reimplementa a MESMA
 * matemática em JS e grava um PNG — assim dá para conferir o desenho (anel fino
 * branco, raios cruzando para dentro e para fora, miolo vazio) sem abrir o jogo.
 *
 * Regra: qualquer mudança de desenho precisa ser feita nos dois lugares.
 *
 * Uso:  node tools/preview-impact-ring.mjs [saida.png] [tamanho] [fundo]
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const output = resolve(process.argv[2] ?? 'artifacts/impact-ring.png');
const size = Number(process.argv[3] ?? 512);
const background = process.argv[4] ?? 'dark';

// ---------------------------------------------------------------- constantes
// Espelha os valores de src/vfx/ImpactRingTexture.ts.
const RING_RADIUS = 0.58;
const RING_WIDTH = 0.062;
const HALO = 0.42;
const SPIKES = 48;
const CORE = [0.965, 0.988, 1];
const GLOW = [0.435, 0.839, 1];
const DEEP = [0.122, 0.42, 1];
const SEED = 7;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;

function hash(x) {
  const v = Math.sin(x * 127.1 + SEED * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Intensidade (0..1) e cor do anel num ponto do quad em [-1, 1]. */
function sample(x, y) {
  const r = Math.hypot(x, y);
  if (r > 1.42) return [0, 0, 0, 0];
  const angle = Math.atan2(y, x);
  // Anel levemente irregular (não é um círculo de neon perfeito).
  const wobble = 1 + 0.008 * Math.sin(angle * 5 + SEED) + 0.006 * Math.sin(angle * 11 - SEED * 2);
  const radius = RING_RADIUS * wobble;
  const d = Math.abs(r - radius);

  // Anel fino + halo azul em volta.
  const ring = Math.exp(-Math.pow(d / (RING_WIDTH * (1 + 0.25 * Math.sin(angle * 5))), 2));
  // Névoa irregular em volta do anel (não é um brilho liso de neon).
  const mist = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(angle * 9 + SEED * 3));
  const halo = Math.exp(-Math.pow(d / (RING_WIDTH * (4.8 + 1.8 * mist)), 2)) * HALO * (0.8 + 0.55 * mist);
  const sector = ((angle / (Math.PI * 2)) + 1) * SPIKES;
  const index = Math.floor(sector);
  const frac = sector - index;
  const centered = Math.abs(frac - 0.5) * 2;
  const h1 = hash(index);
  const h2 = hash(index + 91.3);
  const h3 = hash(index + 777.7);
  const hero = h2 > 0.74 ? 2.4 : h2 > 0.5 ? 1.25 : 0.75;
  const width = 0.032 + 0.055 * h1;
  const lenOut = 0.27 * (0.5 + 0.95 * h2) * hero;
  const lenIn = 0.15 * (0.35 + 0.8 * h3);
  // O raio é uma cunha: fino no anel, abrindo para fora/dentro conforme afasta.
  const span = d / (r >= radius ? lenOut : lenIn);
  const widthAt = width * (1 + 2.4 * span);
  const spike = Math.max(0, 1 - centered / widthAt);
  const spikeShape = spike * spike * (3 - 2 * spike);
  const fall = Math.exp(-Math.pow(span, 2.1));
  const brightness = 0.3 + 1.5 * h2 * (h1 > 0.45 ? 1 : 0.78);
  const ray = spikeShape * fall * brightness;

  const body = ring + ray * 0.9;
  // Miolo vazio: nada dentro de ~0.3 do raio.
  const hole = smoothstepLocal(0.17, 0.34, r);
  // Nada de raio comprido até a borda do sprite: o estouro vive em volta do anel.
  const reach = smoothstepLocal(1.02, 0.86, r) + 0.25;
  const alpha = clamp((body + halo * 0.5) * reach, 0, 1) * hole;
  if (alpha <= 0.0005) return [0, 0, 0, 0];

  const t = clamp(body, 0, 1);
  let color = [mix(DEEP[0], GLOW[0], clamp(t * 1.6, 0, 1)), mix(DEEP[1], GLOW[1], clamp(t * 1.6, 0, 1)), mix(DEEP[2], GLOW[2], clamp(t * 1.6, 0, 1))];
  // Ponta do raio puxa para o azul profundo; o anel estoura em branco.
  const tip = clamp(span * 0.9, 0, 1) * (1 - clamp(ring * 1.4, 0, 1));
  color = [mix(color[0], DEEP[0], tip * 0.7), mix(color[1], DEEP[1], tip * 0.7), mix(color[2], DEEP[2], tip * 0.7)];
  // Alguns raios estouram em branco puro, como na referência.
  const white = clamp(ring * 1.3 + ray * (0.45 + 0.5 * h2) - 0.15, 0, 1);
  color = [mix(color[0], CORE[0], white), mix(color[1], CORE[1], white), mix(color[2], CORE[2], white)];
  return [color[0], color[1], color[2], alpha];
}

function smoothstepLocal(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- raster
const rgb = Buffer.alloc(size * size * 3);
const bg = background === 'dark' ? [10, 12, 20] : [255, 255, 255];
for (let py = 0; py < size; py += 1) {
  for (let px = 0; px < size; px += 1) {
    const x = ((px + 0.5) / size) * 2 - 1;
    const y = 1 - ((py + 0.5) / size) * 2;
    const [r, g, b, a] = sample(x, y);
    const offset = (py * size + px) * 3;
    rgb[offset] = Math.round(clamp(bg[0] * (1 - a) + r * 255 * a, 0, 255));
    rgb[offset + 1] = Math.round(clamp(bg[1] * (1 - a) + g * 255 * a, 0, 255));
    rgb[offset + 2] = Math.round(clamp(bg[2] * (1 - a) + b * 255 * a, 0, 255));
  }
}

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

const raw = Buffer.alloc(size * (size * 3 + 1));
for (let py = 0; py < size; py += 1) {
  raw[py * (size * 3 + 1)] = 0;
  rgb.copy(raw, py * (size * 3 + 1) + 1, py * size * 3, (py + 1) * size * 3);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, png);
console.log(`Anel gravado em ${output} (${size}x${size}, fundo ${background})`);
