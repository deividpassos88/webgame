import { describe, expect, it } from 'vitest';
import { resolveAdminActivation, resolveDevAdminAccess } from './AdminAccess';

describe('resolveDevAdminAccess', () => {
  it('enables tools only for the explicit true value', () => {
    expect(resolveDevAdminAccess('true')).toBe(true);
    expect(resolveDevAdminAccess('TRUE')).toBe(false);
    expect(resolveDevAdminAccess(undefined)).toBe(false);
  });

  it('enables the prototype panel by default only on the development server', () => {
    expect(resolveDevAdminAccess(undefined, true)).toBe(true);
    expect(resolveDevAdminAccess(undefined, false)).toBe(false);
    expect(resolveDevAdminAccess('false', true)).toBe(false);
  });
});

describe('resolveAdminActivation', () => {
  const production = { mode: 'production', development: false, envValue: undefined } as const;
  const development = { mode: 'development', development: true, envValue: undefined } as const;
  const adminBuild = { mode: 'admin', development: false, envValue: 'true' } as const;

  it('never enables ADM on the public production build', () => {
    expect(resolveAdminActivation({ ...production, adminParam: null })).toBe(false);
    expect(resolveAdminActivation({ ...production, adminParam: '1' })).toBe(false);
    expect(resolveAdminActivation({ ...production, adminParam: '' })).toBe(false);
  });

  it('enables ADM on the dedicated admin build without touching the URL', () => {
    expect(resolveAdminActivation({ ...adminBuild, adminParam: null })).toBe(true);
  });

  it('enables ADM on the local development server', () => {
    expect(resolveAdminActivation({ ...development, adminParam: null })).toBe(true);
    expect(resolveAdminActivation({ ...development, adminParam: '1' })).toBe(true);
  });

  it('honours the ?admin=0 kill switch even on admin/dev sessions', () => {
    expect(resolveAdminActivation({ ...development, adminParam: '0' })).toBe(false);
    expect(resolveAdminActivation({ ...adminBuild, adminParam: '0' })).toBe(false);
    expect(resolveAdminActivation({ ...development, adminParam: 'false' })).toBe(false);
  });

  it('keeps respecting an explicit VITE_ADMIN_MODE from .env.admin', () => {
    // `.env.admin` é carregado no modo admin, mas a variável também vale quando
    // o ambiente a define: 'true' liga e qualquer outro valor não liga.
    expect(resolveAdminActivation({
      mode: 'production',
      development: false,
      envValue: 'true',
      adminParam: null,
    })).toBe(true);
    expect(resolveAdminActivation({
      mode: 'development',
      development: true,
      envValue: 'false',
      adminParam: null,
    })).toBe(false);
  });
});
