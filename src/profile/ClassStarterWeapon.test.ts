import { describe, expect, it } from 'vitest';
import {
  classStarterWeaponId,
  createDefaultPlayerProfile,
  syncStarterWeaponToClass,
  type PlayerProfile,
} from './PlayerProfile';

function mageProfile(): PlayerProfile {
  const profile = createDefaultPlayerProfile();
  profile.selectedClass = 'mage';
  return profile;
}

describe('class starter weapons', () => {
  it('binds the sword to the Guerreiro and the cajado to the Maga', () => {
    expect(classStarterWeaponId('paladin')).toBe('starter-sword');
    expect(classStarterWeaponId('mage')).toBe('starter-staff');
  });

  it('swaps the default sword for the cajado when the Maga is chosen', () => {
    const profile = syncStarterWeaponToClass(mageProfile());

    expect(profile.backpack).toEqual([{ itemId: 'starter-staff', quantity: 1 }]);
    expect(profile.equipment.weapon).toBeNull();
    expect(profile.equipment.primaryWeapon).toBeNull();
  });

  it('keeps the Guerreiro untouched', () => {
    const profile = syncStarterWeaponToClass(createDefaultPlayerProfile());

    expect(profile.backpack).toEqual([{ itemId: 'starter-sword', quantity: 1 }]);
  });

  it('replaces an equipped sword with the equipped cajado instead of emptying the slot', () => {
    const profile = mageProfile();
    profile.backpack = [];
    profile.equipment.weapon = 'starter-sword';
    profile.equipment.primaryWeapon = 'starter-sword';

    const synced = syncStarterWeaponToClass(profile);

    expect(synced.equipment.weapon).toBe('starter-staff');
    expect(synced.equipment.primaryWeapon).toBe('starter-staff');
    expect(synced.backpack).toEqual([]);
  });

  it('never leaves a starter of the other class in the backpack', () => {
    const profile = mageProfile();
    profile.backpack = [
      { itemId: 'starter-sword', quantity: 1 },
      { itemId: 'guild-token', quantity: 5 },
    ];

    const synced = syncStarterWeaponToClass(profile);

    expect(synced.backpack).toEqual([
      { itemId: 'guild-token', quantity: 5 },
      { itemId: 'starter-staff', quantity: 1 },
    ]);
  });

  it('collapses duplicate starters to the single copy InventoryStore enforces', () => {
    const profile = mageProfile();
    profile.backpack = [
      { itemId: 'starter-staff', quantity: 1 },
      { itemId: 'starter-sword', quantity: 1 },
    ];

    const synced = syncStarterWeaponToClass(profile);

    expect(synced.backpack).toEqual([{ itemId: 'starter-staff', quantity: 1 }]);
  });

  it('leaves profiles without any starter untouched', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack = [{ itemId: 'guild-token', quantity: 5 }];

    const synced = syncStarterWeaponToClass(profile);

    expect(synced.backpack).toEqual([{ itemId: 'guild-token', quantity: 5 }]);
    expect(synced.equipment.primaryWeapon).toBeNull();
  });

  it('is idempotent for an already synced Maga profile', () => {
    const once = syncStarterWeaponToClass(mageProfile());
    const twice = syncStarterWeaponToClass(once);

    expect(twice).toEqual(once);
  });
});
