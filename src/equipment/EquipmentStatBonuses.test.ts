import { describe, expect, it } from 'vitest';
import { equippedAttributeBonuses, hasCommonForgedSet } from './EquipmentStatBonuses';
import { createDefaultPlayerProfile } from '../profile/PlayerProfile';

describe('common forged equipment bonuses', () => {
  it('adds the five-piece set bonus only when all common forged pieces are equipped', () => {
    const profile = createDefaultPlayerProfile();
    Object.assign(profile.equipment, {
      helmet: 'common-forged-helmet',
      chest: 'common-forged-chest',
      pants: 'common-forged-pants',
      gloves: 'common-forged-gloves',
      boots: 'common-forged-boots',
    });

    expect(hasCommonForgedSet(profile.equipment)).toBe(true);
    expect(equippedAttributeBonuses(profile.equipment)).toMatchObject({
      strength: 5,
      attack: 5,
      defense: 12,
      agility: 6,
    });
  });
});
