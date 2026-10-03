#!/usr/bin/env node
/**
 * Tira prints do laboratório (`maga-teste.html`) quadro a quadro, sem depender
 * do navegador do usuário. É assim que dá para conferir o desenho do efeito
 * antes de pedir uma confirmação na tela.
 *
 * O relógio da página e o `requestAnimationFrame` são falsos: cada `step`
 * avançado é 1/60 s, então o quadro do impacto é sempre o mesmo.
 *
 * Dependências (não estão no package.json — instale só quando for usar):
 *   npm i --no-save puppeteer @sparticuz/chromium
 * Neste sandbox o download do Chrome do puppeteer é bloqueado; o
 * `@sparticuz/chromium` (que vem do npm) faz o papel dele e o script extrai as
 * bibliotecas NSS/NSPR que faltam (`al2023.tar.br`) para /tmp/al2023/lib.
 *
 * Uso: node tools/shot-lab.mjs [pasta] [largura] [altura] [passos] [side]
 *   node tools/shot-lab.mjs /tmp/shots 1280 720 "40,43,46"
 *   node tools/shot-lab.mjs /tmp/shots 1280 720 "43" side
 */
import puppeteer from 'puppeteer';
import sparticuz from '@sparticuz/chromium';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { brotliDecompressSync } from 'node:zlib';

// Bibliotecas NSS/NSPR que o Chromium do @sparticuz/chromium espera do sistema:
// o pacote traz tudo em `al2023.tar.br`, mas só extrai no Amazon Linux.
const nssLibDir = '/tmp/al2023/lib';
if (!existsSync(nssLibDir)) {
  const require = createRequire(import.meta.url);
  const binDir = require.resolve('@sparticuz/chromium/package.json') + '/../bin';
  const tarPath = '/tmp/al2023.tar';
  writeFileSync(tarPath, brotliDecompressSync(readFileSync(`${binDir}/al2023.tar.br`)));
  mkdirSync('/tmp/al2023', { recursive: true });
  execFileSync('tar', ['-xf', tarPath, '-C', '/tmp/al2023']);
}

const executablePath = await sparticuz.executablePath();
process.env.LD_LIBRARY_PATH = [nssLibDir, process.env.LD_LIBRARY_PATH]
  .filter(Boolean)
  .join(':');

const outDir = process.argv[2] ?? '/tmp/shots';
const width = Number(process.argv[3] ?? 1280);
const height = Number(process.argv[4] ?? 720);
const steps = (process.argv[5] ?? '20,30,40,50,55,58,61,64,67,70,75,80,90')
  .split(',')
  .map(Number);
const side = process.argv[6] === 'side';
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  executablePath,
  args: [...sparticuz.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

// Relógio e rAF sob controle: o laboratório só anda quando eu mandar.
await page.evaluateOnNewDocument(() => {
  window.__t = 0;
  window.__queue = [];
  const realNow = performance.now.bind(performance);
  window.__realNow = () => realNow();
  performance.now = () => window.__t;
  window.requestAnimationFrame = (cb) => {
    window.__queue.push(cb);
    return window.__queue.length;
  };
  window.cancelAnimationFrame = () => {};
  window.__step = (dt) => {
    window.__t += dt * 1000;
    const queue = window.__queue;
    window.__queue = [];
    for (const cb of queue) cb(window.__t);
    return window.__queue.length;
  };
});

await page.goto('http://localhost:5173/maga-teste.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => Boolean(window.__step), { timeout: 60000 });

// O laboratório chama fireOnce() no boot: deixa o primeiro tiro terminar.
await page.evaluate(() => {
  for (let i = 0; i < 200; i += 1) window.__step(1 / 60);
});
if (side) await page.evaluate(() => document.getElementById('view').click());
const autoState = await page.evaluate(() => {
  const button = document.getElementById('auto');
  if (/ON/.test(button.textContent)) button.click();
  return button.textContent;
});
console.log('auto:', autoState);
await page.evaluate(() => {
  for (let i = 0; i < 30; i += 1) window.__step(1 / 60);
});
await page.evaluate(() => {
  for (const id of ['panel', 'hud']) document.getElementById(id).style.display = 'none';
});
await page.evaluate(() => document.getElementById('fire').click());

let current = 0;
for (const target of steps) {
  await page.evaluate((n) => {
    for (let i = 0; i < n; i += 1) window.__step(1 / 60);
  }, target - current);
  current = target;
  const name = `${outDir}/${side ? 'side' : 'game'}-s${String(target).padStart(3, '0')}.png`;
  const t0 = Date.now();
  await page.screenshot({ path: name });
  console.log(name, `${Date.now() - t0}ms`);
}
const hud = await page.evaluate(() => document.getElementById('hud-hits')?.textContent);
console.log('impactos no HUD:', hud);
await browser.close();
