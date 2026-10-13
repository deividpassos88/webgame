#!/usr/bin/env node
/**
 * Verificação do boss final no navegador: pula direto para a batalha final pelo
 * painel ADM e observa as skills (círculo, retângulo e meteoro) e a HUD de 5
 * barras — o objetivo é confirmar que o ajuste de dano/alcance não quebrou nada
 * e que o boss não fica em pose-T ao soltar o meteoro.
 *
 * Uso: node tools/verify-boss.mjs [url] [segundos]
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
const observeSeconds = Number(process.argv[3] ?? 75);
const shotDir = process.env.SHOT_DIR ?? 'artifacts';
mkdirSync(shotDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  args: [...sparticuz.args, '--no-sandbox'],
  headless: 'shell',
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const problems = [];
const skillLogs = [];
page.on('console', (m) => {
  const text = m.text();
  if (m.type() === 'error') problems.push(`console.error: ${text}`);
  if (text.includes('Boss:Skill')) skillLogs.push(text.slice(0, 160));
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const readHud = () => page.evaluate(() => ({
  bossVisible: !document.getElementById('boss-health-container')?.classList.contains('hidden'),
  bars: document.getElementById('boss-health-label')?.textContent?.trim() ?? '',
  bossFill: document.getElementById('boss-health-fill')?.style.width ?? '',
  bossColor: document.getElementById('boss-health-fill')?.style.background ?? '',
  playerHp: document.getElementById('player-health-text')?.textContent?.trim() ?? '',
}));

try {
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await sleep(4_000);
  await page.click('[data-class-choice="paladin"]');
  await sleep(7_000);
  await page.click('#lobby-backpack [data-lobby-inventory-index]');
  await sleep(500);
  await page.click('[data-item-action="equip"]');
  await sleep(1_200);
  await page.click('#start-admin-training');
  await sleep(500);
  await page.click('#start-game');
  await sleep(14_000);

  // Pula direto para a batalha final.
  await page.evaluate(() => document.querySelector('#admin-panel [data-admin-command="jump-boss"]')?.click());
  await sleep(12_000);
  const start = await readHud();
  check('boss final spawnado', start.bossVisible === true, `barras="${start.bars}" cor=${start.bossColor}`);
  check('HUD do boss começa em 5x', start.bars === '5x', `rótulo="${start.bars}"`);
  check('primeira barra é a verde', start.bossColor.includes('22, 163, 74') || start.bossColor.includes('#16a34a'), start.bossColor);
  await page.screenshot({ path: join(shotDir, 'boss-1-spawn.png') });

  // Fica parado no meio para os meteoros aterrissarem em cima do player.
  console.log(`\nObservando ${observeSeconds}s de skills do boss...`);
  let lowestHp = 100;
  const seen = new Set();
  for (let elapsed = 0; elapsed < observeSeconds; elapsed += 5) {
    await sleep(5_000);
    const hud = await readHud();
    const hp = Number(hud.playerHp.replace('%', ''));
    if (Number.isFinite(hp) && hp < lowestHp) lowestHp = hp;
    // O Logger escreve com `%c`, então o texto do console não começa limpo:
    // procura o par "skill: evento" em qualquer posição da linha.
    for (const log of skillLogs) {
      const match = /(circle|rectangle|meteors):\s*(aviso iniciado|impacto)/.exec(log);
      if (match) seen.add(`${match[1]}:${match[2] === 'impacto' ? 'impacto' : 'aviso'}`);
    }
    if (elapsed % 15 === 0) console.log(`  t=${elapsed + 5}s hp=${hud.playerHp} barras=${hud.bars}`);
  }

  await page.screenshot({ path: join(shotDir, 'boss-2-skills.png') });
  console.log('\nSkills registradas no log:');
  for (const skill of [...seen].sort()) console.log(`  ${skill}`);

  check('o boss soltou o meteoro', [...seen].some((s) => s.startsWith('meteors')), [...seen].filter((s) => s.startsWith('meteors')).join(', ') || 'nenhum');
  check('meteoro causou dano no player parado', lowestHp < 100, `menor HP observado: ${lowestHp}%`);
  check('boss completa os impactos sem travar', [...seen].some((s) => s.endsWith(':impacto')));
  const bad = problems.filter((p) => !/favicon|ERR_CONNECTION|ResizeObserver/i.test(p));
  check('sem erros de console / exceções', bad.length === 0, bad.slice(0, 3).join(' | '));
} catch (error) {
  check('execução sem exceção do harness', false, error.message);
}

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} verificações OK`);
process.exit(failed.length === 0 ? 0 : 1);
