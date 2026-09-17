import { describe, expect, it } from 'vitest';
import { createDefaultPlayerProfile } from '../profile/PlayerProfile';
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
    expect(view.backpack[0]?.item?.label).toBe('Espada do Recruta');
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

  it('exposes the active Predador set bonus for the lobby status panel', () => {
    const profile = createDefaultPlayerProfile();
    Object.assign(profile.equipment, {
      helmet: 'predator-forged-helmet',
      chest: 'predator-forged-chest',
      pants: 'predator-forged-pants',
      gloves: 'predator-forged-gloves',
      boots: 'predator-forged-boots',
    });

    const view = buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot());

    expect(view.currentStatus.setBonus).toEqual({
      label: 'Conjunto do Predador',
      attributes: [
        { label: 'Ataque', value: 6 },
        { label: 'Crítico físico', value: 8 },
        { label: 'Dano crítico', value: 12 },
        { label: 'Roubo de vida', value: 4 },
      ],
    });
  });

  it('exposes the active Muralha set bonus and no bonus for a partial set', () => {
    const profile = createDefaultPlayerProfile();
    Object.assign(profile.equipment, {
      helmet: 'bulwark-forged-helmet',
      chest: 'bulwark-forged-chest',
      pants: 'bulwark-forged-pants',
      gloves: 'bulwark-forged-gloves',
      boots: 'bulwark-forged-boots',
    });

    const view = buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot());

    expect(view.currentStatus.setBonus).toEqual({
      label: 'Conjunto da Muralha',
      attributes: [
        { label: 'Vitalidade', value: 14 },
        { label: 'Defesa', value: 16 },
        { label: 'Esquiva', value: 8 },
      ],
    });

    profile.equipment.boots = null;
    const partial = buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot());
    expect(partial.currentStatus.setBonus).toBeNull();
  });
});
