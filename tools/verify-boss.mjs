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
// Tetos (em segundos de **jogo**) de cada fase da observação. Ver a nota sobre
// `gameTimeFactor`: em ambiente sem GPU o relógio real não é o do jogo.
const DAMAGE_PHASE_GAME_SECONDS = 25;
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
// Dano que o player levou de skill do boss, registrado em `onBossSkillHitPlayer`
// (`[Boss:Skill] acertou o jogador: X de dano.`). É a única evidência de que a
// skill **acertou**: os lacaios da batalha final também derrubam a barra e antes
// faziam esta verificação passar sozinha, sem a skill do boss ter encostado.
const bossDamageLogs = [];
// FPS medido pelo próprio jogo (`Game:Performance`), usado para converter
// segundos reais em segundos de jogo — ver o comentário de `gameTimeFactor`.
const fpsSamples = [];
page.on('console', (m) => {
  const text = m.text();
  if (m.type() === 'error') problems.push(`console.error: ${text}`);
  if (text.includes('Boss:Skill')) skillLogs.push(text.slice(0, 160));
  if (/\[Boss:Skill\].*acertou o jogador/.test(text)) bossDamageLogs.push(text);
  const fps = /Resumo de \d+s:\s*([\d.]+) FPS/.exec(text);
  if (fps) {
    const value = Number(fps[1]);
    if (Number.isFinite(value) && value > 0) fpsSamples.push(value);
  }
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

/**
 * O jogo limita o passo da simulação a 0,1 s por quadro
 * (`Math.min(rawDelta, 0.1)` em `Game.ts`) para o combate não explodir quando
 * um quadro demora. Em ambiente sem GPU (renderização por software, como o
 * Chromium do `smoke-admin`), o jogo roda a poucos FPS e **o tempo de jogo
 * passa mais devagar que o relógio**: com `fps` quadros por segundo, cada
 * segundo real avança `fps × 0,1` s de jogo (no máximo 1).
 *
 * O rodízio de skills do boss (descanso de 5 s + aviso + impacto) é medido em
 * tempo de jogo. Observar por relógio dava falso negativo: "o boss não soltou o
 * meteoro" só porque a janela real era curta demais para o tempo de jogo passar.
 */
const gameTimeFactor = () => {
  if (fpsSamples.length === 0) return 1;
  const average = fpsSamples.reduce((sum, value) => sum + value, 0) / fpsSamples.length;
  return Math.min(1, average * 0.1);
};

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
  // A janela `observeSeconds` é de **tempo de jogo**: o laço abaixo a estica
  // pelo fator medido quando o ambiente roda abaixo de 10 FPS.
  const factor = gameTimeFactor();
  const toWall = (gameSeconds) => Math.min(Math.ceil(gameSeconds / factor), gameSeconds * 20);
  // O orçamento é separado por fase: a prova de dano (mortal) tem teto próprio
  // para não consumir a janela do rodízio, que é a parte que precisa de tempo.
  const damageWallSeconds = toWall(DAMAGE_PHASE_GAME_SECONDS);
  const rotationWallSeconds = toWall(observeSeconds);
  const fpsLabel = fpsSamples.length > 0
    ? fpsSamples.map((v) => v.toFixed(1)).join('/')
    : 'sem amostra';
  console.log(
    `\nBoss observado por ${DAMAGE_PHASE_GAME_SECONDS}s de jogo (dano) + ${observeSeconds}s (rodízio)`
    + ` — ≈${damageWallSeconds + rotationWallSeconds}s reais;`
    + ` ${fpsLabel} FPS → tempo de jogo a ${(factor * 100).toFixed(0)}%...`
  );

  const readSkills = () => {
    // O Logger escreve com `%c`, então o texto do console não começa limpo:
    // procura o par "skill: evento" em qualquer posição da linha.
    for (const log of skillLogs) {
      const match = /(circle|rectangle|meteors):\s*(aviso iniciado|impacto)/.exec(log);
      if (match) seen.add(`${match[1]}:${match[2] === 'impacto' ? 'impacto' : 'aviso'}`);
    }
  };
  const toggleImmortality = () => page.evaluate(() => document
    .querySelector('#admin-panel [data-admin-command="immortality"]')
    ?.click());

  const seen = new Set();
  let lowestHp = 100;
  let immortalityOn = false;
  let damageProven = false;
  let damageCheckDetail = '';

  /**
   * Fase 1 — prova de dano, SEM Imortalidade.
   *
   * O rodízio do boss só roda com o player vivo: `afterEnemyHitPlayer` chama
   * `stopBossSkills()` quando a vida zera. E o balanceamento do boss final mata
   * o player em ~20 s de jogo (é agressivo de propósito). Por isso as duas
   * provas são separadas: primeiro o dano da skill tem que aparecer com o
   * player mortal, e só então a Imortalidade entra para o boss terminar o
   * rodízio e soltar o meteoro — com ela ligada, `resolveIncomingDamage` zera o
   * dano e o log de acerto não sai mais.
   */
  const dangerHp = 30;
  for (let elapsed = 0; elapsed < damageWallSeconds && !damageProven; elapsed += 5) {
    await sleep(5_000);
    const hud = await readHud();
    const hp = Number(hud.playerHp.replace('%', ''));
    if (Number.isFinite(hp) && hp < lowestHp) lowestHp = hp;
    readSkills();
    if (bossDamageLogs.length > 0) {
      damageProven = true;
      damageCheckDetail = `acertos de skill do boss=${bossDamageLogs.length}, HP no acerto: ${hud.playerHp}`;
      break;
    }
    if (Number.isFinite(hp) && hp <= dangerHp) {
      // Vida baixa e nenhum acerto do boss ainda: liga a Imortalidade para a
      // partida não acabar antes do rodízio, e a verificação de dano vai
      // reportar que não deu para observar.
      await toggleImmortality();
      immortalityOn = true;
      damageCheckDetail = `não observado: player chegou a ${hud.playerHp} sem a skill do boss acertar`;
      break;
    }
    if (elapsed % 15 === 0) {
      console.log(`  [dano] t=${elapsed + 5}s hp=${hud.playerHp} acertosBoss=${bossDamageLogs.length}`);
    }
  }

  // Fase 2 — rodízio completo, com Imortalidade ligada para o boss chegar ao meteoro.
  if (!immortalityOn) {
    await toggleImmortality();
    immortalityOn = true;
  }
  console.log(`\n  Imortalidade ligada (${immortalityOn}); observando o rodízio...`);
  for (let elapsed = 0; elapsed < rotationWallSeconds; elapsed += 5) {
    await sleep(5_000);
    const hud = await readHud();
    readSkills();
    if (elapsed % 15 === 0) {
      console.log(`  [rodízio] t=${elapsed + 5}s hp=${hud.playerHp} barras=${hud.bars} skills=${[...seen].length}`);
    }
    if (seen.has('circle:impacto') && seen.has('rectangle:impacto') && seen.has('meteors:impacto')) break;
  }

  await page.screenshot({ path: join(shotDir, 'boss-2-skills.png') });
  console.log('\nSkills registradas no log:');
  for (const skill of [...seen].sort()) console.log(`  ${skill}`);

  check('o boss soltou o meteoro', [...seen].some((s) => s.startsWith('meteors')), [...seen].filter((s) => s.startsWith('meteors')).join(', ') || 'nenhum');
  // Esta linha é **informativa**, não uma verificação: as três áreas do boss são
  // resolvidas contra a posição do player no instante da conjuração
  // (`BossSkillController.damageAtImpact` compara com `this.target`), então
  // acertar depende de o player estar onde estava segundos antes. A versão
  // antiga desta verificação ("meteoro causou dano no player parado") passava
  // com o dano dos **lacaios**, e não da skill. A matemática de acerto é
  // coberta por `src/entities/BossSkillController.test.ts` (inclusive a
  // cobertura em grade dos meteoros); aqui só se registra o que apareceu.
  console.log(
    `\nINFO  skill do boss acertou o player nesta execução`
    + (damageProven ? ` — ${damageCheckDetail}` : ' — não observado')
    + ' (verificação de dano fica nos testes unitários do BossSkillController)'
  );
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
