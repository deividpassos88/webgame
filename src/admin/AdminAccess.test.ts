import { describe, expect, it } from 'vitest';
import { resolveAdminEnabled, resolveDevAdminAccess } from './AdminAccess';

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

describe('resolveAdminEnabled', () => {
  const productionBuild = { mode: 'production', development: false } as const;
  const adminBuild = { mode: 'admin', development: false } as const;
  const devServer = { mode: 'development', development: true } as const;

  it('liga o ADM no build ADMIN sem precisar de .env nem de ?admin=1', () => {
    expect(resolveAdminEnabled({ ...adminBuild, envFlag: undefined, urlParam: null })).toBe(true);
    expect(resolveAdminEnabled({ ...adminBuild, envFlag: undefined, urlParam: '1' })).toBe(true);
    expect(resolveAdminEnabled({ ...adminBuild, envFlag: undefined, urlParam: 'true' })).toBe(true);
  });

  it('liga o ADM no vite dev por padrao', () => {
    expect(resolveAdminEnabled({ ...devServer, envFlag: undefined, urlParam: null })).toBe(true);
  });

  it('mantem o build publico desligado mesmo com ?admin=1 na URL', () => {
    expect(resolveAdminEnabled({ ...productionBuild, envFlag: undefined, urlParam: null })).toBe(false);
    expect(resolveAdminEnabled({ ...productionBuild, envFlag: undefined, urlParam: '1' })).toBe(false);
    expect(resolveAdminEnabled({ ...productionBuild, envFlag: undefined, urlParam: 'true' })).toBe(false);
  });

  it('trata ?admin=0/false como kill switch mesmo no build ADMIN e no dev', () => {
    expect(resolveAdminEnabled({ ...adminBuild, envFlag: undefined, urlParam: '0' })).toBe(false);
    expect(resolveAdminEnabled({ ...adminBuild, envFlag: undefined, urlParam: 'false' })).toBe(false);
    expect(resolveAdminEnabled({ ...devServer, envFlag: 'true', urlParam: '0' })).toBe(false);
  });

  it('respeita VITE_ADMIN_MODE explicito', () => {
    expect(resolveAdminEnabled({ ...productionBuild, envFlag: 'true', urlParam: null })).toBe(true);
    expect(resolveAdminEnabled({ ...adminBuild, envFlag: 'false', urlParam: null })).toBe(false);
    expect(resolveAdminEnabled({ ...devServer, envFlag: 'false', urlParam: null })).toBe(false);
  });

  it('nao liga o ADM por um valor inesperado de ?admin=', () => {
    expect(resolveAdminEnabled({ ...productionBuild, envFlag: undefined, urlParam: 'yes' })).toBe(false);
    expect(resolveAdminEnabled({ ...adminBuild, envFlag: undefined, urlParam: 'yes' })).toBe(true);
  });
});
