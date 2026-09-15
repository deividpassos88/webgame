import { describe, expect, it } from 'vitest';
import * as BackpackExpansionModule from './BackpackExpansion';
import { InventoryStore } from './InventoryStore';
import { createDefaultPlayerProfile, type PlayerProfile } from '../profile/PlayerProfile';

describe('commitGuildTokenBackpackExpansion', () => {
  it('leaves capacity, tokens, profile, and the live inventory unchanged when persistence fails', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack = [{ itemId: 'guild-token', quantity: 30 }];
    profile.guildVault = [{ itemId: 'runic-crystal', quantity: 2 }];
    const inventory = InventoryStore.fromProfile(profile);
    const profileBefore = structuredClone(profile);
    const inventoryBefore = inventory.snapshot();
    const commitExpansion = (BackpackExpansionModule as unknown as {
      commitGuildTokenBackpackExpansion?: (
        profile: PlayerProfile,
        inventory: InventoryStore,
        persist: (candidate: PlayerProfile) => boolean
      ) => { kind: string };
    }).commitGuildTokenBackpackExpansion;

    if (typeof commitExpansion !== 'function') {
      expect(typeof commitExpansion).toBe('function');
      return;
    }

    const result = commitExpansion(profile, inventory, () => false);

    expect(result.kind).toBe('persistence-failed');
    expect(profile).toEqual(profileBefore);
    expect(profile.backpackCapacity).toBe(20);
    expect(profile.backpack).toEqual([{ itemId: 'guild-token', quantity: 30 }]);
    expect(inventory.snapshot()).toEqual(inventoryBefore);
  });
});
