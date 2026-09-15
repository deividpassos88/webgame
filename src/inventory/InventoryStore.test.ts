import { describe, expect, it } from 'vitest';
import { createDefaultPlayerProfile } from '../profile/PlayerProfile';
import { InventoryStore } from './InventoryStore';
import { LootContainerState } from './LootContainerState';

describe('InventoryStore', () => {
  it('uses 20 backpack positions by default', () => {
    expect(InventoryStore.empty().snapshot()).toMatchObject({
      capacity: 20,
      usedSlots: 0,
      backpack: [],
    });
  });

  it('merges materials before consuming a new slot', () => {
    const store = InventoryStore.empty();

    expect(store.add({ itemId: 'runic-crystal', quantity: 4 })).toEqual({
      accepted: 4,
      remaining: 0,
      reason: null,
    });
    expect(store.add({ itemId: 'runic-crystal', quantity: 3 })).toEqual({
      accepted: 3,
      remaining: 0,
      reason: null,
    });
    expect(store.snapshot().backpack).toEqual([
      { itemId: 'runic-crystal', quantity: 7 },
    ]);
    expect(store.snapshot().usedSlots).toBe(1);
  });

  it('leaves container contents untouched when the backpack is full', () => {
    const store = InventoryStore.empty(1);
    store.add({ itemId: 'iron-shard', quantity: 1 });
    const container = new LootContainerState('urn-1', [
      { itemId: 'runic-crystal', quantity: 3 },
    ]);

    expect(store.transferFrom(container, 'runic-crystal', 3)).toEqual({
      accepted: 0,
      remaining: 3,
      reason: 'backpack-full',
    });
    expect(container.snapshot().items).toEqual([
      { itemId: 'runic-crystal', quantity: 3 },
    ]);
  });

  it('transfers only the available quantity and preserves the remainder', () => {
    const store = InventoryStore.empty();
    const container = new LootContainerState('chest-1', [
      { itemId: 'runic-crystal', quantity: 7 },
    ]);

    expect(store.transferFrom(container, 'runic-crystal', 3)).toEqual({
      accepted: 3,
      remaining: 0,
      reason: null,
    });
    expect(container.snapshot().items).toEqual([
      { itemId: 'runic-crystal', quantity: 4 },
    ]);
  });

  it('moves only compatible backpack items into equipment slots', () => {
    const store = InventoryStore.empty();
    store.add({ itemId: 'iron-helmet', quantity: 1 });

    expect(store.equip(0, 'weapon')).toEqual({ kind: 'incompatible-slot' });
    expect(store.equip(0, 'helmet')).toEqual({ kind: 'equipped' });
    expect(store.snapshot().equipment.helmet).toBe('iron-helmet');
    expect(store.snapshot().backpack).toEqual([]);
  });

  it('keeps the starter sword in a new profile backpack until it is equipped', () => {
    const store = InventoryStore.fromProfile(createDefaultPlayerProfile());

    expect(store.snapshot().equipment.weapon).toBeNull();
    expect(store.snapshot().equipment.primaryWeapon).toBeNull();
    expect(store.snapshot().equipment.secondaryWeapon).toBeNull();
    expect(store.snapshot().backpack).toEqual([{ itemId: 'starter-sword', quantity: 1 }]);

    expect(store.equip(0, 'weapon')).toEqual({ kind: 'equipped' });
    expect(store.snapshot().equipment.primaryWeapon).toBe('starter-sword');
    expect(store.snapshot().backpack).toEqual([]);
    expect(store.toProfileInventory()).toEqual({
      equipment: {
        ...createDefaultPlayerProfile().equipment,
        weapon: 'starter-sword',
        primaryWeapon: 'starter-sword',
      },
      backpack: [],
    });
  });

  it('returns equipped weapons to the backpack when they are unequipped', () => {
    const store = InventoryStore.fromProfile(createDefaultPlayerProfile());

    store.equip(0, 'weapon');

    expect(store.unequip('weapon')).toEqual({ kind: 'unequipped' });
    expect(store.snapshot().equipment.weapon).toBeNull();
    expect(store.snapshot().equipment.primaryWeapon).toBeNull();
    expect(store.snapshot().backpack).toEqual([{ itemId: 'starter-sword', quantity: 1 }]);
  });

  it('repairs duplicate starter swords left by an older save', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack = Array.from({ length: 5 }, () => ({ itemId: 'starter-sword', quantity: 1 }));

    const store = InventoryStore.fromProfile(profile);

    expect(store.snapshot().backpack).toEqual([{ itemId: 'starter-sword', quantity: 1 }]);
  });

  it('repairs the old partially unequipped sword state without losing the item', () => {
    const profile = createDefaultPlayerProfile();
    profile.equipment.weapon = 'starter-sword';
    profile.equipment.primaryWeapon = null;
    profile.backpack = Array.from({ length: 5 }, () => ({ itemId: 'starter-sword', quantity: 1 }));

    const store = InventoryStore.fromProfile(profile);

    expect(store.snapshot().equipment.weapon).toBeNull();
    expect(store.snapshot().equipment.primaryWeapon).toBeNull();
    expect(store.snapshot().backpack).toEqual([{ itemId: 'starter-sword', quantity: 1 }]);
  });

  it('adds a complete valid catalog stack by item id and quantity', () => {
    const store = InventoryStore.empty();

    expect(store.add('guild-token', 30)).toEqual({ ok: true });
    expect(store.snapshot().backpack).toEqual([{ itemId: 'guild-token', quantity: 30 }]);
  });

  it('rejects unknown or invalid requested stacks without changing the inventory snapshot', () => {
    const store = InventoryStore.empty();
    const before = store.snapshot();

    expect(store.add('not-in-the-catalog', 1)).toEqual({ ok: false, reason: 'unknown-item' });
    expect(store.snapshot()).toEqual(before);

    expect(store.add('guild-token', 1.5)).toEqual({ ok: false, reason: 'invalid-quantity' });
    expect(store.snapshot()).toEqual(before);

    expect(store.add('guild-token', 0)).toEqual({ ok: false, reason: 'invalid-quantity' });
    expect(store.snapshot()).toEqual(before);

    expect(store.add('guild-token', -1)).toEqual({ ok: false, reason: 'invalid-quantity' });
    expect(store.snapshot()).toEqual(before);
  });

  it('rejects additions that would exceed a stack limit or backpack capacity atomically', () => {
    const store = InventoryStore.empty(1);
    const before = store.snapshot();

    expect(store.add('runic-crystal', 100)).toEqual({ ok: false, reason: 'stack-limit' });
    expect(store.snapshot()).toEqual(before);

    expect(store.add('runic-crystal', 99)).toEqual({ ok: true });
    const fullBackpack = store.snapshot();
    expect(store.add('iron-shard', 1)).toEqual({ ok: false, reason: 'backpack-full' });
    expect(store.snapshot()).toEqual(fullBackpack);
  });

  it('uses the capacity persisted on the player profile', () => {
    const profile = { ...createDefaultPlayerProfile(), backpackCapacity: 25 };

    expect(InventoryStore.fromProfile(profile).snapshot().capacity).toBe(25);
  });

  it('commits an expanded profile into the existing store instance', () => {
    const store = InventoryStore.fromProfile(createDefaultPlayerProfile());
    const expanded = {
      ...createDefaultPlayerProfile(),
      backpackCapacity: 25,
      backpack: [{ itemId: 'runic-crystal', quantity: 7 }],
    };

    store.commitProfile(expanded);

    expect(store.snapshot()).toMatchObject({
      capacity: 25,
      backpack: [{ itemId: 'runic-crystal', quantity: 7 }],
    });
  });

  it('keeps the canonical primary weapon synchronized when equipping a weapon', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack.push({ itemId: 'starter-sword', quantity: 1 });
    profile.equipment.weapon = null;
    profile.equipment.primaryWeapon = null;
    const store = InventoryStore.fromProfile(profile);

    expect(store.equip(0, 'weapon')).toEqual({ kind: 'equipped' });
    expect(store.snapshot().equipment.primaryWeapon).toBe('starter-sword');
  });
});
