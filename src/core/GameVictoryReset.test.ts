import { describe, expect, it } from 'vitest';
import { InventoryStore } from '../inventory/InventoryStore';
import {
  createDefaultPlayerProfile,
  type PlayerProfile,
} from '../profile/PlayerProfile';
import { persistVictoryReset } from './Game';

function cloneProfile(profile: PlayerProfile): PlayerProfile {
  return JSON.parse(JSON.stringify(profile)) as PlayerProfile;
}

describe('Game victory reset', () => {
  it('persists the reset progression while preserving equipped and stored inventory', () => {
    const profile = createDefaultPlayerProfile();
    profile.equipment.weapon = 'starter-sword';
    profile.equipment.primaryWeapon = 'starter-sword';
    profile.backpack = [{ itemId: 'runic-crystal', quantity: 7 }];
    profile.backpackCapacity = 25;
    profile.guildVault = [{ itemId: 'guild-token', quantity: 3 }];
    profile.progression = { level: 3, experience: 220 };
    profile.attributes = {
      strength: 3,
      attack: 2,
      defense: 1,
      agility: 1,
      criticalAttack: 1,
      criticalMagic: 1,
      dodge: 0,
    };
    profile.attributePointsRemaining = 1;
    const inventory = InventoryStore.fromProfile(profile);
    const originalEquipment = cloneProfile(profile).equipment;
    const originalBackpack = cloneProfile(profile).backpack;
    const originalCapacity = profile.backpackCapacity;
    const originalVault = cloneProfile(profile).guildVault;
    let saved: PlayerProfile | undefined;

    const persisted = persistVictoryReset(profile, inventory, (candidate) => {
      saved = cloneProfile(candidate);
      return true;
    });

    expect(persisted).toBe(true);
    expect(saved).toMatchObject({
      progression: { level: 1, experience: 0 },
      attributes: {
        strength: 0,
        attack: 0,
        defense: 0,
        agility: 0,
        criticalAttack: 0,
        criticalMagic: 0,
        dodge: 0,
      },
      attributePointsRemaining: 0,
      equipment: originalEquipment,
      backpack: originalBackpack,
      backpackCapacity: originalCapacity,
      guildVault: originalVault,
    });
    expect(inventory.snapshot()).toMatchObject({
      capacity: originalCapacity,
      equipment: originalEquipment,
      backpack: originalBackpack,
    });
  });

  it('does not confirm the victory transition when the reset cannot be persisted', () => {
    const profile = createDefaultPlayerProfile();
    const inventory = InventoryStore.fromProfile(profile);

    expect(persistVictoryReset(profile, inventory, () => false)).toBe(false);
  });
});
