import { describe, expect, it, vi } from 'vitest';
import { AdminCommandGate } from './AdminCommandGate';
import { AdminGameActions, type AdminGamePorts } from './AdminGameActions';
import { createDefaultPlayerProfile } from '../profile/PlayerProfile';
import { InventoryStore } from '../inventory/InventoryStore';

function createPorts(): AdminGamePorts {
  const profile = createDefaultPlayerProfile();
  return {
    preparePhaseChange: vi.fn(),
    startWave: vi.fn(),
    startBoss: vi.fn(),
    hitkillBoss: vi.fn(() => true),
    setImmortal: vi.fn(),
    setAdminCamera: vi.fn(),
    profile,
    inventory: InventoryStore.fromProfile(profile),
    persistProfileState: vi.fn(() => true),
  };
}

describe('AdminGameActions', () => {
  it('cleans the current phase before jumping to a selected wave', () => {
    const ports = createPorts();
    const actions = new AdminGameActions(ports, new AdminCommandGate(true));

    expect(actions.execute({ type: 'jump-wave', wave: 4 })).toEqual({ ok: true });
    expect(ports.preparePhaseChange).toHaveBeenCalledOnce();
    expect(ports.startWave).toHaveBeenCalledWith(4);
    expect(vi.mocked(ports.preparePhaseChange).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(ports.startWave).mock.invocationCallOrder[0]);
  });

  it('cleans the current phase before jumping to the boss', () => {
    const ports = createPorts();
    const actions = new AdminGameActions(ports, new AdminCommandGate(true));

    expect(actions.execute({ type: 'jump-boss' })).toEqual({ ok: true });
    expect(ports.preparePhaseChange).toHaveBeenCalledOnce();
    expect(ports.startBoss).toHaveBeenCalledOnce();
  });

  it('forwards toggles and reports when no living boss can receive hitkill', () => {
    const ports = createPorts();
    const actions = new AdminGameActions(ports, new AdminCommandGate(true));

    expect(actions.execute({ type: 'immortality', enabled: true })).toEqual({ ok: true });
    expect(actions.execute({ type: 'admin-camera', enabled: true })).toEqual({ ok: true });
    expect(ports.setImmortal).toHaveBeenCalledWith(true);
    expect(ports.setAdminCamera).toHaveBeenCalledWith(true);

    vi.mocked(ports.hitkillBoss).mockReturnValue(false);
    expect(actions.execute({ type: 'hitkill-boss' })).toEqual({ ok: false, reason: 'unavailable' });
  });
});
