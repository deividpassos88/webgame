import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  server: {
    port: 5173,
    strictPort: true,
    // The administrator launcher opens Edge itself in InPrivate mode.
    open: mode !== 'admin',
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
}));
