import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const [widthArg, heightArg, outputArg] = process.argv.slice(2);
const width = Number(widthArg);
const height = Number(heightArg);
const output = resolve(outputArg);
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debuggingPort = 9333 + Math.floor(Math.random() * 500);
const profilePath = resolve('artifacts/lobby-review', `.chrome-${debuggingPort}`);

if (!Number.isInteger(width) || !Number.isInteger(height) || !outputArg) {
  throw new Error('Usage: node tools/capture_lobby.mjs <width> <height> <output.png>');
}

await mkdir(dirname(output), { recursive: true });
await mkdir(profilePath, { recursive: true });

const browser = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu-sandbox',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--remote-allow-origins=*',
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${profilePath}`,
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

async function waitForPage() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  throw new Error('Chrome DevTools endpoint did not become ready.');
}

const page = await waitForPage();
process.stderr.write(`CDP target ready on ${debuggingPort}\n`);
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener('open', resolveOpen, { once: true });
  socket.addEventListener('error', rejectOpen, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(String(data));
  if (!message.id || !pending.has(message.id)) return;
  const { resolve: resolveMessage, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolveMessage(message.result);
});

function send(method, params = {}) {
  sequence += 1;
  socket.send(JSON.stringify({ id: sequence, method, params }));
  return new Promise((resolveMessage, reject) => pending.set(sequence, { resolve: resolveMessage, reject }));
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Browser evaluation failed.');
  return result.result.value;
}

async function waitFor(expression, label) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 760,
    screenWidth: width,
    screenHeight: height,
  });
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await send('Page.navigate', { url: 'http://127.0.0.1:5173' });
  process.stderr.write('Navigated; waiting for class selection\n');
  await waitFor(
    `document.querySelector('#select-warrior') && !document.querySelector('#class-select-screen').classList.contains('hidden')`,
    'the class selection screen'
  );
  await evaluate(`document.querySelector('#select-warrior').click(); true`);
  process.stderr.write('Selected Warrior; waiting for lobby\n');
  await waitFor(
    `!document.querySelector('#lobby-screen').classList.contains('hidden') && document.querySelectorAll('#lobby-equipment-slots .equipment-slot').length === 7`,
    'the Warrior lobby'
  );
  await sleep(2200);

  const focusTrail = [];
  for (let index = 0; index < 12; index += 1) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    focusTrail.push(await evaluate(`(() => {
      const active = document.activeElement;
      return active ? active.getAttribute('aria-label') || active.textContent.trim().replace(/\\s+/g, ' ').slice(0, 64) || active.id : '';
    })()`));
  }

  const audit = await evaluate(`(() => {
    const lobby = document.querySelector('#lobby-screen');
    const activeTab = document.querySelector('[data-lobby-tab][aria-pressed="true"]');
    return {
      viewport: [innerWidth, innerHeight],
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      lobbyVisible: !lobby.classList.contains('hidden'),
      activeTab: activeTab?.dataset.lobbyTab,
      equipmentSlots: document.querySelectorAll('#lobby-equipment-slots .equipment-slot').length,
      statusVisible: getComputedStyle(document.querySelector('#lobby-status-panel')).display !== 'none',
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      focusedTag: document.activeElement?.tagName,
    };
  })()`);
  const capture = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(output, Buffer.from(capture.data, 'base64'));
  process.stdout.write(`${JSON.stringify({ output, audit, focusTrail })}\n`);
} finally {
  socket.close();
  browser.kill();
}
