import { describe, expect, it } from 'vitest';
import { AdminCommandGate, type AdminCommand } from './AdminCommandGate';

describe('AdminCommandGate', () => {
  it('does not dispatch commands from an unauthorized session', () => {
    const calls: AdminCommand[] = [];
    const gate = new AdminCommandGate(false);

    expect(gate.dispatch({ type: 'jump-wave', wave: 3 }, command => calls.push(command))).toBe(false);
    expect(calls).toEqual([]);
  });

  it('dispatches commands from an authorized session', () => {
    const calls: AdminCommand[] = [];
    const gate = new AdminCommandGate(true);

    expect(gate.dispatch({ type: 'immortality', enabled: true }, command => calls.push(command))).toBe(true);
    expect(calls).toEqual([{ type: 'immortality', enabled: true }]);
  });
});
