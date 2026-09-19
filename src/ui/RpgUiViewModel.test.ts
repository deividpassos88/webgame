import { describe, expect, it } from 'vitest';
import { createDefaultPlayerProfile } from '../profile/PlayerProfile';
import { createDefaultCharacterAttributes } from '../profile/CharacterAttributes';
import { InventoryStore } from '../inventory/InventoryStore';
import { buildRpgUiViewModel } from './RpgUiViewModel';

describe('RpgUiViewModel', () => {
  it('exposes the approved seven-slot silhouette, twenty backpack slots and five skills', () => {
    const profile = createDefaultPlayerProfile();
    const view = buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot());

    expect(view.equipment.map(({ slot }) => slot)).toEqual([
      'helmet', 'chest', 'pants', 'gloves', 'boots', 'secondaryWeapon', 'primaryWeapon',
    ]);
    expect(view.backpack).toHaveLength(20);
    expect(view.skills).toHaveLength(5);
    expect(view.skills.every((skill) => skill.stars.length === 5)).toBe(true);
    expect(view.skills.every((skill) => skill.stars.filter(Boolean).length === 1)).toBe(true);
  });

  it('keeps the starter sword in a new profile backpack until the player equips it', () => {
    const profile = createDefaultPlayerProfile();
    const store = InventoryStore.fromProfile(profile);
    store.add({ itemId: 'runic-crystal', quantity: 4 });
    const view = buildRpgUiViewModel(profile, store.snapshot());

    expect(view.equipment.find(({ slot }) => slot === 'helmet')?.item).toBeNull();
    expect(view.equipment.find(({ slot }) => slot === 'primaryWeapon')?.item).toBeNull();
    expect(view.equipment.find(({ slot }) => slot === 'secondaryWeapon')?.item).toBeNull();
    expect(view.backpack[0]?.item?.label).toBe('Sword Novice');
    expect(view.backpack[0]?.quantity).toBe(1);
    expect(view.backpack[1]?.item?.label).toBe('Cristal Rúnico');
    expect(view.backpack[1]?.quantity).toBe(4);
  });

  it('exposes the persisted current character status for the lobby', () => {
    const profile = createDefaultPlayerProfile();
    profile.progression = { level: 3, experience: 220 };
    profile.attributePointsRemaining = 4;
    profile.attributes = {
      vitality: 9,
      attack: 8,
      defense: 7,
      agility: 6,
      criticalAttack: 5,
      criticalDamage: 4,
      lifeSteal: 3,
      criticalMagic: 2,
      dodge: 1,
    };

    const view = buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot());

    expect(view).toMatchObject({
      currentStatus: {
        level: 3,
        attributePointsRemaining: 4,
        attributes: [
          { label: 'Vitalidade', value: 9 },
          { label: 'Ataque', value: 8 },
          { label: 'Defesa', value: 7 },
          { label: 'Agilidade', value: 6 },
          { label: 'Crítico físico', value: 5 },
          { label: 'Dano crítico', value: 4 },
          { label: 'Roubo de vida', value: 3 },
          { label: 'Crítico mágico', value: 2 },
          { label: 'Esquiva', value: 1 },
        ],
      },
    });
  });

  it('resolves the derived combat numbers from the equipped weapon and armor', () => {
    const profile = createDefaultPlayerProfile();
    profile.attributes = { ...createDefaultCharacterAttributes(), vitality: 10, attack: 5 };

    const unarmed = buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot());
    expect(unarmed.currentStatus.derived.maxHealth).toBeCloseTo(130);
    // Unarmed only the Attack points count: one point of damage each.
    expect(unarmed.currentStatus.derived.attackDamage).toBeCloseTo(5);

    profile.equipment.weapon = 'starter-sword';
    profile.equipment.primaryWeapon = 'starter-sword';
    const armed = buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot());
    // 5 from the sword + 1 per attack point (5 points = 5 + 5 = 10).
    expect(armed.currentStatus.derived.attackDamage).toBeCloseTo(10);
    expect(armed.currentStatus.derived.maxHealth).toBeCloseTo(130);
    // The attack reading in the sheet carries the weapon damage too.
    expect(armed.currentStatus.attributes.find(({ key }) => key === 'attack')?.value).toBe(10);
  });

  it('exposes the Dragonic set bonus for the lobby status panel', () => {
    const profile = createDefaultPlayerProfile();
    Object.assign(profile.equipment, {
      helmet: 'common-forged-helmet',
      chest: 'common-forged-chest',
      pants: 'common-forged-pants',
      gloves: 'common-forged-gloves',
      boots: 'common-forged-boots',
    });

    const view = buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot());

    expect(view.currentStatus.setBonus).toEqual({
      label: 'Conjunto Dragonic DEF',
      attributes: [
        { label: 'Vitalidade', value: 2 },
        { label: 'Defesa', value: 7 },
        { label: 'Agilidade', value: 1 },
      ],
    });

    profile.equipment.boots = null;
    const partial = buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot());
    expect(partial.currentStatus.setBonus).toBeNull();
  });

  it('names the offensive line in the set bonus panel', () => {
    const profile = createDefaultPlayerProfile();
    Object.assign(profile.equipment, {
      helmet: 'common-forged-helmet-atk',
      chest: 'common-forged-chest-atk',
      pants: 'common-forged-pants-atk',
      gloves: 'common-forged-gloves-atk',
      boots: 'common-forged-boots-atk',
    });

    const view = buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot());

    expect(view.currentStatus.setBonus?.label).toBe('Conjunto Dragonic ATK');
    expect(view.currentStatus.setBonus?.attributes).toEqual([
      { label: 'Vitalidade', value: 1 },
      { label: 'Ataque', value: 7 },
      { label: 'Agilidade', value: 2 },
    ]);
  });

  it('grants no set bonus while the armor mixes the two lines', () => {
    const profile = createDefaultPlayerProfile();
    Object.assign(profile.equipment, {
      helmet: 'common-forged-helmet-atk',
      chest: 'common-forged-chest',
      pants: 'common-forged-pants-atk',
      gloves: 'common-forged-gloves',
      boots: 'common-forged-boots-atk',
    });

    const view = buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot());

    expect(view.currentStatus.setBonus).toBeNull();
  });
});
