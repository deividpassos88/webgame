import { defineConfig } from 'vite';

const buildId = process.env.DRAGON_MINER_BUILD_ID ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default defineConfig(({ mode }) => ({
  define: {
    __DRAGON_MINER_BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    open: false,
    allowedHosts: true,
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


