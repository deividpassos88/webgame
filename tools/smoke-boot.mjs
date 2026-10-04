#!/usr/bin/env node
/**
 * Fumaça de navegador: carrega páginas do jogo no Chromium headless e falha se
 * houver erro de console/exceção. Usado depois de mexer no `Game.ts` para
 * garantir que o jogo ainda sobe (imports, tipos e caminho de ataque básico).
 *
 * Uso: node tools/smoke-boot.mjs [url...]
 */
import puppeteer from 'puppeteer';
import sparticuz from '@sparticuz/chromium';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { brotliDecompressSync } from 'node:zlib';

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

const urls = process.argv.slice(2);
if (urls.length === 0) urls.push('http://0.0.0.0:5173/', 'http://0.0.0.0:5173/maga-teste.html');

const browser = await puppeteer.launch({
  executablePath,
  args: sparticuz.args,
  headless: 'shell',
});

let failed = false;
for (const url of urls) {
  const page = await browser.newPage();
  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    const title = await page.title();
    const canvases = await page.$$eval('canvas', (nodes) => nodes.length);
    const bad = problems.filter((p) => !/favicon|ERR_CONNECTION|ResizeObserver/i.test(p));
    const status = bad.length === 0 && canvases > 0 ? 'ok' : 'FALHOU';
    if (status === 'FALHOU') failed = true;
    console.log(`[${status}] ${url} — "${title}" canvas=${canvases}`);
    for (const problem of bad.slice(0, 6)) console.log(`    ${problem}`);
  } catch (error) {
    failed = true;
    console.log(`[FALHOU] ${url} — ${error.message}`);
  }
  await page.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
