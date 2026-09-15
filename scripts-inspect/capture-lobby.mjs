import fs from 'node:fs/promises';
import WebSocket from 'ws';

const outputPath = process.argv[2] ?? 'artifacts/lobby-verification-desktop.png';
const viewportWidth = Number.parseInt(process.argv[3] ?? '1920', 10) || 1920;
const viewportHeight = Number.parseInt(process.argv[4] ?? '1080', 10) || 1080;
const requestedScreen = process.argv[5];
const screen = requestedScreen?.startsWith('forge') ? 'forge' : requestedScreen === 'skills' || requestedScreen === 'status' ? requestedScreen : 'lobby';
const forgePanel = requestedScreen === 'forge-inventory' ? 'inventory' : requestedScreen === 'forge-craft' ? 'craft' : 'equipment';
const reportLayout = process.argv.includes('--layout-report');
const reportKeyboard = process.argv.includes('--keyboard-report');
const reducedMotion = process.argv.includes('--reduced-motion');
const probeAlignStart = process.argv.includes('--probe-align-start');
const fullSetFixture = process.argv.includes('--full-set-fixture');
const emptyEquipmentFixture = process.argv.includes('--empty-equipment-fixture');
const licensedForgeFixture = process.argv.includes('--licensed-forge-fixture');
const unlicensedForgeFixture = process.argv.includes('--unlicensed-forge-fixture');
const endpoint = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9237';

const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json());
let target = targets.find((entry) => entry.type === 'page' && entry.url.includes('127.0.0.1:5174'));

if (!target) {
  const created = await fetch(`${endpoint}/json/new?http://127.0.0.1:5174/`, { method: 'PUT' })
    .then((response) => response.json());
  target = created;
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
let sequence = 0;
const pending = new Map();

const command = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

await new Promise((resolve, reject) => {
  socket.once('open', resolve);
  socket.once('error', reject);
});

socket.on('message', (message) => {
  const response = JSON.parse(message.toString());
  if (!response.id) return;
  const request = pending.get(response.id);
  if (!request) return;
  pending.delete(response.id);
  if (response.error) request.reject(new Error(response.error.message));
  else request.resolve(response.result);
});

await command('Page.enable');
await command('Runtime.enable');
if (reducedMotion) {
  await command('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
}
await command('Emulation.setDeviceMetricsOverride', {
  width: viewportWidth,
  height: viewportHeight,
  deviceScaleFactor: 1,
  mobile: false,
});
if (fullSetFixture || emptyEquipmentFixture || licensedForgeFixture || unlicensedForgeFixture) {
  await command('Runtime.evaluate', {
    expression: `(() => {
      const key = 'dragon-miner.profile.v1';
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      const profile = JSON.parse(raw);
      if (${fullSetFixture}) {
        profile.equipment = {
          ...profile.equipment,
          helmet: 'common-forged-helmet',
          chest: 'common-forged-chest',
          pants: 'common-forged-pants',
          gloves: 'common-forged-gloves',
          boots: 'common-forged-boots',
          weapon: 'starter-sword',
          primaryWeapon: 'starter-sword',
        };
      }
      if (${emptyEquipmentFixture}) {
        profile.equipment = Object.fromEntries(Object.keys(profile.equipment ?? {}).map((slot) => [slot, null]));
      }
      if (${licensedForgeFixture}) {
        profile.blacksmith = {
          ...profile.blacksmith,
          availableUntil: Date.now() + (36 * 60 * 60 * 1000),
        };
      }
      if (${unlicensedForgeFixture}) {
        profile.blacksmith = {
          ...profile.blacksmith,
          availableUntil: 0,
        };
      }
      localStorage.setItem(key, JSON.stringify(profile));
      return true;
    })()`,
  });
}
await command('Page.navigate', { url: 'http://127.0.0.1:5174/' });

const evaluate = async (expression) => {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result?.value;
};

const waitFor = async (expression, description, timeoutMs = 45000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${description}.`);
};

await waitFor(
  `(() => !document.querySelector('#class-select-screen')?.classList.contains('hidden') || !document.querySelector('#lobby-screen')?.classList.contains('hidden'))()`,
  'the class selection or lobby screen'
);

const lobbyAlreadyVisible = await evaluate(`(() => !document.querySelector('#lobby-screen')?.classList.contains('hidden'))()`);
if (!lobbyAlreadyVisible) {
  await evaluate(`(() => document.querySelector('#select-warrior')?.click())()`);
  await waitFor(
    `(() => !document.querySelector('#lobby-screen')?.classList.contains('hidden'))()`,
    'the lobby screen after class confirmation'
  );
}
if (screen === 'lobby') {
  await evaluate(`(() => document.querySelector('[data-lobby-tab="inventory"]')?.click())()`);
  await waitFor(
    `(() => document.querySelector('.lobby-detail-panel')?.dataset.lobbyView === 'inventory')()`,
    'the inventory panel after restoring the lobby view'
  );
} else if (screen === 'forge' || screen === 'skills' || screen === 'status') {
  const tab = screen === 'forge' ? 'blacksmith' : screen === 'skills' ? 'skills' : 'hero';
  await evaluate(`(() => document.querySelector('[data-lobby-tab="${tab}"]')?.click())()`);
  await waitFor(
    screen === 'forge'
      ? `(() => !document.querySelector('#blacksmith-screen')?.classList.contains('hidden'))()`
      : screen === 'skills'
        ? `(() => document.querySelector('.lobby-detail-panel')?.dataset.lobbyView === 'skills')()`
        : `(() => !document.querySelector('#lobby-screen')?.classList.contains('hidden'))()`,
    screen === 'forge' ? 'the blacksmith screen after opening the workshop tab' : screen === 'skills' ? 'the skills panel after opening the skills tab' : 'the hero panel before opening status'
  );
  if (screen === 'status') {
    await evaluate(`(() => document.querySelector('[data-lobby-equipment-view="status"]')?.click())()`);
    await waitFor(`(() => document.querySelector('.lobby-equipment')?.dataset.lobbyEquipmentView === 'status')()`, 'the active status tab');
  }
  await evaluate(`(() => { window.scrollTo(0, 0); document.querySelector('#blacksmith-screen')?.scrollTo?.(0, 0); return true; })()`);
  if (screen === 'forge' && forgePanel !== 'equipment') {
    await evaluate(`(() => document.querySelector('[data-workshop-tab="${forgePanel}"]')?.click())()`);
    await waitFor(
      `(() => document.querySelector('#workshop-panel-${forgePanel}:not([hidden])'))()`,
      `the ${forgePanel} workshop panel`
    );
    await evaluate(`(() => { window.scrollTo(0, 0); document.querySelector('#blacksmith-screen')?.scrollTo?.(0, 0); document.querySelector('.workshop-tab-panel:not([hidden])')?.scrollTo?.(0, 0); return true; })()`);
  }
}
if (screen === 'forge') {
  await waitFor(
    `(() => {
      const canvas = document.querySelector('.blacksmith-scene__canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      if (canvas.dataset.blacksmithModelError || canvas.dataset.blacksmithModelReady !== 'true') return false;
      if (canvas.width < 32 || canvas.height < 32) return false;
      return new Promise((resolve) => requestAnimationFrame(() => {
        const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        if (!context) return resolve(false);
        const size = 48;
        const pixels = new Uint8Array(size * size * 4);
        const x = Math.max(0, Math.floor((canvas.width - size) / 2));
        const y = Math.max(0, Math.floor((canvas.height - size) / 2));
        context.readPixels(x, y, size, size, context.RGBA, context.UNSIGNED_BYTE, pixels);
        let useful = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 12) useful += 1;
        }
        resolve(useful > 24);
      }));
    })()`,
    'the rendered blacksmith model without WebGL errors'
  );
}
await new Promise((resolve) => setTimeout(resolve, screen === 'forge' ? 700 : 1200));
await evaluate(`(() => { window.scrollTo(0, 0); document.querySelector('#lobby-screen, #blacksmith-screen')?.scrollTo?.(0, 0); return true; })()`);

if (probeAlignStart) {
  await evaluate(`(() => {
    const layout = document.querySelector('.workshop-layout');
    const conversation = document.querySelector('.workshop-conversation');
    const equipment = document.querySelector('.workshop-equipment');
    const scene = document.querySelector('.workshop-conversation .blacksmith-scene');
    const slots = document.querySelectorAll('.equipment-grid .equipment-slot');
    if (layout) layout.style.alignSelf = 'start';
    if (conversation) conversation.style.display = 'block';
    if (equipment) equipment.style.display = 'block';
    if (scene) { scene.style.flex = 'none'; scene.style.minHeight = '0'; }
    slots.forEach((slot) => { slot.style.aspectRatio = 'auto'; });
    return Boolean(layout && conversation && equipment && scene && slots.length);
  })()`);
}

if (reportLayout) {
  console.log(JSON.stringify(await evaluate(`(() => {
    const selectors = ${JSON.stringify(['#blacksmith-screen', '.workshop-layout', '.workshop-conversation', '.blacksmith-scene', '.workshop-equipment', '.workshop-tabs', '.workshop-tab-body', '.workshop-tab-panel:not([hidden])', '.workshop-recipes'])};
    if (${JSON.stringify(screen)} !== 'forge') selectors.push('#lobby-screen', '.lobby-equipment', '.lobby-current-status', '.lobby-set-bonus', '.lobby-detail-panel', '.panel-heading', '.lobby-inventory-tools', '#lobby-backpack', '#lobby-panel-skills', '.lobby-hotkey-message', '.lobby-start-action', '#start-game');
    const elements = Object.fromEntries(selectors.map((selector) => {
      const element = document.querySelector(selector);
      const rect = element?.getBoundingClientRect();
      const style = element ? getComputedStyle(element) : null;
      return [selector, rect && style ? { inlineStyle: element.getAttribute('style'), left: rect.left, right: rect.right, width: rect.width, top: rect.top, bottom: rect.bottom, height: rect.height, position: style.position, display: style.display, overflow: style.overflow, padding: style.padding, border: style.border, outline: style.outline, boxShadow: style.boxShadow, filter: style.filter, backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, gridArea: style.gridArea, gridTemplateRows: style.gridTemplateRows, gridTemplateAreas: style.gridTemplateAreas, gridAutoRows: style.gridAutoRows } : null];
    }));
    return { viewport: { width: window.innerWidth, height: window.innerHeight, narrow: matchMedia('(max-width: 820px)').matches }, elements };
  })()`)));
}

if (reportKeyboard) {
  const count = await evaluate(`(() => {
    const focusable = [...document.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((element) => !element.closest('.hidden'));
    focusable[0]?.focus();
    return focusable.length;
  })()`);
  const sequence = [];
  for (let index = 0; index < count; index += 1) {
    sequence.push(await evaluate(`(() => { const element = document.activeElement; return element ? { tag: element.tagName, text: (element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 64), dataset: element.getAttributeNames().filter((name) => name.startsWith('data-')).sort().map((name) => [name, element.getAttribute(name)]) } : null; })()`));
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  }
  console.log(JSON.stringify({ keyboardFocusableCount: count, keyboardSequence: sequence }));
}

if (reducedMotion) {
  console.log(JSON.stringify(await evaluate(`(() => ({ reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, transitionDuration: getComputedStyle(document.querySelector('#blacksmith-screen button, #lobby-screen button')).transitionDuration }))()`)));
}

const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await fs.writeFile(outputPath, screenshot.data, 'base64');
console.log(`${screen[0].toUpperCase()}${screen.slice(1)} capture saved to ${outputPath} (${viewportWidth}x${viewportHeight})`);

socket.close();
