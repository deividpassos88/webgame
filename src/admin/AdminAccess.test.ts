import { describe, expect, it } from 'vitest';
import { resolveDevAdminAccess } from './AdminAccess';

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
