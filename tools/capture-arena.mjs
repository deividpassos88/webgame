#!/usr/bin/env node
/**
 * Captura de QA da Arena Celeste.
 *
 * Abre o laboratório em Chromium headless (SwiftShader), posiciona nas câmeras
 * calibradas para as duas referências e salva PNGs 1254 × 1254 sem interface.
 * Também falha se houver erro de console/exceção.
 *
 * Uso: node tools/capture-arena.mjs [url] [saida]
 *   url    padrão http://127.0.0.1:5173
 *   saida  padrão docs/arena-celeste/qa
 *
 * Dependências de navegador (fora do package.json):
 *   PUPPETEER_SKIP_DOWNLOAD=1 npm i --no-save puppeteer @sparticuz/chromium
 */
import puppeteer from 'puppeteer';
import sparticuz from '@sparticuz/chromium';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';

const nssLibDir = '/tmp/al2023/lib';
if (!existsSync(nssLibDir)) {
  const require = createRequire(import.meta.url);
  const binDir = join(dirname(require.resolve('@sparticuz/chromium')), '..', 'bin');
  const tarPath = '/tmp/al2023.tar';
  writeFileSync(tarPath, brotliDecompressSync(readFileSync(`${binDir}/al2023.tar.br`)));
  mkdirSync('/tmp/al2023', { recursive: true });
  const { execFileSync } = await import('node:child_process');
  execFileSync('tar', ['-xf', tarPath, '-C', '/tmp/al2023']);
}

const executablePath = await sparticuz.executablePath();
process.env.LD_LIBRARY_PATH = [nssLibDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173';
const outDir = process.argv[3] ?? 'docs/arena-celeste/qa';
mkdirSync(outDir, { recursive: true });

const cameras = process.env.ARENA_CAMERAS?.split(',') ?? ['ref1', 'ref2', 'overview'];
const browser = await puppeteer.launch({
  executablePath,
  args: [...sparticuz.args, '--no-sandbox'],
  headless: 'shell',
});
const page = await browser.newPage();
await page.setViewport({ width: 1254, height: 1254, deviceScaleFactor: 1 });

const problems = [];
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
});
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failed = false;
try {
  for (const camera of cameras) {
    const url = `${baseUrl}/arena-celeste-lab.html?ui=0&shot=1&bloom=${process.env.BLOOM ?? '1'}&camera=${camera}&t=${process.env.T ?? '2.5'}`;
    console.log(`\n→ ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForFunction('window.__arenaReady === true', { timeout: 90_000 });
    await sleep(Number(process.env.WAIT ?? 4500));

    const info = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return {
        width: canvas?.width ?? 0,
        height: canvas?.height ?? 0,
        errors: document.getElementById('errors')?.textContent?.trim() ?? '',
        calls: document.getElementById('calls')?.textContent ?? '?',
        tris: document.getElementById('tris')?.textContent ?? '?',
        fps: document.getElementById('fps')?.textContent ?? '?',
      };
    });
    if (!info.width || !info.height) throw new Error(`Canvas vazio na câmera ${camera}.`);
    if (info.errors) throw new Error(`Erros na página (${camera}):\n${info.errors}`);

    const file = join(outDir, `arena-${camera}.png`);
    await page.screenshot({ path: file, type: 'png' });
    console.log(
      `  OK ${file} · ${info.width}×${info.height} · calls=${info.calls} · tris=${info.tris} · fps=${info.fps}`
    );
  }

  if (problems.length > 0) {
    failed = true;
    console.error('\nErros de console/página:');
    for (const problem of [...new Set(problems)]) console.error('  ' + problem);
  } else {
    console.log('\nSem erros de console ou exceções.');
  }
} catch (error) {
  failed = true;
  console.error('\nFALHA:', error.message);
  if (problems.length > 0) for (const problem of [...new Set(problems)]) console.error('  ' + problem);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
