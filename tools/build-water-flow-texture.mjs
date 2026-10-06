#!/usr/bin/env node
/**
 * Gerador da textura de água do **Dragão das Marés**
 * (`public/vfx/mage/water-flow-refined.png`).
 *
 * Por que procedural: a versão anterior era uma imagem gerada por IA com
 * centenas de fios finos e leitosos, e o efeito no jogo virava um "novelo de
 * arame" — o oposto das faixas largas, com núcleo azul profundo e bordas
 * brancas, da referência da skill. Aqui o desenho é determinístico, então dá
 * para ajustar cada camada e reproduzir o mesmo PNG em qualquer máquina.
 *
 * Convenções que o shader (`src/vfx/water/WaterDragonMaterials.ts`) espera:
 *   - eixo X = sentido do fluxo (`along`), e a imagem **repete** nesse eixo;
 *   - eixo Y = largura da faixa (`across`), sem repetição;
 *   - RGB  = água já pintada (núcleo azul fundo -> cristas brancas);
 *   - R    = densidade/corpo (usada como massa);
 *   - G    = espuma (crista branca);
 *   - A    = opacidade (cheia no miolo da faixa, macia nas bordas).
 *
 * Todas as senoides usam frequência inteira em X, então a emenda da repetição
 * horizontal é invisível.
 *
 * Uso: node tools/build-water-flow-texture.mjs [saida.png] [largura] [altura]
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const output = resolve(process.argv[2] ?? 'public/vfx/mage/water-flow-refined.png');
const width = Number(process.argv[3] ?? 1024);
const height = Number(process.argv[4] ?? 256);

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------- paleta
// Amostrada da referência: azul-marinho profundo no corpo, azul vivo no meio
// e branco-azulado nas cristas. Nada de ciano leitoso uniforme.
const DEEP = [0.016, 0.153, 0.502];
const BODY = [0.043, 0.404, 0.878];
const VIVID = [0.153, 0.706, 1.0];
const CREST = [0.867, 0.980, 1.0];

/** Hash determinístico: mesma semente => mesma textura. */
function hash(x, y, seed) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Ruído de valor com interpolação suave; a rede em X é periódica (repete). */
function noise(u, v, cellsX, cellsY, seed) {
  const x = u * cellsX;
  const y = v * cellsY;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const iy0 = Math.max(0, Math.min(cellsY, iy));
  const iy1 = Math.max(0, Math.min(cellsY, iy + 1));
  const sx = fx * fx * (3 - 2 * fx);
  const sy = (y - iy) * (y - iy) * (3 - 2 * (y - iy));
  const wrapX = (index) => ((index % cellsX) + cellsX) % cellsX;
  const a = hash(wrapX(ix), iy0, seed);
  const b = hash(wrapX(ix + 1), iy0, seed);
  const c = hash(wrapX(ix), iy1, seed);
  const d = hash(wrapX(ix + 1), iy1, seed);
  return mix(mix(a, b, sx), mix(c, d, sx), sy);
}

/**
 * Uma "pincelada": percorre a faixa no sentido do fluxo, serpenteando, e afina
 * nas pontas. É o elemento que a referência usa para desenhar a água — traços
 * largos e poucos, não centenas de fios.
 */
function stroke(u, v, options) {
  const {
    lane, amplitude, curlFreq, curlPhase, swellFreq, swellPhase,
    thickness, seed,
  } = options;
  // Centro da pincelada: serpenteia com frequência inteira em X (o que garante
  // que a repetição horizontal feche sem emenda).
  const centre = lane
    + amplitude * Math.sin(TAU * (curlFreq * u + curlPhase))
    + amplitude * 0.38 * Math.sin(TAU * (curlFreq * 2 * u + curlPhase * 1.7 + seed));
  // Espessura: engrossa no meio do traço e afina nas pontas, sem nunca zerar
  // (senão aparece uma emenda dura na repetição horizontal).
  const swell = 0.5 + 0.5 * Math.sin(TAU * (swellFreq * u + swellPhase));
  const taper = 0.16 + 0.84 * Math.pow(swell, 1.35);
  const local = thickness * taper;
  const offset = Math.abs(v - centre) / local;
  const core = Math.exp(-offset * offset * 1.25);
  // Borda irregular, mas macia: ruído grosso demais transformava cada traço
  // numa linha pontilhada ("código de barras") quando o ribbon repetia a
  // textura 2,6x no sentido do fluxo.
  const grain = 0.86 + 0.28 * noise(u, v * 2.2, 9, 4, seed + 3.1);
  return clamp(core * grain, 0, 1);
}

/**
 * Corpo contínuo: garante massa de água entre as pinceladas, com manchas
 * escuras (azul-marinho) para a água não virar um degrade liso.
 */
function bodyMass(u, v) {
  const broad = noise(u, v, 6, 3, 11.3) * 0.5 + noise(u, v, 13, 5, 27.9) * 0.32
    + noise(u, v, 29, 9, 41.2) * 0.18;
  return clamp(0.30 + broad * 1.0, 0, 1);
}

/** Veios escuros compridos, como as sombras internas da referência. */
function darkVein(u, v) {
  const streak = noise(u, v * 2.4, 5, 4, 63.7) * 0.62 + noise(u, v * 2.4, 11, 7, 71.3) * 0.38;
  return Math.pow(clamp(1 - Math.abs(streak - 0.42) * 3.4, 0, 1), 1.8);
}

// --------------------------------------------------------------- pinceladas
// Lane ~0.5 é o meio da faixa. As cristas ficam perto das bordas superior e
// inferior, que é onde a referência desenha o branco.
const STROKES = [
  // Duas cristas nas bordas (a silhueta branca da referência) e dois filetes
  // no miolo. Poucas faixas largas: com oito traços o lençol virava um
  // emaranhado de arames finos em vez de massa de água.
  { lane: 0.17, amplitude: 0.060, curlFreq: 2, curlPhase: 0.10, swellFreq: 2, swellPhase: 0.25, thickness: 0.072, seed: 1.7, },
  { lane: 0.42, amplitude: 0.052, curlFreq: 3, curlPhase: 0.62, swellFreq: 3, swellPhase: 0.55, thickness: 0.030, seed: 4.1, },
  { lane: 0.63, amplitude: 0.048, curlFreq: 2, curlPhase: 0.88, swellFreq: 4, swellPhase: 0.41, thickness: 0.026, seed: 12.9, },
  { lane: 0.85, amplitude: 0.058, curlFreq: 3, curlPhase: 0.47, swellFreq: 2, swellPhase: 0.19, thickness: 0.066, seed: 21.8, },
];

/** Amostra a textura num ponto (u, v) em [0, 1]. Devolve [r, g, b, a] em 0..1. */
function sample(u, v) {
  // Perfil vertical: a faixa é cheia no miolo e dissolve nas bordas, para o
  // recorte do ribbon não ficar com um corte reto.
  const edge = Math.min(v, 1 - v);
  const envelope = smoothstep(0.0, 0.075, edge) * (1 - smoothstep(0.44, 0.5, edge) * 0.0);
  if (envelope <= 0.0005) return [0, 0, 0, 0];

  // Espuma = pinceladas combinadas (a maior vence: traços não brigam).
  let crest = 0;
  for (const strokeOptions of STROKES) {
    crest = Math.max(crest, stroke(u, v, strokeOptions));
  }
  const mass = bodyMass(u, v);
  const vein = darkVein(u, v);

  // O branco só existe no pico das cristas: potência alta para a espuma ficar
  // fina e vítrea em vez de cobrir a faixa inteira de leitoso.
  const foam = Math.pow(clamp(crest, 0, 1), 2.6);
  // Fio de espuma na silhueta: na referência a borda do lençol é branca.
  const rim = Math.pow(1 - smoothstep(0.0, 0.085, edge), 1.7) * 0.72;
  const highlight = clamp(foam + rim, 0, 1);

  // Profundidade: 1 no meio da faixa (núcleo azul-marinho), 0 nas bordas.
  const depth = smoothstep(0.0, 0.40, edge);

  // Cor: azul-marinho no miolo -> azul vivo perto das bordas -> branco no pico.
  let colour = [
    mix(BODY[0], DEEP[0], depth),
    mix(BODY[1], DEEP[1], depth),
    mix(BODY[2], DEEP[2], depth),
  ];
  const lift = clamp(mass * 0.4 + crest * 0.35, 0, 1) * (1 - depth * 0.55);
  colour = [
    mix(colour[0], VIVID[0], lift),
    mix(colour[1], VIVID[1], lift),
    mix(colour[2], VIVID[2], lift),
  ];
  // Veios escuros: dão as sombras internas que separam as faixas de água.
  const shade = vein * depth * 0.62 + Math.pow(1 - mass, 2) * 0.38;
  colour = [
    colour[0] * (1 - shade),
    colour[1] * (1 - shade * 0.76),
    colour[2] * (1 - shade * 0.30),
  ];
  // Crista branca por cima de tudo.
  colour = [
    mix(colour[0], CREST[0], highlight),
    mix(colour[1], CREST[1], highlight),
    mix(colour[2], CREST[2], highlight),
  ];

  // R = densidade/corpo, G = espuma. O shader lê os dois como máscaras.
  const density = clamp(mass * 0.55 + foam * 0.5 + depth * 0.25, 0, 1);
  const alpha = clamp(envelope * (0.58 + density * 0.52), 0, 1);

  return [colour[0], colour[1], colour[2], alpha];
}

// ------------------------------------------------------------------ raster
const pixels = Buffer.alloc(width * height * 4);
for (let py = 0; py < height; py += 1) {
  const v = (py + 0.5) / height;
  for (let px = 0; px < width; px += 1) {
    const u = (px + 0.5) / width;
    const [r, g, b, a] = sample(u, v);
    const offset = (py * width + px) * 4;
    pixels[offset] = Math.round(clamp(r, 0, 1) * 255);
    pixels[offset + 1] = Math.round(clamp(g, 0, 1) * 255);
    pixels[offset + 2] = Math.round(clamp(b, 0, 1) * 255);
    pixels[offset + 3] = Math.round(clamp(a, 0, 1) * 255);
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

const raw = Buffer.alloc(height * (width * 4 + 1));
for (let py = 0; py < height; py += 1) {
  raw[py * (width * 4 + 1)] = 0;
  pixels.copy(raw, py * (width * 4 + 1) + 1, py * width * 4, (py + 1) * width * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, png);
console.log(`Água do Dragão das Marés gravada em ${output} (${width}x${height})`);
