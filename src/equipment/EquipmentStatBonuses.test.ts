import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_SETS,
  activeEquipmentSet,
  attributesWithEquipment,
  describeSetBonus,
  equippedAttributeBonuses,
  equippedWeaponDamage,
  isEquipmentSetComplete,
} from './EquipmentStatBonuses';
import { createDefaultCharacterAttributes } from '../profile/CharacterAttributes';
import { createDefaultPlayerProfile, type PlayerEquipment } from '../profile/PlayerProfile';

const PREDATOR = EQUIPMENT_SETS.find((set) => set.id === 'predator')!;
const BULWARK = EQUIPMENT_SETS.find((set) => set.id === 'bulwark')!;

function equipmentOf(set: typeof PREDATOR): PlayerEquipment {
  return { ...createDefaultPlayerProfile().equipment, ...set.itemIds };
}

describe('forged equipment sets', () => {
  it('publishes one offensive and one defensive line, each with five pieces', () => {
    expect(EQUIPMENT_SETS.map((set) => set.id)).toEqual(['predator', 'bulwark']);
    for (const set of EQUIPMENT_SETS) {
      expect(Object.keys(set.itemIds)).toHaveLength(5);
      expect(Object.values(set.itemIds).every((itemId) => itemId.length > 0)).toBe(true);
    }
  });

  it('activates the offensive line and stacks its five-piece bonus on the pieces', () => {
    const equipment = equipmentOf(PREDATOR);

    expect(isEquipmentSetComplete(equipment, PREDATOR)).toBe(true);
    expect(activeEquipmentSet(equipment)?.id).toBe('predator');
    // Pieces: 2+4+3+3+2 attack, 3+2 critical, 4+3 critical damage, 2 life steal.
    // Set: +6 attack, +8 critical, +12 critical damage, +4 life steal.
    expect(equippedAttributeBonuses(equipment)).toMatchObject({
      vitality: 0,
      attack: 20,
      defense: 0,
      agility: 0,
      criticalAttack: 13,
      criticalDamage: 19,
      lifeSteal: 6,
    });
  });

  it('activates the defensive line with health, mitigation and dodge', () => {
    const equipment = equipmentOf(BULWARK);

    expect(activeEquipmentSet(equipment)?.id).toBe('bulwark');
    // Pieces: 4+6+5+3+4 vitality, 3+5+4+3 defense, 3 dodge.
    // Set: +14 vitality, +16 defense, +8 dodge.
    expect(equippedAttributeBonuses(equipment)).toMatchObject({
      vitality: 36,
      defense: 31,
      agility: 0,
      dodge: 11,
      attack: 0,
    });
  });

  it('grants no set bonus while a single piece is missing', () => {
    const equipment = equipmentOf(PREDATOR);
    equipment.boots = null;

    expect(isEquipmentSetComplete(equipment, PREDATOR)).toBe(false);
    expect(activeEquipmentSet(equipment)).toBeNull();
    // Only the four worn pieces count: 2+4+3+3 attack, 2+3+3 critical.
    expect(equippedAttributeBonuses(equipment)).toMatchObject({
      attack: 12,
      criticalAttack: 5,
      criticalDamage: 7,
      lifeSteal: 0,
    });
  });

  it('keeps legacy common forged pieces valid gear without a set bonus', () => {
    const equipment: PlayerEquipment = {
      ...createDefaultPlayerProfile().equipment,
      helmet: 'common-forged-helmet',
      chest: 'common-forged-chest',
      pants: 'common-forged-pants',
      gloves: 'common-forged-gloves',
      boots: 'common-forged-boots',
    };

    expect(activeEquipmentSet(equipment)).toBeNull();
    // The old pieces keep their own stats, including the vitality inherited
    // from the retired strength bonus.
    expect(equippedAttributeBonuses(equipment)).toMatchObject({
      vitality: 1, attack: 3, defense: 9, agility: 4,
    });
  });

  it('adds equipment bonuses on top of the allocated attributes', () => {
    const attributes = { ...createDefaultCharacterAttributes(), vitality: 20, attack: 10 };
    const total = attributesWithEquipment(attributes, equipmentOf(BULWARK));

    expect(total.vitality).toBe(56);
    expect(total.attack).toBe(10);
    expect(total.defense).toBe(31);
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

  it('describes the bonus with the same labels the UI shows', () => {
    const label = (key: string) => ({ attack: 'Ataque', criticalAttack: 'Crítico físico' }[key] ?? key);

    expect(describeSetBonus(PREDATOR, label)).toContain('Ataque +6');
    expect(describeSetBonus(PREDATOR, label)).toContain('Crítico físico +8');
  });
});
