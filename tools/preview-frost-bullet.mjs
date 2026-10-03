#!/usr/bin/env node
/**
 * Gerador de pré-visualização do sprite do projétil de gelo do ataque básico
 * da Maga.
 *
 * O shader vive em `src/vfx/VFXMaterials.ts` (`createFrostBulletMaterial`) e
 * roda na GPU. Como o sandbox não tem navegador, este script reimplementa a
 * MESMA matemática em JS, rasteriza o sprite num buffer e grava um PNG — assim
 * dá para conferir o desenho (dardo, seda, partículas, aura) sem abrir o jogo.
 *
 * Regra: qualquer mudança de desenho precisa ser feita nos dois lugares.
 *
 * Uso:  node tools/preview-frost-bullet.mjs [saida.png] [largura] [altura]
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const output = resolve(process.argv[2] ?? 'artifacts/frost-bullet-sprite.png');
const width = Number(process.argv[3] ?? 640);
const height = Number(process.argv[4] ?? 200);

/** Espelha as opções passadas em VFXConfig (preset `basic`). */
const OPTIONS = {
  // Espelha o preset `basic` de src/vfx/VFXConfig.ts + os defaults do shader.
  core: [0.965, 0.988, 1],
  glow: [0.435, 0.839, 1],
  deep: [0.122, 0.42, 1],
  opacity: 1,
  intensity: 1.45,
  headLength: 0.3,
  width: 0.2,
  wisp: 1,
  filament: 1,
  sparks: 5,
  haze: 0.35,
  seed: 0.37,
  scroll: 1,
};

// ---------------------------------------------------------------- utilidades
// MASK permite isolar termos do shader para depurar o desenho:
//   MASK=head,dardo  |  MASK=all (padrão)
const MASK = (process.env.MASK ?? 'all').split(',').map((part) => part.trim());
const pick = (name, value) => (MASK.includes('all') || MASK.includes(name) ? value : 0);

const fract = (v) => v - Math.floor(v);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

function hash(x, y) {
  let px = fract(x * 123.34);
  let py = fract(y * 456.21);
  const d = px * (px + 45.32) + py * (py + 45.32);
  px += d;
  py += d;
  return fract(px * py);
}

function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return mix(a, b, ux) + (c - a) * uy * (1 - ux) + (d - b) * ux * uy;
}

function fbm(x, y) {
  let value = 0;
  let amplitude = 0.6;
  let px = x;
  let py = y;
  for (let i = 0; i < 4; i += 1) {
    value += noise2(px, py) * amplitude;
    px = px * 2.03 + 1.7;
    py = py * 2.03 + 1.7;
    amplitude *= 0.5;
  }
  return value;
}

function seg(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / Math.max(1e-5, bax * bax + bay * bay), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h);
}

/** Porte fiel do fragment shader. */
function shade(u, v, time) {
  const x = clamp(u, 0, 1);
  const y = (v - 0.5) * 2;
  const t = time * OPTIONS.scroll;
  const headStart = clamp(1 - OPTIONS.headLength, 0, 1);
  const halfWidthAt = (back) => Math.max(1e-4, OPTIONS.width * Math.pow(clamp(back, 0, 1), 0.78));
  const halfWidthAtNeck = () => Math.max(1e-4, OPTIONS.width);

  // ---- cauda ---------------------------------------------------------------
  const back = clamp(x / Math.max(1e-4, headStart), 0, 1.18);
  const taper = clamp(back, 0, 1);
  const halfWidth = halfWidthAt(taper);
  const lengthFade = smoothstep(0, 0.2, taper) * Math.pow(taper, 0.42);
  const bend = Math.sin(x * 3.6 - t * 1.5 + OPTIONS.seed * 6.3) * 0.055 * OPTIONS.wisp * (1 - back);
  const tail = y - bend;
  const across = Math.abs(tail) / halfWidth;
  const silkNoise = fbm(x * 6 - t * 0.5, tail * 3 + t * 0.1);
  const tailMask = 1 - smoothstep(0.78, 1.1, back);

  const body = (1 - smoothstep(0.35, 1, across)) * 0.07 * (0.45 + 0.55 * silkNoise)
    * lengthFade * tailMask;
  const ribbonEdge = (1 - smoothstep(0, 0.1, Math.abs(across - 1))) * 0.3 * lengthFade * tailMask;

  let streaks = 0;
  for (let i = 0; i < 4; i += 1) {
    const fi = i;
    const lane = (fi - 1.5) * 0.44;
    const wave = Math.sin(x * (5.5 + fi * 1.9) - t * 2.1 + fi * 1.7) * 0.5 * OPTIONS.wisp;
    const pos = lane * 1.35 + wave * (0.3 + 0.7 * back);
    const line = 1 - smoothstep(0, 0.07, Math.abs(across - pos));
    streaks += line * (0.35 + 0.65 * back) * (0.5 + 0.5 * silkNoise);
  }
  streaks *= OPTIONS.filament * lengthFade * 0.45 * tailMask;

  const centerLine = (1 - smoothstep(0, 0.05 + 0.03 * (1 - back), Math.abs(tail)))
    * Math.pow(back, 1.25) * 0.36 * OPTIONS.filament * tailMask;

  // ---- dardo ---------------------------------------------------------------
  const HEAD_SPAN = 0.82;
  const hxRaw = (x - headStart) / Math.max(1e-4, OPTIONS.headLength);
  const hx = clamp(hxRaw / HEAD_SPAN, 0, 1);
  const flare = mix(1, 1.6, smoothstep(0, 0.32, hx));
  const hv = (y - bend * 0.15) / (halfWidthAtNeck() * flare);
  const profile = Math.pow(clamp(1 - hx, 0, 1), 0.66);
  const inHead = (hxRaw >= 0 ? 1 : 0) * (1 - smoothstep(HEAD_SPAN, HEAD_SPAN + 0.12, hxRaw))
    * smoothstep(0, 0.05, x - headStart);

  const fillInner = profile * 0.92;
  const fillOuter = Math.max(fillInner + 1e-4, profile * 1.02);
  const fill = (1 - smoothstep(fillInner, fillOuter, Math.abs(hv)))
    * 0.32 * (0.82 + 0.18 * silkNoise) * smoothstep(0, 0.1, hx);
  const rim = (1 - smoothstep(0, 0.055, Math.abs(Math.abs(hv) - profile))) * 1;
  const chevron = 1 - smoothstep(0, 0.05, Math.min(
    seg(hx, hv, 0.08, 0.52, 0.58, 0),
    seg(hx, hv, 0.08, -0.52, 0.58, 0)
  ));
  const nose = 1 - smoothstep(0, 0.3, Math.hypot((hx - 0.78) * 1.15, hv * 0.9));
  const head = (fill + rim + chevron * 0.6 + nose * 0.75) * inHead;

  // ---- aura e gelo ---------------------------------------------------------
  const auraX = (x - headStart - 0.04) * 1.25;
  const aura = Math.exp(-(auraX * auraX + (y * 2.4) * (y * 2.4)) * 3) * OPTIONS.haze;
  const washX = (x - 0.45) * 1.6;
  const wash = Math.exp(-(washX * washX + (tail * 2.6) * (tail * 2.6)) * 3.4)
    * OPTIONS.haze * 0.22 * lengthFade;

  let sparks = 0;
  for (let i = 0; i < 6; i += 1) {
    if (i < OPTIONS.sparks) {
      const fi = i;
      const sx = fract(Math.sin(fi * 12.9898 + OPTIONS.seed * 7.31) * 43758.5453);
      const sy = fract(Math.sin(fi * 43.123 + OPTIONS.seed * 3.17) * 24634.6345) * 2 - 1;
      const side = sy < 0 ? -1 : 1;
      const sparkX = 0.12 + sx * 0.72;
      const localWidth = halfWidthAt(sparkX / Math.max(1e-4, headStart));
      const sparkY = side * (localWidth * (1.35 + 0.75 * Math.abs(sy)) + 0.05);
      const twinkle = 0.55 + 0.45 * Math.sin(time * 6 + fi * 2.4);
      const size = 0.022 + 0.018 * fract(fi * 5.7 + OPTIONS.seed);
      const d = Math.hypot(x - sparkX, (y - sparkY) * 0.65);
      sparks += (1 - smoothstep(0, size, d)) * twinkle;
    }
  }

  const sum = pick('tail', body) + pick('edge', ribbonEdge) + pick('streaks', streaks)
    + pick('center', centerLine) + pick('head', head) + pick('aura', aura)
    + pick('wash', wash) + pick('sparks', sparks);
  if (sum <= 0.004) return null;
  const coreWeight = clamp(chevron * 0.5 + nose * 0.85 + rim * 0.55 + sparks * 1.5, 0, 1);
  const mixSum = clamp(sum * 0.95, 0, 1);
  const color = [0, 1, 2].map((channel) => {
    const base = mix(OPTIONS.deep[channel], OPTIONS.glow[channel], mixSum);
    return mix(base, OPTIONS.core[channel], coreWeight) * OPTIONS.intensity;
  });
  return { color, alpha: clamp(sum, 0, 1) * OPTIONS.opacity };
}

// ---------------------------------------------------------------- raster
const background = [0.043, 0.055, 0.078];
const rgb = Buffer.alloc(width * height * 3);
for (let py = 0; py < height; py += 1) {
  const v = 1 - (py + 0.5) / height;
  for (let px = 0; px < width; px += 1) {
    const u = (px + 0.5) / width;
    const shaded = shade(u, v, 0.35);
    const offset = (py * width + px) * 3;
    for (let channel = 0; channel < 3; channel += 1) {
      // blending aditivo: src.rgb * src.a + dst
      const value = shaded
        ? background[channel] * 255 + shaded.color[channel] * shaded.alpha * 255
        : background[channel] * 255;
      rgb[offset + channel] = Math.max(0, Math.min(255, Math.round(value)));
    }
  }
}

// ---------------------------------------------------------------- PNG
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

const raw = Buffer.alloc(height * (width * 3 + 1));
for (let py = 0; py < height; py += 1) {
  raw[py * (width * 3 + 1)] = 0;
  rgb.copy(raw, py * (width * 3 + 1) + 1, py * width * 3, (py + 1) * width * 3);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
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
console.log(`Sprite gravado em ${output} (${width}x${height})`);
