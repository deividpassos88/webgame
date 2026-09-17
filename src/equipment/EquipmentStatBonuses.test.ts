import { describe, expect, it } from 'vitest';
import {
  COMMON_FORGED_SET_BONUS,
  attributesWithEquipment,
  equippedAttributeBonuses,
  equippedWeaponDamage,
  hasCommonForgedSet,
} from './EquipmentStatBonuses';
import { createDefaultCharacterAttributes } from '../profile/CharacterAttributes';
import { createDefaultPlayerProfile, type PlayerEquipment } from '../profile/PlayerProfile';

function draconicSet(): PlayerEquipment {
  return {
    ...createDefaultPlayerProfile().equipment,
    helmet: 'common-forged-helmet',
    chest: 'common-forged-chest',
    pants: 'common-forged-pants',
    gloves: 'common-forged-gloves',
    boots: 'common-forged-boots',
  };
}

describe('Draconic equipment set bonuses', () => {
  it('adds the five-piece bonus only when the whole set is worn', () => {
    const equipment = draconicSet();

    expect(hasCommonForgedSet(equipment)).toBe(true);
    // Pieces: 1 vitality, 2+4+3 defense, 1 agility, 3 attack, 3 agility.
    // Set: +1 vitality, +2 attack, +3 defense, +2 agility.
    expect(equippedAttributeBonuses(equipment)).toMatchObject({
      vitality: 2,
      attack: 5,
      defense: 12,
      agility: 6,
    });
  });

  it('grants piece stats without the set bonus while one slot is empty', () => {
    const equipment = draconicSet();
    equipment.boots = null;

    expect(hasCommonForgedSet(equipment)).toBe(false);
    // Only the four worn pieces count: 1 vitality, defense 2+4+3, agility 1 + 3 attack.
    expect(equippedAttributeBonuses(equipment)).toMatchObject({
      vitality: 1,
      attack: 3,
      defense: 9,
      agility: 1,
    });
  });

  it('keeps the retired strength bonus out of the new attribute set', () => {
    expect(COMMON_FORGED_SET_BONUS).not.toHaveProperty('strength');
    expect(Object.keys(COMMON_FORGED_SET_BONUS).sort()).toEqual([
      'agility', 'attack', 'defense', 'vitality',
    ]);
  });

  it('adds equipment bonuses on top of the allocated attributes', () => {
    const attributes = { ...createDefaultCharacterAttributes(), vitality: 20, attack: 10 };
    const total = attributesWithEquipment(attributes, draconicSet());

    expect(total.vitality).toBe(22);
    expect(total.attack).toBe(15);
    expect(total.defense).toBe(12);
  });

  it('resolves the equipped weapon damage shared by the sheet and the fight', () => {
    const equipment = { ...createDefaultPlayerProfile().equipment, weapon: 'starter-sword' };

    expect(equippedWeaponDamage(equipment)).toBe(8);
    // The legacy mirror cannot add the same sword twice, and unequipping it
    // takes the damage back to zero.
    expect(equippedWeaponDamage({ ...equipment, primaryWeapon: 'starter-sword' })).toBe(8);
    expect(equippedWeaponDamage({ ...equipment, weapon: null })).toBe(0);
    expect(equippedWeaponDamage({ ...equipment, weapon: 'runic-crystal' })).toBe(0);
  });

  it('keeps a mirrored legacy weapon slot from changing attribute bonuses', () => {
    const base = { ...createDefaultPlayerProfile().equipment, helmet: 'common-forged-helmet' };
    const single = { ...base, weapon: 'starter-sword' };
    const mirrored: PlayerEquipment = { ...single, primaryWeapon: 'starter-sword' };

    expect(equippedAttributeBonuses(mirrored)).toEqual(equippedAttributeBonuses(single));
    expect(equippedAttributeBonuses(mirrored).attack).toBe(0);
  });
});
