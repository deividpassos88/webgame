import { describe, expect, it } from 'vitest';
import { createDefaultPlayerProfile } from '../profile/PlayerProfile';
import { prepareGuildTokenBackpackExpansion } from './BackpackExpansion';
import { InventoryStore } from './InventoryStore';

describe('prepareGuildTokenBackpackExpansion', () => {
  it('spends thirty Guild Tokens across the backpack and Guild Vault to add five slots', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack = [
      { itemId: 'guild-token', quantity: 12 },
      { itemId: 'runic-crystal', quantity: 7 },
    ];
    profile.guildVault = [{ itemId: 'guild-token', quantity: 18 }];
    const inventory = InventoryStore.fromProfile(profile).snapshot();

    expect(prepareGuildTokenBackpackExpansion(profile, inventory)).toEqual({
      kind: 'expanded',
      backpackCapacity: 25,
      backpack: [{ itemId: 'runic-crystal', quantity: 7 }],
      guildVault: [],
    });
  });

  it('spends backpack Guild Tokens before drawing from the Guild Vault', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack = [{ itemId: 'guild-token', quantity: 40 }];
    profile.guildVault = [{ itemId: 'guild-token', quantity: 10 }];
    const inventory = InventoryStore.fromProfile(profile).snapshot();

    expect(prepareGuildTokenBackpackExpansion(profile, inventory)).toEqual({
      kind: 'expanded',
      backpackCapacity: 25,
      backpack: [{ itemId: 'guild-token', quantity: 10 }],
      guildVault: [{ itemId: 'guild-token', quantity: 10 }],
    });
  });

  it('returns the unchanged state when the combined balance is one Token short', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack = [{ itemId: 'guild-token', quantity: 12 }];
    profile.guildVault = [{ itemId: 'guild-token', quantity: 17 }];
    const inventory = InventoryStore.fromProfile(profile).snapshot();

    expect(prepareGuildTokenBackpackExpansion(profile, inventory)).toEqual({
      kind: 'insufficient-guild-tokens',
      backpackCapacity: 20,
      backpack: [{ itemId: 'guild-token', quantity: 12 }],
      guildVault: [{ itemId: 'guild-token', quantity: 17 }],
    });
  });

  it('returns the unchanged state at the sixty-slot maximum', () => {
    const profile = { ...createDefaultPlayerProfile(), backpackCapacity: 60 };
    profile.backpack = [{ itemId: 'guild-token', quantity: 30 }];
    const inventory = InventoryStore.fromProfile(profile).snapshot();

    expect(prepareGuildTokenBackpackExpansion(profile, inventory)).toEqual({
      kind: 'capacity-maximum',
      backpackCapacity: 60,
      backpack: [{ itemId: 'guild-token', quantity: 30 }],
      guildVault: [],
    });
  });

  it('does not mutate the profile or inventory snapshot while preparing a purchase', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack = [{ itemId: 'guild-token', quantity: 30 }];
    profile.guildVault = [{ itemId: 'guild-token', quantity: 1 }];
    const inventory = InventoryStore.fromProfile(profile).snapshot();
    const profileBefore = structuredClone(profile);
    const inventoryBefore = structuredClone(inventory);

    prepareGuildTokenBackpackExpansion(profile, inventory);

    expect(profile).toEqual(profileBefore);
    expect(inventory).toEqual(inventoryBefore);
  });
});
