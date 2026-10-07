export function resolveDevAdminAccess(
  value: unknown,
  development = false
): boolean {
  if (value !== undefined) return value === 'true';
  return development;
}

/**
 * Sinais do bundle atual usados para decidir se o menu ADM aparece.
 * Ficam num objeto para o teste cobrir cada build sem depender do Vite.
 */
export interface AdminAccessSignals {
  /** `?admin=` da URL: `'1'`, `'true'`, `'0'`, `'false'` ou `null`. */
  readonly adminParam: string | null;
  /** `import.meta.env.MODE`: `development`, `production` ou `admin`. */
  readonly mode: string;
  /** `import.meta.env.VITE_ADMIN_MODE` (`.env.admin` traz `true`). */
  readonly viteAdminMode: unknown;
  /** `import.meta.env.DEV`. */
  readonly development: boolean;
}

/**
 * Decide se as ferramentas de administrador ficam ligadas no bundle.
 *
 * - `?admin=0`/`?admin=false` (ou `VITE_ADMIN_MODE=false`) desligam sempre;
 * - `npm run build:admin` (`--mode admin`) e o servidor de desenvolvimento
 *   ligam o ADM;
 * - `VITE_ADMIN_MODE=true` (`.env.admin`) também liga;
 * - o build público (`npm run build`) sai **sem** ADM, como documenta o
 *   BUILD-ADMIN.md.
 *
 * O `?admin=1` do launcher só vale nos builds que já permitem ADM: ele não
 * transforma um bundle público em painel administrativo.
 */
export function resolveAdminEnabled(signals: AdminAccessSignals): boolean {
  const { adminParam, mode, viteAdminMode, development } = signals;
  if (adminParam === '0' || adminParam === 'false' || viteAdminMode === 'false') {
    return false;
  }
  if (mode === 'admin' || development) return true;
  return resolveDevAdminAccess(viteAdminMode, false);
}
