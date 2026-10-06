export function resolveDevAdminAccess(
  value: unknown,
  development = false
): boolean {
  if (value !== undefined) return value === 'true';
  return development;
}

/**
 * Entradas que decidem se o menu ADM entra no bundle. Vem todas de
 * `import.meta.env` (resolvidas em tempo de build) e da URL.
 */
export interface AdminAccessContext {
  /** `import.meta.env.MODE` — vira `'admin'` em `vite build --mode admin`. */
  readonly mode: string;
  /** `import.meta.env.DEV` — `true` apenas no `vite dev`. */
  readonly development: boolean;
  /** `import.meta.env.VITE_ADMIN_MODE` (`.env*`, ignorado pelo Git). */
  readonly envFlag: unknown;
  /** Valor de `?admin=` na URL, ou `null` quando ausente. */
  readonly urlParam: string | null;
}

/**
 * Decide o acesso ADM. A regra segue o `BUILD-ADMIN.md`:
 *
 * - `vite build --mode admin` → **ligado** (sem depender de `.env`);
 * - `vite dev` → **ligado** por padrão;
 * - `vite build` público → **desligado**, e `?admin=1` **não** liga: senão
 *   qualquer visitante do site publicado ganharia as ferramentas ADM.
 *
 * `?admin=0`/`false` e `VITE_ADMIN_MODE=false` funcionam como kill switch e
 * vencem qualquer regra de ativação.
 */
export function resolveAdminEnabled(context: AdminAccessContext): boolean {
  const { mode, development, envFlag, urlParam } = context;

  if (urlParam === '0' || urlParam === 'false' || envFlag === 'false') {
    return false;
  }

  if (mode === 'admin' || resolveDevAdminAccess(envFlag, development)) {
    return true;
  }

  return development && (urlParam === '1' || urlParam === 'true');
}
