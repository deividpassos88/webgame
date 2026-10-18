#!/usr/bin/env node
/**
 * Mede a referência por máscaras de cor + componentes conexos.
 * Uso: node tools/analyze-ref.mjs [arquivo.txt] [--json]
 * Gera a listagem de texto via `convert img -depth 8 txt:`.
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2] || '/tmp/ref1.txt';
const lines = readFileSync(file, 'utf8').split('\n');
const m = lines[0].match(/(\d+),(\d+)/);
const W = Number(m[1]);
const H = Number(m[2]);
const px = new Uint8ClampedArray(W * H * 3);
for (let i = 1; i < lines.length; i++) {
  const l = lines[i];
  const p = l.indexOf(':');
  if (p < 0) continue;
  const [x, y] = l.slice(0, p).split(',').map(Number);
  const q1 = l.indexOf('(', p);
  const q2 = l.indexOf(')', q1);
  const [r, g, b] = l.slice(q1 + 1, q2).split(',').map(Number);
  const o = (y * W + x) * 3;
  px[o] = r; px[o + 1] = g; px[o + 2] = b;
}

export const masks = {
  gold: (r, g, b) => r > 140 && r - b > 40 && g - b > 22 && r - g < 75,
  blue: (r, g, b) => b - r > 45 && b > 95,
  dark: (r, g, b) => r < 105 && g < 105 && b < 115,
};

export function components(mask, { minArea = 200, box = null } = {}) {
  const [x0, y0, x1, y1] = box ?? [0, 0, W, H];
  const seen = new Uint8Array(W * H);
  const out = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      if (seen[i]) continue;
      const o = i * 3;
      if (!mask(px[o], px[o + 1], px[o + 2])) continue;
      let n = 0, sx = 0, sy = 0;
      let ax = x, ay = y, bx = x, by = y;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const j = stack.pop();
        const jx = j % W;
        const jy = (j - jx) / W;
        n++; sx += jx; sy += jy;
        if (jx < ax) ax = jx; if (jx > bx) bx = jx;
        if (jy < ay) ay = jy; if (jy > by) by = jy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = jx + dx, ny = jy + dy;
          if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
          const k = ny * W + nx;
          if (seen[k]) continue;
          const ko = k * 3;
          if (!mask(px[ko], px[ko + 1], px[ko + 2])) continue;
          seen[k] = 1;
          stack.push(k);
        }
      }
      if (n >= minArea) out.push({ n, x: ax, y: ay, w: bx - ax + 1, h: by - ay + 1, cx: +(sx / n).toFixed(1), cy: +(sy / n).toFixed(1) });
    }
  }
  return out.sort((a, b) => b.n - a.n);
}

export function rowProfile(mask, y, x0 = 0, x1 = W) {
  const runs = [];
  let start = -1;
  for (let x = x0; x <= x1; x++) {
    const on = x < x1 && (() => { const o = (y * W + x) * 3; return mask(px[o], px[o + 1], px[o + 2]); })();
    if (on && start < 0) start = x;
    if (!on && start >= 0) { runs.push([start, x - 1]); start = -1; }
  }
  return runs;
}

export function colProfile(mask, x, y0 = 0, y1 = H) {
  const runs = [];
  let start = -1;
  for (let y = y0; y <= y1; y++) {
    const on = y < y1 && (() => { const o = (y * W + x) * 3; return mask(px[o], px[o + 1], px[o + 2]); })();
    if (on && start < 0) start = y;
    if (!on && start >= 0) { runs.push([start, y - 1]); start = -1; }
  }
  return runs;
}

export function sample(x, y) {
  const o = (y * W + x) * 3;
  return [px[o], px[o + 1], px[o + 2]];
}

export { W, H };

if (import.meta.url === `file://${process.argv[1]}`) {
  const gold = masks.gold, blue = masks.blue;
  console.log('== OURO: componentes grandes (moldura do piso / medalhão) ==');
  for (const c of components(gold, { minArea: 4000 }).slice(0, 12)) console.log(JSON.stringify(c));
  console.log('== OURO no miolo do medalhão (x 380-900, y 430-700) ==');
  for (const c of components(gold, { minArea: 120, box: [380, 430, 900, 700] }).slice(0, 20)) console.log(JSON.stringify(c));
  console.log('== AZUL: bandeiras / gemas ==');
  for (const c of components(blue, { minArea: 2500 }).slice(0, 16)) console.log(JSON.stringify(c));
  console.log('== MULTIDÃO (escuro) ==');
  for (const c of components((r, g, b) => r < 120 && g < 115 && b < 130, { minArea: 1500 }).slice(0, 8)) console.log(JSON.stringify(c));
  console.log('== PERFIL de ouro na linha y=880 (aresta frontal) ==');
  console.log(JSON.stringify(rowProfile(gold, 880)));
  console.log('== PERFIL de ouro na coluna x=628 (eixo central) ==');
  console.log(JSON.stringify(colProfile(gold, 628)));
  console.log('== PERFIL de ouro na linha y=545 (centro do medalhão) ==');
  console.log(JSON.stringify(rowProfile(gold, 545, 350, 950)));
  console.log('== PERFIL de ouro na coluna x=400 (lateral do medalhão) ==');
  console.log(JSON.stringify(colProfile(gold, 400, 430, 700)));
  console.log('== amostras ==');
  for (const [x, y, name] of [[627, 900, 'fita ouro frontal'], [200, 880, 'aresta esq'], [627, 700, 'piso abaixo do medalhão'], [627, 640, 'anel de pedra'], [100, 200, 'multidão esq'], [80, 500, 'céu esq'], [627, 300, 'céu centro'], [260, 1000, 'bandeira baixo'], [70, 250, 'coluna tribuna'], [560, 470, 'piso topo centro']]) {
    console.log(`${name} (${x},${y}) = ${sample(x, y).join(',')}`);
  }
}
