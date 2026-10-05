#!/usr/bin/env bash
#
# Sobe o preview do build de produção (dist/) num comando só.
#
# O sandbox não persiste node_modules/ nem dist/ entre sessões, então este
# script instala, builda e serve — e recria o vite.preview.config.ts (que é
# gitignore'd de propósito) quando ele não existe.
#
# Uso:
#   bash tools/serve-preview.sh [porta] [--admin] [--page teste|jogo]
#
#   --admin        builda com menu ADM ligado (npm run build:admin) em dist-admin/
#   --page teste   serve o painel de teste em / (jogo segue em /index.html)
#   --page jogo    serve o jogo em / (padrão; painel de teste em /teste.html)
#
# Exemplos:
#   bash tools/serve-preview.sh 4173 --admin --page teste
#   bash tools/serve-preview.sh 4174 --page jogo
#
set -euo pipefail

PORT="4173"
BUILD_SCRIPT="build"
OUT_DIR="dist"
PAGE="jogo"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --admin) BUILD_SCRIPT="build:admin"; OUT_DIR="dist-admin"; shift ;;
    --page) PAGE="${2:-jogo}"; shift 2 ;;
    ''|--*) shift ;;
    *) PORT="$1"; shift ;;
  esac
done

if [[ "$PAGE" != "teste" && "$PAGE" != "jogo" ]]; then
  echo "Página inválida: '$PAGE' (use teste ou jogo)" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  echo "==> Instalando dependências..."
  npm install --no-audit --no-fund
fi

echo "==> Recriando vite.preview.config.ts..."
cat > vite.preview.config.ts <<'CONFIG'
// Temporary, gitignored config used only to serve the production build (dist/)
// inside the sandbox live-preview environment.
import { defineConfig, type Plugin } from 'vite';

/** Com DRAGON_MINER_PREVIEW_PAGE=teste, a raiz do site mostra o painel de teste. */
function rootPagePlugin(): Plugin {
  return {
    name: 'dragon-miner:preview-root-page',
    configurePreviewServer(server) {
      if (process.env.DRAGON_MINER_PREVIEW_PAGE !== 'teste') return;
      server.middlewares.use((req, _res, next) => {
        const url = (req.url ?? '').split('?')[0];
        // Só a raiz vira o painel: /index.html continua sendo o jogo.
        if (url === '/') req.url = '/teste.html';
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [rootPagePlugin()],
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.DRAGON_MINER_PREVIEW_PORT ?? 4173),
    strictPort: true,
    allowedHosts: true,
  },
});
CONFIG

echo "==> Buildando (npm run ${BUILD_SCRIPT} -- --outDir ${OUT_DIR})..."
npm run "${BUILD_SCRIPT}" -- --outDir "${OUT_DIR}"

echo "==> Servindo ${OUT_DIR}/ em 0.0.0.0:${PORT} (página raiz: ${PAGE})"
export DRAGON_MINER_PREVIEW_PAGE="$PAGE"
export DRAGON_MINER_PREVIEW_PORT="$PORT"
exec npx vite preview --config vite.preview.config.ts --outDir "${OUT_DIR}"
