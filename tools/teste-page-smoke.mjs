#!/usr/bin/env node
/**
 * Smoke test do painel de teste (public/teste.html).
 *
 * Roda a página de verdade dentro de um DOM simulado (happy-dom) e troca só a
 * rede por um servidor falso que responde a partir dos arquivos reais de
 * `dist/` (ou `public/`). Assim ele verifica o que mais importa no painel:
 *
 *  1. o build-info.json é lido e os KPIs são preenchidos;
 *  2. o preset "Essenciais" marca todos os arquivos como ok;
 *  3. modelos .glb têm o cabeçalho glTF validado (não só o HTTP 200);
 *  4. um 404 real aparece como "falhou" na tabela;
 *  5. assets citados no código e ausentes aparecem no aviso vermelho.
 *
 * Uso:
 *   node tools/teste-page-smoke.mjs             # testa o painel servindo dist/
 *   node tools/teste-page-smoke.mjs dist-admin  # idem para o build ADMIN
 *   node tools/teste-page-smoke.mjs public      # usa os arquivos de public/
 */
import { readdirSync, readFileSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const target = process.argv[2] || 'dist';
const baseDir = join(repoRoot, target);
const pagePath = join(repoRoot, 'public', 'teste.html');

const checks = [];
function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail });
  const icon = condition ? '\u001b[32m✓\u001b[0m' : '\u001b[31m✗\u001b[0m';
  console.log(` ${icon} ${name}${detail ? ` \u001b[2m— ${detail}\u001b[0m` : ''}`);
}

// ---------------------------------------------------------------- inventário
function indexFiles(dir, prefix = '') {
  const entries = {};
  for (const child of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, child.name);
    if (child.isDirectory()) {
      Object.assign(entries, indexFiles(full, `${prefix}/${child.name}`));
    } else if (child.isFile()) {
      entries[prefix + '/' + child.name] = statSync(full).size;
    }
  }
  return entries;
}

function firstBytes(file, count) {
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(count);
    const read = readSync(fd, buffer, 0, count, 0);
    return [...buffer.subarray(0, read)];
  } finally {
    closeSync(fd);
  }
}

console.log(`\n\u001b[1mPainel de teste — smoke test\u001b[0m (servindo ${relative(repoRoot, baseDir) || '.'}/)`);

const index = indexFiles(baseDir);
const glbHeads = {};
for (const path of Object.keys(index)) {
  if (/\.glb$/i.test(path)) glbHeads[path] = firstBytes(join(baseDir, path), 12);
}

let buildInfo;
try {
  buildInfo = JSON.parse(readFileSync(join(baseDir, 'build-info.json'), 'utf8'));
} catch {
  buildInfo = {
    buildId: 'smoke-local',
    mode: 'development',
    generatedAt: new Date().toISOString(),
    node: process.version,
    bundle: [],
    assets: Object.entries(index).map(([path, bytes]) => ({ path, bytes })),
    referenced: [],
    referencedMissing: [],
  };
}

// -------------------------------------------------------------- fake network
const fakeNetwork = `
(function () {
  var INDEX = ${JSON.stringify(index)};
  var HEADS = ${JSON.stringify(glbHeads)};
  var BUILD_INFO = ${JSON.stringify(JSON.stringify(buildInfo))};
  var NOT_FOUND = [];

  window.__smoke = {
    forceNotFound: function (paths) { NOT_FOUND = paths.slice(); }
  };

  function FakeResponse(status, headers, body) {
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.headers = {
      get: function (name) {
        var key = String(name).toLowerCase();
        return Object.prototype.hasOwnProperty.call(headers, key) ? String(headers[key]) : null;
      }
    };
    this.arrayBuffer = function () {
      if (!body) return Promise.resolve(new ArrayBuffer(0));
      var view = new Uint8Array(body);
      return Promise.resolve(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
    };
    this.text = function () { return Promise.resolve(body ? String(body) : ''); };
    this.json = function () { return Promise.resolve(JSON.parse(BUILD_INFO)); };
  }

  function toPath(url) {
    // Servidor de verdade decodifica %20 antes de achar o arquivo.
    return decodeURIComponent(String(url).split('?')[0]);
  }

  window.fetch = function (url, options) {
    var path = toPath(url);
    var method = (options && options.method) || 'GET';
    var range = options && options.headers ? options.headers.Range : null;
    if (path === '/build-info.json' || String(url).indexOf('/build-info.json') !== -1) {
      return Promise.resolve(new FakeResponse(200, { 'content-type': 'application/json', 'content-length': BUILD_INFO.length }, BUILD_INFO));
    }
    if (NOT_FOUND.indexOf(path) !== -1 || !Object.prototype.hasOwnProperty.call(INDEX, path)) {
      return Promise.resolve(new FakeResponse(404, { 'content-type': 'text/plain' }, 'not found'));
    }
    var size = INDEX[path];
    if (method === 'HEAD') {
      return Promise.resolve(new FakeResponse(200, { 'content-type': 'application/octet-stream', 'content-length': size }, null));
    }
    if (range && HEADS[path]) {
      return Promise.resolve(new FakeResponse(206, { 'content-type': 'model/gltf-binary', 'content-length': HEADS[path].length }, new Uint8Array(HEADS[path])));
    }
    return Promise.resolve(new FakeResponse(200, { 'content-type': 'application/octet-stream', 'content-length': size }, null));
  };

  window.Image = function () {
    var self = this;
    this.naturalWidth = 0;
    this.naturalHeight = 0;
    this.onload = null;
    this.onerror = null;
    var src = '';
    Object.defineProperty(this, 'src', {
      get: function () { return src; },
      set: function (value) {
        src = value;
        var path = toPath(value);
        setTimeout(function () {
          if (NOT_FOUND.indexOf(path) !== -1 || !Object.prototype.hasOwnProperty.call(INDEX, path)) {
            if (self.onerror) self.onerror();
            return;
          }
          self.naturalWidth = 128;
          self.naturalHeight = 128;
          if (self.onload) self.onload();
        }, 0);
      }
    });
  };
})();
`;

// ------------------------------------------------------------- monta a página
const pageHtml = readFileSync(pagePath, 'utf8');
const inlineScripts = [...pageHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
const bodyMatch = pageHtml.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '').match(/<body[^>]*>([\s\S]*)<\/body>/i);
if (inlineScripts.length !== 1 || !bodyMatch) {
  console.error('Não foi possível separar o script embutido do HTML de public/teste.html.');
  process.exit(1);
}

const window = new Window({
  url: 'http://localhost/teste.html',
  settings: {
    enableJavaScriptEvaluation: true,
    suppressInsecureJavaScriptEnvironmentWarning: true,
  },
});
window.document.write(
  '<!doctype html><html><head><meta charset="utf-8"><title>smoke</title></head><body>'
  + `<script>${fakeNetwork}</script>`
  + bodyMatch[1]
  + `<script>${inlineScripts[0]}</script>`
  + '</body></html>'
);

const doc = window.document;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, predicate, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await sleep(15);
  }
  throw new Error(`timeout esperando: ${label}`);
}

function statusCounts() {
  const counts = { ok: 0, warn: 0, fail: 0, skip: 0, other: 0 };
  for (const cell of doc.querySelectorAll('#results-body td.status')) {
    const className = cell.className;
    if (className.includes('st-ok')) counts.ok += 1;
    else if (className.includes('st-warn')) counts.warn += 1;
    else if (className.includes('st-fail')) counts.fail += 1;
    else if (className.includes('st-skip')) counts.skip += 1;
    else counts.other += 1;
  }
  return counts;
}

function failingPaths() {
  const paths = [];
  for (const row of doc.querySelectorAll('#results-body tr')) {
    const status = row.querySelector('td.status');
    if (status && status.className.includes('st-fail')) {
      const path = row.querySelector('td.path');
      if (path) paths.push(path.textContent.split('\n')[0]);
    }
  }
  return paths;
}

function notesFor(selector) {
  return [...doc.querySelectorAll(selector)].map((cell) => cell.textContent);
}

try {
  await window.happyDOM.waitUntilComplete();
  await waitFor('build-info.json aplicado', () => !/carregando/.test(doc.querySelector('#chips').textContent));

  // 1. cabeçalho e KPIs
  const chips = doc.querySelector('#chips').textContent;
  check('lê o build-info.json e mostra build/modo', chips.includes(buildInfo.buildId) && chips.includes(buildInfo.mode), chips.trim().replace(/\s+/g, ' '));
  const kpiText = doc.querySelector('#kpis').textContent;
  check('KPIs preenchidos', kpiText.includes('Assets publicados') && kpiText.includes('Módulos do build'));
  check('conta os assets do build', kpiText.includes(String(buildInfo.assets.length)), `${buildInfo.assets.length} assets`);
  const missing = buildInfo.referencedMissing || [];
  const missingCard = doc.querySelector('#missing-card');
  check(
    'avisa assets citados no código e ausentes',
    missing.length ? !missingCard.hidden && missing.every((path) => missingCard.textContent.includes(path)) : missingCard.hidden,
    missing.length ? missing.join(', ') : 'nenhum ausente'
  );

  const adminCard = doc.querySelector('#admin-card');
  check(
    'avisa quando o menu ADM vem liberado no build',
    buildInfo.adminDefaultOn === true ? !adminCard.hidden : adminCard.hidden,
    buildInfo.adminDefaultOn === true ? 'aviso visível' : 'sem aviso'
  );

  // 2. preset essenciais: tudo ok
  doc.querySelector('#preset').value = 'referenced';
  doc.querySelector('#run').click();
  await waitFor('preset essenciais concluído', () => /concluído/.test(doc.querySelector('#progress-label').textContent), 60000);
  const essential = statusCounts();
  check('preset essenciais testa todos os arquivos', essential.ok + essential.fail + essential.warn > 0, `${essential.ok} ok / ${essential.fail} falha(s) / ${essential.warn} atenção`);
  check('preset essenciais sem falhas', essential.fail === 0, essential.fail ? 'falhou: ' + failingPaths().join(', ') : 'nenhuma falha');
  const skipped = statusCounts().skip;
  check(
    'assets ausentes ficam como ignorados, não como ok',
    skipped === missing.length,
    skipped ? `${skipped} ignorado(s) — ${missing.join(', ')}` : 'nenhum'
  );
  const glbNotes = notesFor('#results-body td.note').filter((note) => note.includes('glTF v2'));
  check('valida o cabeçalho dos .glb', glbNotes.length > 0, `${glbNotes.length} modelo(s) com cabeçalho glTF v2 válido`);
  check('marca os assets como ok', essential.ok > 0 && essential.other === 0);

  // 3. modelo 3D: preset .glb
  doc.querySelector('#preset').value = 'mo2';
  doc.querySelector('#run').click();
  await waitFor('preset modelos concluído', () => statusCounts().other === 0 && /concluído/.test(doc.querySelector('#progress-label').textContent), 60000);
  const models = statusCounts();
  const modelCount = Object.keys(index).filter((path) => /\.glb$/i.test(path)).length;
  check('preset modelos (.glb) cobre todos os modelos', models.ok + models.warn >= modelCount, `${models.ok + models.warn}/${modelCount}`);

  // 4. imagens decodificam
  doc.querySelector('#preset').value = 'images';
  doc.querySelector('#run').click();
  await waitFor('preset imagens concluído', () => statusCounts().other === 0 && /concluído/.test(doc.querySelector('#progress-label').textContent), 60000);
  const images = statusCounts();
  const imageCount = Object.keys(index).filter((path) => /\.(png|webp|jpe?g)$/i.test(path)).length;
  check('preset imagens decodifica as imagens', images.ok >= imageCount && images.fail === 0, `${images.ok}/${imageCount} decodificadas`);
  const dimensionNote = notesFor('#results-body td.note').find((note) => /\d+×\d+/.test(note));
  check('mostra dimensões das imagens', Boolean(dimensionNote), dimensionNote);

  // 5. 404 aparece como falha
  window.__smoke.forceNotFound(['/models/sword.glb']);
  doc.querySelector('#preset').value = 'referenced';
  const before = doc.querySelector('#progress-label').textContent;
  doc.querySelector('#run').click();
  await waitFor('execução com 404 concluída', () => {
    const text = doc.querySelector('#progress-label').textContent;
    return text !== before && /concluído/.test(text);
  }, 60000);
  const withFailure = statusCounts();
  check('404 aparece como "falhou" na tabela', withFailure.fail === 1, `${withFailure.fail} falha(s) — esperado 1`);
  const failureNote = notesFor('#results-body td.status.st-fail')[0];
  check('descreve o motivo da falha', failureNote && failureNote.includes('falhou'), failureNote);

  // 6. filtro "só problemas"
  const onlyProblems = doc.querySelector('#only-problems');
  onlyProblems.checked = true;
  onlyProblems.dispatchEvent(new window.Event('change'));
  const visible = statusCounts();
  check('filtro "só problemas" esconde os ok', visible.ok === 0 && visible.fail === 1, `${visible.fail} linha(s) de falha visível(is)`);
  onlyProblems.checked = false;
  onlyProblems.dispatchEvent(new window.Event('change'));
} catch (error) {
  check('execução do painel', false, error.message);
} finally {
  try { window.close(); } catch { /* ignora */ }
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${failed.length ? '\u001b[31m' : '\u001b[32m'}${checks.length - failed.length}/${checks.length} verificações passaram\u001b[0m\n`);
process.exit(failed.length ? 1 : 0);
