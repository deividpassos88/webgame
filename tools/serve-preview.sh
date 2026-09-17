#!/usr/bin/env bash
#
# Sobe o preview do build de produção (dist/) num comando só.
#
# O sandbox não persiste node_modules/ nem dist/ entre sessões, então este
# script instala, builda e serve — e recria o vite.preview.config.ts (que é
# gitignore'd de propósito) quando ele não existe.
#
# Uso:  bash tools/serve-preview.sh [porta]
#
set -euo pipefail

PORT="${1:-4173}"
cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  echo "==> Instalando dependências..."
  npm install --no-audit --no-fund
fi

if [ ! -f vite.preview.config.ts ]; then
  echo "==> Recriando vite.preview.config.ts..."
  cat > vite.preview.config.ts <<'CONFIG'
// Temporary, gitignored config used only to serve the production build (dist/)
// inside the sandbox live-preview environment.
import { defineConfig } from 'vite';

export default defineConfig({
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
});
CONFIG
fi

echo "==> Buildando..."
npm run build

echo "==> Servindo dist/ em 0.0.0.0:${PORT}"
exec npx vite preview --config vite.preview.config.ts --port "${PORT}"
