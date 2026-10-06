#!/usr/bin/env node
/**
 * Prints do laboratório do Dragão das Marés (`dragao-teste.html`) quadro a
 * quadro, sem depender do navegador do usuário.
 *
 * O relógio da página é falso: cada passo avançado é 1/60 s, então o mesmo
 * quadro sai igual em qualquer máquina — é assim que dá para comparar o efeito
 * antes/depois de mexer no shader ou na geometria.
 *
 * Dependências (não estão no package.json — instale só quando for usar):
 *   npm i --no-save puppeteer @sparticuz/chromium
 *
 * Uso: node tools/shot-dragao.mjs [pasta] [largura] [altura] [modo] [passos] [view]
 *   node tools/shot-dragao.mjs /tmp/dragao 1280 720 strike "20,40,60,80" game
 *   node tools/shot-dragao.mjs /tmp/dragao 1280 720 charge "30,60" side
 */
import puppeteer from 'puppeteer';
import sparticuz from '@sparticuz/chromium';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { brotliDecompressSync } from 'node:zlib';

// Bibliotecas NSS/NSPR que o Chromium do @sparticuz/chromium espera do sistema.
const nssLibDir = '/tmp/al2023/lib';
if (!existsSync(nssLibDir)) {
  const require = createRequire(import.meta.url);
  const binDir = join(dirname(require.resolve('@sparticuz/chromium')), '..', 'bin');
  const tarPath = '/tmp/al2023.tar';
  writeFileSync(tarPath, brotliDecompressSync(readFileSync(`${binDir}/al2023.tar.br`)));
  mkdirSync('/tmp/al2023', { recursive: true });
  execFileSync('tar', ['-xf', tarPath, '-C', '/tmp/al2023']);
}

const executablePath = await sparticuz.executablePath();
process.env.LD_LIBRARY_PATH = [nssLibDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');

const outDir = process.argv[2] ?? '/tmp/dragao';
const width = Number(process.argv[3] ?? 1280);
const height = Number(process.argv[4] ?? 720);
const mode = process.argv[5] ?? 'strike';
const steps = (process.argv[6] ?? '20,45,70,95,120,150,180')
  .split(',')
  .map(Number);
const view = process.argv[7] ?? 'game';
const cropArg = (process.argv[8] ?? process.env.CROP ?? '')
  .split(',')
  .filter(Boolean)
  .map(Number);
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  executablePath,
  args: [
    ...sparticuz.args,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });
page.on('pageerror', (error) => console.log('PAGEERROR:', error.message));
page.on('console', (message) => {
  if (message.type() === 'error') console.log('CONSOLE-ERROR:', message.text());
});

const base = `http://localhost:5173/dragao-teste.html?w=${width}&h=${height}&mode=${mode}&view=${view}`;
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__labReady === true, { timeout: 60000 });
// As texturas entram por HTTP: sem esperar, o primeiro print sai quase preto.
await page.waitForFunction(() => window.__lab.texturesReady(), { timeout: 60000 });
// Aquece os shaders e deixa a primeira carga assentar antes do primeiro print.
await page.evaluate(() => {
  for (let index = 0; index < 30; index += 1) window.__lab.step(1 / 60);
  window.__lab.reset();
});

let current = 0;
for (const target of steps) {
  await page.evaluate((count) => {
    for (let index = 0; index < count; index += 1) window.__lab.step(1 / 60);
  }, target - current);
  current = target;
  const name = `${outDir}/${mode}-${view}-s${String(target).padStart(3, '0')}.png`;
  const clip = cropArg.length === 4
    ? { x: cropArg[0], y: cropArg[1], width: cropArg[2], height: cropArg[3] }
    : undefined;
  await page.screenshot({ path: name, ...(clip ? { clip } : {}) });
  console.log(name);
}
console.log('estado final:', JSON.stringify(await page.evaluate(() => window.__lab.state())));
await browser.close();
