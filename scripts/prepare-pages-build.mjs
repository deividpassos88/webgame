/**
 * Ajusta URLs absolutas de assets geradas a partir de strings TypeScript.
 * O Vite corrige os URLs estáticos do HTML/CSS com a opção base, mas não
 * reescreve caminhos de modelos/texturas construídos em código JS.
 * Executar apenas após build:admin com GITHUB_PAGES=true.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const base = '/webgame/';
const folders = 'assets|blacksmith|draco|items|models|ui|vfx';
const quoted = new RegExp('(["\\x27\\x60])\\/(' + folders + ')\\/', 'g');
const cssUrl = new RegExp('(url\\(\\s*["\\x27]?)\\/(' + folders + ')\\/', 'gi');
const textExtensions = new Set(['.html', '.css', '.js', '.mjs']);

let changedFiles = 0;
let replacements = 0;

async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!item.isFile() || !textExtensions.has(extname(item.name))) continue;

    const before = await readFile(path, 'utf8');
    const after = before
      .replace(quoted, (_all, quote, folder) => {
        replacements++;
        return quote + base + folder + '/';
      })
      .replace(cssUrl, (_all, prefix, folder) => {
        replacements++;
        return prefix + base + folder + '/';
      });

    if (after !== before) {
      await writeFile(path, after, 'utf8');
      changedFiles++;
    }
  }
}

await walk('dist');
console.log('GitHub Pages: URLs de assets corrigidas (' + replacements +
  ' substituicoes em ' + changedFiles + ' arquivos).');
