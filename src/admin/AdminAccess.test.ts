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
  it('leaves the public build without admin tools', () => {
    expect(resolveAdminEnabled({
      adminParam: null,
      mode: 'production',
      viteAdminMode: undefined,
      development: false,
    })).toBe(false);
    // `?admin=1` não transforma um bundle público em painel ADM.
    expect(resolveAdminEnabled({
      adminParam: '1',
      mode: 'production',
      viteAdminMode: undefined,
      development: false,
    })).toBe(false);
  });

  it('enables the admin build, the dev server and VITE_ADMIN_MODE=true', () => {
    expect(resolveAdminEnabled({
      adminParam: null,
      mode: 'admin',
      viteAdminMode: undefined,
      development: false,
    })).toBe(true);
    expect(resolveAdminEnabled({
      adminParam: null,
      mode: 'development',
      viteAdminMode: undefined,
      development: true,
    })).toBe(true);
    expect(resolveAdminEnabled({
      adminParam: null,
      mode: 'production',
      viteAdminMode: 'true',
      development: false,
    })).toBe(true);
  });

  it('lets the URL and the env file turn the tools off', () => {
    expect(resolveAdminEnabled({
      adminParam: '0',
      mode: 'admin',
      viteAdminMode: 'true',
      development: true,
    })).toBe(false);
    expect(resolveAdminEnabled({
      adminParam: 'false',
      mode: 'development',
      viteAdminMode: undefined,
      development: true,
    })).toBe(false);
    expect(resolveAdminEnabled({
      adminParam: '1',
      mode: 'development',
      viteAdminMode: 'false',
      development: true,
    })).toBe(false);
  });
});
