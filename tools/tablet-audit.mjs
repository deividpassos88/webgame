/*
 * Responsive audit for the tablet-and-up range.
 *
 * Runs the built app (vite preview) in headless Chromium at the viewports
 * real tablets use and reports, per screen:
 *   - horizontal overflow of the document
 *   - elements sticking out of the viewport
 *   - clipped content (scroll bars inside overflow:hidden boxes)
 *   - clipped text and small tap targets
 *
 * The report is written to artifacts/tablet-audit.json (gitignored).
 *
 * It needs a headless Chromium plus puppeteer, which are NOT project
 * dependencies (they would add ~150MB to every install). To run it:
 *
 *   npm i --no-save puppeteer-core @sparticuz/chromium
 *   node -e "..."   # or: npx playwright install chromium
 *
 * With @sparticuz/chromium the browser needs the bundled Amazon Linux libs on
 * the library path:
 *
 *   LD_LIBRARY_PATH=/tmp/al2023/lib node tools/tablet-audit.mjs
 *   ONLY="retrato" LD_LIBRARY_PATH=/tmp/al2023/lib node tools/tablet-audit.mjs
 */
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:4173/';

const VIEWPORTS = [
  { name: 'iPad mini 8.3" retrato', width: 744, height: 1133 },
  { name: 'iPad mini 8.3" paisagem', width: 1133, height: 744 },
  { name: 'iPad 10.2" retrato', width: 810, height: 1080 },
  { name: 'iPad Air 10.9" retrato', width: 820, height: 1180 },
  { name: 'iPad Air 10.9" paisagem', width: 1180, height: 820 },
  { name: 'iPad Pro 11" retrato', width: 834, height: 1194 },
  { name: 'iPad Pro 11" paisagem', width: 1194, height: 834 },
  { name: 'iPad Pro 12.9" retrato', width: 1024, height: 1366 },
  { name: 'iPad Pro 12.9" paisagem', width: 1366, height: 1024 },
  { name: 'Galaxy Tab S9 retrato', width: 800, height: 1280 },
  { name: 'Galaxy Tab S9 paisagem', width: 1280, height: 800 },
  { name: 'Notebook 1366x768', width: 1366, height: 768 },
  { name: 'Desktop 1440x900', width: 1440, height: 900 },
  { name: 'Desktop 1920x1080', width: 1920, height: 1080 },
];

const IGNORED_OVERFLOW = /(^|[^a-z])(game-canvas|arena-vignette|blacksmith-scene__fallback)([^a-z]|$)/;

const auditScript = () => {
  const IGNORED = /(^|[^a-z])(game-canvas|arena-vignette|blacksmith-scene__fallback)([^a-z]|$)/;
  const visible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const label = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
      : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const doc = document.documentElement;

  const stickingOut = [];
  const clipped = [];
  const tinyTargets = [];
  const clippedText = [];

  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (style.position === 'fixed') continue;
    if (IGNORED.test(el.id + ' ' + (typeof el.className === 'string' ? el.className : ''))) continue;
    if (rect.right > vw + 1 || rect.left < -1) {
      stickingOut.push({
        el: label(el),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        overflowRight: Math.round(rect.right - vw),
        overflowLeft: Math.round(-rect.left),
      });
    }
    const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip';
    const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';
    if (clipsY && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
      clipped.push({ el: label(el), axis: 'y', scroll: el.scrollHeight, client: el.clientHeight });
    }
    if (clipsX && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      clipped.push({ el: label(el), axis: 'x', scroll: el.scrollWidth, client: el.clientWidth });
    }
    // Ellipsis truncation is intentional design, not a broken layout.
    if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && style.overflow !== 'visible'
      && style.textOverflow !== 'ellipsis') {
      clippedText.push({ el: label(el), text: (el.textContent ?? '').slice(0, 42), scroll: el.scrollWidth, client: el.clientWidth });
    }
    if (el.matches('button, [role="tab"], a[href], input, select') && (rect.height < 30 || rect.width < 30)) {
      tinyTargets.push({ el: label(el), w: Math.round(rect.width), h: Math.round(rect.height) });
    }
  }

  /*
   * Layout invariants for the lobby shell. Overflow alone is not enough: the
   * pre-arena fallback used to collapse the three-column grid into a stack
   * that still fit the viewport, so it looked "clean" while being broken.
   */
  const lobbyShell = document.querySelector('#lobby-screen');
  const lobbyLayout = lobbyShell
    ? {
        columns: getComputedStyle(lobbyShell).gridTemplateColumns,
        areas: {
          left: getComputedStyle(document.querySelector('.lobby-equipment') ?? lobbyShell).gridArea,
          stage: getComputedStyle(document.querySelector('.lobby-hero-stage') ?? lobbyShell).gridArea,
          right: getComputedStyle(document.querySelector('.lobby-detail-panel') ?? lobbyShell).gridArea,
        },
      }
    : null;
  // Track list tokenizer: `minmax(0px, 1fr)` contains a space, so a plain
  // split() would count it as two tracks.
  const tracks = (lobbyLayout?.columns ?? '').match(/(?:minmax|fit-content|repeat)\([^)]*\)|\S+/g) ?? [];
  const lobbyBroken = lobbyLayout
    ? !(tracks.length === 3
      && !tracks.some((track) => /^0(?:px)?$/.test(track))
      && lobbyLayout.areas.left === 'left'
      && lobbyLayout.areas.stage === 'stage'
      && lobbyLayout.areas.right === 'right')
    : false;

  return {
    viewport: { w: vw, h: vh },
    lobbyLayout,
    lobbyBroken,
    documentOverflow: {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      horizontal: Math.max(0, doc.scrollWidth - doc.clientWidth),
      vertical: Math.max(0, doc.scrollHeight - doc.clientHeight),
      bodyOverflowX: Math.max(0, document.body.scrollWidth - doc.clientWidth),
    },
    stickingOut: stickingOut.slice(0, 14),
    clipped: clipped.slice(0, 14),
    clippedText: clippedText.slice(0, 10),
    tinyTargets: tinyTargets.slice(0, 10),
  };
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function prepareProfile(page) {
  // First run: create a default profile, then grant a workshop license and
  // materials so the audit can reach the licensed craft catalog.
  await page.waitForFunction(
    () => !document.getElementById('class-select-screen')?.classList.contains('hidden')
      || !document.getElementById('lobby-screen')?.classList.contains('hidden'),
    { timeout: 180_000 },
  );
  const classSelectVisible = await page.evaluate(
    () => !document.getElementById('class-select-screen')?.classList.contains('hidden'),
  );
  if (classSelectVisible) {
    await page.click('#select-warrior');
    await page.waitForFunction(
      () => !document.getElementById('lobby-screen')?.classList.contains('hidden'),
      { timeout: 60_000 },
    );
  }
  const patched = await page.evaluate(() => {
    const key = 'dragon-miner.profile.v1';
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const profile = JSON.parse(raw);
    profile.blacksmith = { availableUntil: Date.now() + 36 * 60 * 60 * 1000 };
    const materials = [
      'worn-draco-claw', 'worn-draco-hide', 'black-horn-fragment', 'crimson-fang',
      'serrated-rubra-scale', 'volatile-draconic-essence', 'ossified-draco-ribs',
      'verdant-draco-talisman', 'crimson-draco-talon', 'obsidian-draco-eye',
    ];
    const keep = profile.backpack.filter((stack) => !materials.includes(stack.itemId));
    profile.backpack = [
      ...materials.map((itemId) => ({ itemId, quantity: 30 })),
      { itemId: 'guild-token', quantity: 60 },
      ...keep,
    ];
    profile.backpackCapacity = Math.max(profile.backpackCapacity ?? 40, 60);
    localStorage.setItem(key, JSON.stringify(profile));
    return true;
  });
  return patched;
}

async function openWorkshop(page) {
  await page.click('[data-lobby-tab="blacksmith"]');
  await page.waitForFunction(
    () => !document.getElementById('blacksmith-screen')?.classList.contains('hidden'),
    { timeout: 30_000 },
  );
  await wait(700);
}

async function run() {
  const execPath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
    executablePath: execPath,
    headless: 'shell',
  });

  const report = [];
  const consoleErrors = [];

  // Seed the profile once with a browser profile of desktop size.
  const seed = await browser.newPage();
  seed.on('pageerror', (error) => consoleErrors.push(`[seed] ${error.message}`));
  await seed.setViewport({ width: 1280, height: 800 });
  await seed.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await prepareProfile(seed);
  const storageState = await seed.evaluate(() => JSON.stringify(localStorage));
  await seed.close();

  const only = process.env.ONLY ? process.env.ONLY.split(',').map((v) => v.trim()) : null;
  for (const viewport of VIEWPORTS.filter((v) => !only || only.some((o) => v.name.includes(o)))) {
    const page = await browser.newPage();
    page.on('pageerror', (error) => consoleErrors.push(`[${viewport.name}] ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`[${viewport.name}] console: ${message.text().slice(0, 200)}`);
    });
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument((state) => {
      const data = JSON.parse(state);
      for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);
    }, storageState);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(
      () => !document.getElementById('lobby-screen')?.classList.contains('hidden'),
      { timeout: 180_000 },
    );
    await wait(1200);

    const entry = { viewport: viewport.name, size: `${viewport.width}x${viewport.height}`, screens: {} };
    entry.screens.lobby = await page.evaluate(auditScript);

    await openWorkshop(page);
    entry.screens.workshop = await page.evaluate(auditScript);

    // Craft tab (licensed catalog with the bigger cards + inspector).
    await page.click('[data-workshop-tab="craft"]');
    await wait(400);
    entry.screens['workshop-craft'] = await page.evaluate(auditScript);

    const card = await page.$('[data-recipe-inspect]');
    if (card) {
      await card.hover();
      await wait(300);
      entry.screens['workshop-craft-inspector'] = await page.evaluate(auditScript);
    }

    // Back out and start a run to measure the combat HUD.
    await page.click('[data-back-from-blacksmith]');
    await wait(600);
    const startButton = await page.$('.lobby-start-action button, .lobby-start-action');
    if (startButton) {
      await startButton.click();
      await wait(9000);
      entry.screens.combat = await page.evaluate(auditScript);
    }

    report.push(entry);
    await page.close();
    console.log(`✔ ${viewport.name} (${viewport.width}x${viewport.height})`);
  }

  await browser.close();
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/tablet-audit.json', JSON.stringify({ report, consoleErrors: [...new Set(consoleErrors)].slice(0, 40) }, null, 2));
  console.log('\nRelatório salvo em artifacts/tablet-audit.json');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
