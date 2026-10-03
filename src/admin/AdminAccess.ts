/**
 * Decide se a sessão atual pode usar as ferramentas ADM.
 *
 * Regra de ouro: o build público (`npm run build`) NUNCA cria o painel ADM.
 * Só existem três formas de ligar as ferramentas de teste:
 *  - `npm run dev:admin` / `npm run build:admin` → `MODE === 'admin'`;
 *  - `.env.admin` com `VITE_ADMIN_MODE=true` (carregado no modo admin);
 *  - servidor de desenvolvimento local (`npm run dev`) ou `?admin=1` no dev.
 *
 * E uma forma de desligar mesmo nesses casos: `?admin=0` / `?admin=false`.
 */
export function resolveDevAdminAccess(
  value: unknown,
  development = false
): boolean {
  if (value !== undefined) return value === 'true';
  return development;
}

export interface AdminActivationInput {
  /** `import.meta.env.MODE` — `'admin'` no build/servidor de administração. */
  readonly mode: string | undefined;
  /** `import.meta.env.DEV` — verdadeiro no servidor de desenvolvimento do Vite. */
  readonly development: boolean;
  /** `import.meta.env.VITE_ADMIN_MODE` cru. */
  readonly envValue: unknown;
  /** `?admin=` da URL, sem normalização. */
  readonly adminParam: string | null;
}

/** Resolve a autorização ADM do protótipo a partir do ambiente e da URL. */
export function resolveAdminActivation(input: AdminActivationInput): boolean {
  if (input.adminParam === '0' || input.adminParam === 'false') return false;
  if (input.mode === 'admin') return true;
  if (input.development && input.adminParam === '1') return true;
  return resolveDevAdminAccess(input.envValue, input.development);
}
