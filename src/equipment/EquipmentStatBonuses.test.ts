import { describe, expect, it } from 'vitest';
import {
  attributesWithEquipment,
  equippedAttributeBonuses,
  equippedForgedSetLine,
  equippedWeaponDamage,
  FORGED_SET_BONUS,
  hasCommonForgedSet,
} from './EquipmentStatBonuses';
import { createDefaultCharacterAttributes } from '../profile/CharacterAttributes';
import { createDefaultPlayerProfile, type PlayerEquipment } from '../profile/PlayerProfile';

function dragonicSet(suffix = ''): PlayerEquipment {
  return {
    ...createDefaultPlayerProfile().equipment,
    helmet: `common-forged-helmet${suffix}`,
    chest: `common-forged-chest${suffix}`,
    pants: `common-forged-pants${suffix}`,
    gloves: `common-forged-gloves${suffix}`,
    boots: `common-forged-boots${suffix}`,
  };
}

describe('Dragonic equipment set bonuses', () => {
  it('adds the five-piece bonus only when the whole set is worn', () => {
    const equipment = dragonicSet();

    expect(hasCommonForgedSet(equipment)).toBe(true);
    expect(equippedForgedSetLine(equipment)).toBe('defense');
    // Pieces (DEF): defense 3+5+4+3+3, vitality 1+1+1, agility 1+2.
    // Set (DEF): +2 vitality, +7 defense, +1 agility.
    expect(equippedAttributeBonuses(equipment)).toMatchObject({
      vitality: 5,
      defense: 25,
      agility: 4,
    });
  });

  it('adds the offensive five-piece bonus when the whole ATK set is worn', () => {
    const equipment = dragonicSet('-atk');

    expect(equippedForgedSetLine(equipment)).toBe('attack');
    // Pieces (ATK): attack 3+4+3+4+3, vitality 1, agility 1+2+2.
    // Set (ATK): +1 vitality, +7 attack, +2 agility.
    expect(equippedAttributeBonuses(equipment)).toMatchObject({
      vitality: 2,
      attack: 24,
      agility: 7,
    });
  });

  it('grants no set bonus while the armor mixes the two lines', () => {
    const equipment = dragonicSet();
    equipment.gloves = 'common-forged-gloves-atk';

    expect(equippedForgedSetLine(equipment)).toBeNull();
    expect(hasCommonForgedSet(equipment)).toBe(false);
  });

  it('grants piece stats without the set bonus while one slot is empty', () => {
    const equipment = dragonicSet();
    equipment.boots = null;

    expect(hasCommonForgedSet(equipment)).toBe(false);
    // Only the four worn pieces count: vitality 1+1+1, defense 3+5+4+3, agility 1.
    expect(equippedAttributeBonuses(equipment)).toMatchObject({
      vitality: 3,
      defense: 15,
      agility: 1,
    });
  });

  it('keeps the retired strength bonus out of the new attribute set', () => {
    for (const bonus of Object.values(FORGED_SET_BONUS)) {
      expect(bonus).not.toHaveProperty('strength');
    }
    // Each line leans on its own attribute and never grants both at once.
    expect(FORGED_SET_BONUS.defense.defense ?? 0).toBeGreaterThan(FORGED_SET_BONUS.defense.attack ?? 0);
    expect(FORGED_SET_BONUS.attack.attack ?? 0).toBeGreaterThan(FORGED_SET_BONUS.attack.defense ?? 0);
  });

  it('adds equipment bonuses on top of the allocated attributes', () => {
    const attributes = { ...createDefaultCharacterAttributes(), vitality: 20, attack: 10 };
    const total = attributesWithEquipment(attributes, dragonicSet());

    // 20 allocated vitality + 5 from the DEF set, 10 attack, 25 defense.
    expect(total.vitality).toBe(25);
    expect(total.attack).toBe(10);
    expect(total.defense).toBe(25);
  });

  it('resolves the equipped weapon damage shared by the sheet and the fight', () => {
    const equipment = { ...createDefaultPlayerProfile().equipment, weapon: 'starter-sword' };

    expect(equippedWeaponDamage(equipment)).toBe(5);
    // The legacy mirror cannot add the same sword twice, and unequipping it
    // takes the damage back to zero.
    expect(equippedWeaponDamage({ ...equipment, primaryWeapon: 'starter-sword' })).toBe(5);
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
