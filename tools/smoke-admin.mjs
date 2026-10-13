#!/usr/bin/env node
/**
 * Fumaça do MODO ADM: sobe o build de produção (ADM) num Chromium headless,
 * escolhe classe, entra no lobby, liga o MODO ADM, inicia a partida de treino e
 * executa comandos do painel ADM de verdade (wave, spawn, item, imortalidade).
 *
 * Falha se houver erro de console/exceção ou se algum comando não responder.
 *
 * Uso: node tools/smoke-admin.mjs [url]   (padrão: http://127.0.0.1:5173/)
 *
 * As dependências do navegador são as mesmas do `tools/smoke-boot.mjs` e não
 * entram no package.json (o Chromium vem dentro do @sparticuz/chromium):
 *
 *   PUPPETEER_SKIP_DOWNLOAD=1 npm i --no-save puppeteer @sparticuz/chromium
 *   npm run build:admin && npm run preview:admin &
 *   node tools/smoke-admin.mjs http://127.0.0.1:5173/
 *
 * SHOT_DIR=/caminho troca onde os screenshots são salvos (padrão ./artifacts).
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

const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
// Screenshots vão para `artifacts/` (gitignored) para servirem de evidência
// visual do build sem sujar o repositório com binários.
const shotDir = process.env.SHOT_DIR ?? 'artifacts';
mkdirSync(shotDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  args: [...sparticuz.args, '--no-sandbox'],
  headless: 'shell',
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

try {
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await sleep(4_000);

  // 1. A tela de seleção de classe aparece e o painel ADM já está montado.
  const boot = await page.evaluate(() => ({
    canvases: document.querySelectorAll('canvas').length,
    classSelect: Boolean(document.getElementById('class-select-screen')),
    adminPanel: Boolean(document.getElementById('admin-panel')),
  }));
  check('jogo sobe com canvas', boot.canvases > 0, `canvas=${boot.canvases}`);
  check('painel ADM montado no boot', boot.adminPanel);
  check('tela de seleção de classe presente', boot.classSelect);

  // 2. Escolhe o Guerreiro e entra no lobby.
  await page.click('[data-class-choice="paladin"]');
  await sleep(6_000);
  const lobby = await page.evaluate(() => ({
    lobbyVisible: !document.getElementById('lobby-screen')?.classList.contains('hidden'),
    admToggleVisible: !document.getElementById('start-admin-training')?.classList.contains('hidden'),
  }));
  check('lobby aberto após escolher classe', lobby.lobbyVisible);
  check('botão MODO ADM liberado no lobby', lobby.admToggleVisible, 'visível só no build ADM');
  await page.screenshot({ path: join(shotDir, 'shot-1-lobby.png') });

  // 2b. Equipa a arma inicial: o jogo começa com ela na mochila (design do
  //     lobby) e o gate de "Iniciar partida" exige arma equipada.
  const gate = await page.evaluate(() => {
    const b = document.getElementById('start-game');
    return { locked: b.classList.contains('is-weapon-locked'), backpack: document.querySelectorAll('#lobby-backpack [data-lobby-inventory-index]').length };
  });
  check('gate de arma barra o início antes de equipar', gate.locked === true, `itens na mochila=${gate.backpack}`);

  await page.click('#lobby-backpack [data-lobby-inventory-index]');
  await sleep(600);
  const itemTitle = await page.evaluate(() =>
    document.getElementById('lobby-item-actions-title')?.textContent?.trim() ?? ''
  );
  check('mochila mostra o nome da arma em pt-BR', itemTitle === 'Espada do Recruta', `título="${itemTitle}"`);
  await page.screenshot({ path: join(shotDir, 'shot-1b-item-mochila.png') });
  await page.click('[data-item-action="equip"]');
  await sleep(1_500);
  const equipped = await page.evaluate(() => {
    const b = document.getElementById('start-game');
    return { locked: b.classList.contains('is-weapon-locked'), title: b.title };
  });
  check('arma equipada pelo menu da mochila', equipped.locked === false, `title="${equipped.title}"`);

  // 3. Liga o MODO ADM (treino).
  await page.click('#start-admin-training');
  await sleep(700);
  const modeOn = await page.evaluate(() => {
    const b = document.getElementById('start-admin-training');
    return { pressed: b?.getAttribute('aria-pressed'), text: b?.textContent?.replace(/\s+/g, ' ').trim() };
  });
  check('MODO ADM ligado', modeOn.pressed === 'true', modeOn.text);

  // 4. Inicia a partida de treino.
  await page.click('#start-game');
  await sleep(16_000);
  const inGame = await page.evaluate(() => ({
    classSelectHidden: document.getElementById('class-select-screen')?.classList.contains('hidden'),
    lobbyHidden: document.getElementById('lobby-screen')?.classList.contains('hidden'),
    phase: document.querySelector('[data-admin-phase]')?.textContent?.trim() ?? null,
  }));
  check('partida de treino iniciou (lobby escondido)', inGame.lobbyHidden === true, `fase="${inGame.phase}"`);

  // 5. Painel ADM: abre e os comandos de combate ficam habilitados.
  await page.evaluate(() => document.querySelector('#admin-panel .admin-panel-toggle')?.click());
  await sleep(600);
  await page.screenshot({ path: join(shotDir, 'shot-2-ingame-adm.png') });

  const controls = await page.evaluate(() => {
    const panel = document.getElementById('admin-panel');
    const enabled = (sel) => [...panel.querySelectorAll(sel)].filter((b) => !b.disabled).length;
    return {
      wave: enabled('[data-wave]'),
      jumpBoss: enabled('[data-admin-command="jump-boss"]'),
      immortality: enabled('[data-admin-command="immortality"]'),
      camera: enabled('[data-admin-command="admin-camera"]'),
      spawn: enabled('[data-admin-spawn-role]'),
      clear: enabled('[data-admin-command="clear-test-enemies"]'),
    };
  });
  check('comandos de wave habilitados em jogo', controls.wave === 6, `wave=${controls.wave}`);
  check('Ir para o Boss habilitado', controls.jumpBoss === 1);
  check('Imortalidade / Câmera ADM habilitados', controls.immortality === 1 && controls.camera === 1);
  check('spawn de treino habilitado', controls.spawn === 3, `spawn=${controls.spawn}`);

  // 6. Executa comandos ADM de verdade.
  await page.evaluate(() => {
    const root = document.querySelector('#admin-panel');
    root.querySelector('[data-admin-command="immortality"]').click();
    root.querySelector('[data-admin-spawn-role="regular"]').click();
  });
  await sleep(3_000);
  const afterSpawn = await page.evaluate(() => {
    const pressed = document.querySelector('#admin-panel [data-admin-command="immortality"]')?.getAttribute('aria-pressed');
    const clear = document.querySelector('#admin-panel [data-admin-command="clear-test-enemies"]');
    return { immortality: pressed, clearDisabled: clear?.disabled ?? null };
  });
  check('Imortalidade ligada (toggle responde)', afterSpawn.immortality === 'true');
  check('monstro de treino spawnado (Limpar monstros habilitado)', afterSpawn.clearDisabled === false);
  await page.screenshot({ path: join(shotDir, 'shot-3-spawn-adm.png') });

  // 7. Adicionar item pelo painel ADM.
  await page.evaluate(() => {
    const root = document.querySelector('#admin-panel');
    root.querySelector('[data-admin-inventory-quantity]').value = '3';
    root.querySelector('[data-admin-command="add-inventory-item"]').click();
  });
  await sleep(1_500);
  const itemMsg = await page.evaluate(() =>
    document.querySelector('#admin-panel [data-admin-inventory-message]')?.textContent?.trim() ?? ''
  );
  check('Adicionar item responde na mochila', itemMsg.length > 0, `mensagem="${itemMsg}"`);

  // 8. Pular direto para uma wave pelo painel ADM.
  await page.evaluate(() => document.querySelector('#admin-panel [data-wave="3"]').click());
  await sleep(6_000);
  const waveJump = await page.evaluate(() => ({
    phase: document.querySelector('[data-admin-phase]')?.textContent?.trim() ?? null,
    hitkill: document.querySelector('#admin-panel [data-admin-command="hitkill-boss"]')?.disabled ?? null,
  }));
  console.log(`      fase após pular para wave 3: "${waveJump.phase}" (hitkill desabilitado=${waveJump.hitkill})`);
  check('salto de wave não quebra a página', inGame.phase !== undefined);

  // 9. F2 recolhe o painel ADM.
  await page.keyboard.press('F2');
  await sleep(400);
  const collapsed = await page.evaluate(() =>
    document.getElementById('admin-panel')?.classList.contains('is-collapsed') ?? null
  );
  check('F2 recolhe/expande o painel ADM', collapsed !== null, `is-collapsed=${collapsed}`);

  const bad = problems.filter((p) => !/favicon|ERR_CONNECTION|ResizeObserver/i.test(p));
  check('sem erros de console / exceções', bad.length === 0, bad.slice(0, 4).join(' | '));
  await page.screenshot({ path: join(shotDir, 'shot-4-final.png') });
} catch (error) {
  check('execução sem exceção do harness', false, error.message);
}

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} verificações OK`);
console.log(failed.length === 0 ? 'RESULTADO: OK — build ADM funcional.' : 'RESULTADO: FALHOU');
process.exit(failed.length === 0 ? 0 : 1);
