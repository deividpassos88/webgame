import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const buildId = process.env.DRAGON_MINER_BUILD_ID ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type AssetEntry = { path: string; bytes: number };

const ASSET_EXTENSIONS = 'glb|gltf|png|webp|jpe?g|svg|wasm|mp3|ogg|wav|hdr|ktx2|bin|fbx|obj';
const ASSET_REFERENCE_PATTERN = new RegExp(
  `['"\`](\\/[^'"\`\\s]*\\.(?:${ASSET_EXTENSIONS})(?:\\?[^'"\`\\s]*)?)['"\`]`,
  'gi'
);

/** Lista recursivamente os arquivos de um diretório (usado pelo painel de teste). */
function listAssets(rootDir: string): AssetEntry[] {
  const entries: AssetEntry[] = [];
  const walk = (dir: string): void => {
    let children: ReturnType<typeof readdirSync>;
    try {
      children = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const child of children) {
      const full = join(dir, child.name);
      if (child.isDirectory()) {
        walk(full);
      } else if (child.isFile()) {
        let bytes = 0;
        try {
          bytes = statSync(full).size;
        } catch {
          bytes = 0;
        }
        entries.push({ path: `/${relative(rootDir, full).split(sep).join('/')}`, bytes });
      }
    }
  };
  walk(rootDir);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

/** Todos os caminhos de asset que o código-fonte pede em tempo de execução. */
function collectAssetReferences(srcDir: string, publicDir: string): string[] {
  const found = new Set<string>();
  const walk = (dir: string): void => {
    let children: ReturnType<typeof readdirSync>;
    try {
      children = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const child of children) {
      const full = join(dir, child.name);
      if (child.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs)$/.test(child.name) || /\.test\./.test(child.name)) continue;
      let source = '';
      try {
        source = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      for (const match of source.matchAll(ASSET_REFERENCE_PATTERN)) {
        const raw = match[1].split('?')[0];
        let decoded = raw;
        try {
          decoded = decodeURIComponent(raw);
        } catch {
          decoded = raw;
        }
        // Só interessam arquivos que o build publica na raiz do site.
        try {
          if (statSync(join(publicDir, decoded)).isFile()) found.add(decoded);
        } catch {
          found.add(decoded);
        }
      }
    }
  };
  walk(srcDir);
  return [...found].sort((a, b) => a.localeCompare(b));
}

/**
 * Lê o src/main.ts para saber se o menu ADM vem ligado por padrão no build.
 *
 * A regra atual do jogo é `adminEnabled = !adminExplicitlyDisabled`, ou seja:
 * o ADM aparece em qualquer build (público inclusive) a menos que a URL use
 * `?admin=0`/`?admin=false`. O painel de teste avisa quando for esse o caso.
 */
function detectAdminDefaultOn(root: string): boolean | null {
  try {
    const source = readFileSync(join(root, 'src', 'main.ts'), 'utf8');
    if (/adminEnabled\s*=\s*!adminExplicitlyDisabled/.test(source)) return true;
    if (/adminEnabled\s*=\s*false/.test(source)) return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Publica `build-info.json` na raiz do site (dist) e também em dev.
 *
 * A página `public/teste.html` (painel de teste) lê esse arquivo para saber o
 * id/modo do build e para conferir se cada asset está sendo servido de verdade.
 */
function buildInfoPlugin(): Plugin {
  let mode = 'development';
  let root = '';
  let publicDir = '';
  let outDir = '';
  let isDev = false;

  const payload = (): string => {
    const publicAssets = publicDir ? listAssets(publicDir) : [];
    let assets = publicAssets;
    let bundle: AssetEntry[] = [];

    // No build, o relatório sai do dist/ final: o que veio de public/ entra em
    // `assets`, e o que o Vite gerou (index.html, JS, CSS) entra em `bundle`.
    if (!isDev && outDir) {
      const distAssets = listAssets(outDir);
      if (distAssets.length) {
        const publicPaths = new Set(publicAssets.map((entry) => entry.path));
        assets = distAssets.filter((entry) => publicPaths.has(entry.path));
        bundle = distAssets.filter((entry) => !publicPaths.has(entry.path) && entry.path !== '/build-info.json');
      }
    }

    const totalBytes = assets.reduce((sum, entry) => sum + entry.bytes, 0);
    const referenced = publicDir ? collectAssetReferences(join(root, 'src'), publicDir) : [];
    const published = new Set([...assets.map((entry) => entry.path), ...bundle.map((entry) => entry.path)]);
    return JSON.stringify(
      {
        buildId,
        mode,
        generatedAt: new Date().toISOString(),
        node: process.version,
        assetCount: assets.length,
        assetTotalBytes: totalBytes,
        adminDefaultOn: root ? detectAdminDefaultOn(root) : null,
        bundle,
        assets,
        referenced,
        referencedMissing: referenced.filter((path) => !published.has(path)),
      },
      null,
      2
    );
  };

  return {
    name: 'dragon-miner:build-info',
    configResolved(config) {
      mode = config.mode;
      root = config.root;
      publicDir = config.publicDir;
      // Respeita --outDir (o build ADMIN vai para dist-admin/).
      outDir = isAbsolute(config.build.outDir) ? config.build.outDir : resolve(config.root, config.build.outDir);
      isDev = config.command === 'serve' && config.isPreview !== true;
    },
    configureServer(server) {
      // Em dev ainda não existe dist/: o JSON é montado na hora a partir de public/.
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url !== '/build-info.json') {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(payload());
      });
    },
    // Placeholder: garante o arquivo mesmo se o pós-processamento falhar.
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build-info.json', source: '{}\n' });
    },
    // closeBundle roda depois de o Vite copiar public/ e escrever o HTML, então
    // aqui o relatório enxerga o conteúdo real de dist/.
    closeBundle() {
      if (isDev || !outDir) return;
      const distDir = outDir;
      const distLabel = relative(root, outDir).split(sep).join('/') || outDir;
      try {
        writeFileSync(join(distDir, 'build-info.json'), payload());
      } catch {
        /* sem outDir/: o placeholder do generateBundle já resolveu */
      }

      // `npm run build` já vem com o painel de teste. Para publicar um build sem
      // o painel (e sem o build-info.json), rode com DRAGON_MINER_SKIP_TEST_PAGE=1.
      if (process.env.DRAGON_MINER_SKIP_TEST_PAGE !== '1') return;
      for (const file of ['teste.html', 'build-info.json']) {
        try {
          rmSync(join(distDir, file), { force: true });
          console.log(`  \u001b[33m- painel de teste removido do build:\u001b[0m ${distLabel}/${file}`);
        } catch {
          /* nada a remover */
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  define: {
    __DRAGON_MINER_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [buildInfoPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    open: false,
    allowedHosts: true,
    // Sem cache no servidor de desenvolvimento: o preview passa por um proxy e
    // um `no-cache` no HTML deixava a página antiga presa no navegador.
    headers: {
      'Cache-Control': 'no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    open: false,
    allowedHosts: true,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
}));
