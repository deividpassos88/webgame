import { describe, expect, it } from 'vitest';
import { InventoryStore } from '../inventory/InventoryStore';
import { createDefaultPlayerProfile, type PlayerProfile } from '../profile/PlayerProfile';
import { AdminCommandGate } from './AdminCommandGate';
import { AdminGameActions, type AdminGamePorts } from './AdminGameActions';

function createPorts(
  profile: PlayerProfile,
  inventory: InventoryStore,
  persistProfileState: () => boolean
): AdminGamePorts {
  return {
    preparePhaseChange: () => undefined,
    startWave: () => undefined,
    startBoss: () => undefined,
    hitkillBoss: () => true,
    setImmortal: () => undefined,
    setAdminCamera: () => undefined,
    spawnTestEnemy: () => true,
    clearTestEnemies: () => undefined,
    inventory,
    profile,
    persistProfileState,
  };
}

describe('Admin inventory injection', () => {
  it('rejects an inventory command from an unauthorized session without mutating the backpack', () => {
    const profile = createDefaultPlayerProfile();
    const inventory = InventoryStore.fromProfile(profile);
    let persistenceAttempts = 0;
    const actions = new AdminGameActions(
      createPorts(profile, inventory, () => {
        persistenceAttempts++;
        return true;
      }),
      new AdminCommandGate(false)
    );
    const before = inventory.snapshot();

    expect(actions.execute({
      type: 'add-inventory-item', itemId: 'guild-token', quantity: 30,
    })).toEqual({ ok: false, reason: 'unauthorized' });
    expect(inventory.snapshot()).toEqual(before);
    expect(profile.backpack).toEqual(before.backpack);
    expect(persistenceAttempts).toBe(0);
  });

  it('persists an authorized catalog stack through the profile snapshot', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack = [];
    const inventory = InventoryStore.fromProfile(profile);
    const persistedBackpacks: PlayerProfile['backpack'][] = [];
    const actions = new AdminGameActions(
      createPorts(profile, inventory, () => {
        persistedBackpacks.push(profile.backpack.map((stack) => ({ ...stack })));
        return true;
      }),
      new AdminCommandGate(true)
    );

    expect(actions.execute({
      type: 'add-inventory-item', itemId: 'guild-token', quantity: 30,
    })).toEqual({ ok: true });
    expect(profile.backpack).toEqual([{ itemId: 'guild-token', quantity: 30 }]);
    expect(inventory.snapshot().backpack).toEqual([{ itemId: 'guild-token', quantity: 30 }]);
    expect(persistedBackpacks).toEqual([[{ itemId: 'guild-token', quantity: 30 }]]);
  });

  it('restores the profile and inventory snapshots when persistence fails', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack = [];
    const inventory = InventoryStore.fromProfile(profile);
    const persistedBackpacks: PlayerProfile['backpack'][] = [];
    const actions = new AdminGameActions(
      createPorts(profile, inventory, () => {
        persistedBackpacks.push(profile.backpack.map((stack) => ({ ...stack })));
        return false;
      }),
      new AdminCommandGate(true)
    );

    expect(actions.execute({
      type: 'add-inventory-item', itemId: 'guild-token', quantity: 30,
    })).toEqual({ ok: false, reason: 'persistence-failed' });
    expect(persistedBackpacks).toEqual([[{ itemId: 'guild-token', quantity: 30 }]]);
    expect(profile.backpack).toEqual([]);
    expect(inventory.snapshot().backpack).toEqual([]);
  });

  it('preserves a full backpack when the requested catalog stack cannot fit', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpackCapacity = 1;
    const inventory = InventoryStore.fromProfile(profile);
    let persistenceAttempts = 0;
    const actions = new AdminGameActions(
      createPorts(profile, inventory, () => {
        persistenceAttempts++;
        return true;
      }),
      new AdminCommandGate(true)
    );
    const before = inventory.snapshot();

    expect(actions.execute({
      type: 'add-inventory-item', itemId: 'guild-token', quantity: 30,
    })).toEqual({ ok: false, reason: 'backpack-full' });
    expect(inventory.snapshot()).toEqual(before);
    expect(profile.backpack).toEqual(before.backpack);
    expect(persistenceAttempts).toBe(0);
  });
});
