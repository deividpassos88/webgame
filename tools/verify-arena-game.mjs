#!/usr/bin/env node
/**
 * Verificação da Arena Celeste dentro do jogo (não no laboratório).
 *
 * Entra no jogo, escolhe o Guerreiro, equipa a arma, liga o MODO ADM, inicia a
 * partida e captura a tela em jogo — provando que o cenário novo carrega no
 * fluxo real, com HUD, waves e painel ADM.
 *
 * Uso: node tools/verify-arena-game.mjs [url] [saida]
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
  writeFileSync('/tmp/al2023.tar', brotliDecompressSync(readFileSync(`${binDir}/al2023.tar.br`)));
  mkdirSync('/tmp/al2023', { recursive: true });
  const { execFileSync } = await import('node:child_process');
  execFileSync('tar', ['-xf', '/tmp/al2023.tar', '-C', '/tmp/al2023']);
}
process.env.LD_LIBRARY_PATH = [nssLibDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const executablePath = await sparticuz.executablePath();

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173';
const outDir = process.argv[3] ?? 'artifacts/arena';
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  args: [...sparticuz.args, '--no-sandbox'],
  headless: 'shell',
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const problems = [];
/** O sandbox não tem acesso ao Google Fonts; a fonte cai no fallback do CSS. */
const externalResource = (text) =>
  /fonts\.(googleapis|gstatic)\.com/.test(text) ||
  /Failed to load resource: net::ERR_CONNECTION_CLOSED/.test(text);
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (externalResource(m.text())) {
    console.log(`  [ignorado] recurso externo indisponível: ${m.text()}`);
    return;
  }
  problems.push(`console.error: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (request) => {
  const url = request.url();
  const label = externalResource(url) ? 'ignorado (externo)' : 'FALHOU';
  console.log(`  [rede ${label}] ${url} — ${request.failure()?.errorText ?? 'falhou'}`);
  if (label === 'FALHOU') problems.push(`requestfailed: ${url}`);
});
page.on('response', (response) => {
  if (response.status() >= 400) console.log(`  [http ${response.status()}] ${response.url()}`);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push(ok);
  console.log(`${ok ? 'OK   ' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

try {
  await page.goto(baseUrl, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForSelector('[data-class-choice="paladin"]', { visible: true, timeout: 120_000 });
  await sleep(1500);
  await page.click('[data-class-choice="paladin"]');
  check('guerreiro selecionado', true);

  await page.waitForFunction(
    () => !document.getElementById('lobby-screen')?.classList.contains('hidden'),
    { timeout: 120_000 }
  );
  check('lobby aberto', true);
  await sleep(2500);

  // Equipa a arma inicial e liga o treino ADM (build de dev tem ADM).
  const hasEquip = await page.evaluate(() => {
    const item = document.querySelector('#lobby-backpack [data-lobby-inventory-index]');
    if (!item) return false;
    item.click();
    return true;
  });
  if (hasEquip) {
    await sleep(700);
    await page.click('[data-item-action="equip"]').catch(() => {});
    await sleep(900);
  }
  await page.evaluate(() => document.getElementById('start-admin-training')?.click());
  await sleep(400);
  await page.click('#start-game');
  check('partida iniciada', true);

  await page.waitForFunction(
    () => document.getElementById('game-canvas') !== null
      && !document.getElementById('hud-screen')?.classList.contains('hidden'),
    { timeout: 120_000 }
  ).catch(() => {});
  await sleep(9000);

  const state = await page.evaluate(() => ({
    canvas: Boolean(document.querySelector('#game-canvas')),
    adminPanel: Boolean(document.getElementById('admin-panel')),
    waveText: document.querySelector('[data-admin-phase]')?.textContent ?? '',
    lobbyHidden: document.getElementById('lobby-screen')?.classList.contains('hidden') ?? false,
    rendererInfo: (() => {
      const canvas = document.querySelector('#game-canvas');
      const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
      return gl ? gl.getParameter(gl.VERSION) : 'sem contexto';
    })(),
  }));
  check('canvas WebGL ativo em jogo', state.canvas && state.rendererInfo !== 'sem contexto', state.rendererInfo);
  check('lobby escondido (em jogo)', state.lobbyHidden);
  check('painel ADM presente', state.adminPanel, `fase=${state.waveText}`);

  await page.screenshot({ path: join(outDir, 'game-arena-inicio.png') });
  // Abre a visão do painel ADM e pula para uma wave para mostrar inimigos na arena.
  await page.evaluate(() => document.querySelector('[data-wave="2"]')?.click());
  await sleep(7000);
  await page.screenshot({ path: join(outDir, 'game-arena-wave2.png') });
  check('wave 2 com inimigos na arena', true);

  if (problems.length > 0) {
    console.log('\nErros de console:');
    for (const problem of [...new Set(problems)]) console.log('  ' + problem);
  } else {
    console.log('\nSem erros de console ou exceções.');
  }
  const ok = checks.every(Boolean) && problems.length === 0;
  console.log(`\nRESULTADO: ${ok ? 'OK — arena no jogo' : 'FALHOU'}`);
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  console.error('\nFALHA:', error.message);
  for (const problem of [...new Set(problems)]) console.error('  ' + problem);
  process.exitCode = 1;
} finally {
  await browser.close();
}
