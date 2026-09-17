import { describe, expect, it } from 'vitest';
import {
  BLACKSMITH_LICENSE_DURATION_MS,
  BLACKSMITH_RECIPES,
  COMMON_CRAFT_MATERIAL_IDS,
  craftBlacksmithRecipe,
  getBlacksmithLicensePresentation,
  purchaseBlacksmithLicense,
} from './BlacksmithWorkshop';
import { EQUIPMENT_SETS } from '../equipment/EquipmentStatBonuses';
import { createDefaultPlayerProfile } from '../profile/PlayerProfile';

const NOW = 1_789_000_000_000;
const PREDATOR_HELMET = 'predator-forged-helmet';

function profileWithCommonMaterials() {
  const profile = createDefaultPlayerProfile();
  profile.backpack = COMMON_CRAFT_MATERIAL_IDS.map((itemId) => ({ itemId, quantity: 10 }));
  return profile;
}

describe('BlacksmithWorkshop', () => {
  it('provides the exact license labels consumed by every workshop surface', () => {
    expect(getBlacksmithLicensePresentation()).toEqual({
      costLabel: '30 Tokens da Guilda',
      durationLabel: '36 horas',
    });
  });

  it('sells five recipes per forged set with ten-unit materials sharing the drop pool', () => {
    expect(BLACKSMITH_RECIPES).toHaveLength(10);
    expect(EQUIPMENT_SETS.map((set) => set.id)).toEqual(['predator', 'bulwark']);

    const usedMaterials = new Set<string>();
    for (const set of EQUIPMENT_SETS) {
      const recipes = BLACKSMITH_RECIPES.filter((recipe) => recipe.setId === set.id);
      expect(recipes).toHaveLength(5);
      expect(recipes.map((recipe) => recipe.outputItemId).sort()).toEqual(
        Object.values(set.itemIds).sort()
      );
      for (const recipe of recipes) {
        expect(recipe.ingredients).toHaveLength(5);
        expect(recipe.ingredients.every(({ quantity }) => quantity === 10)).toBe(true);
        recipe.ingredients.forEach(({ itemId }) => usedMaterials.add(itemId));
      }
    }

    expect([...usedMaterials].sort()).toEqual([...COMMON_CRAFT_MATERIAL_IDS].sort());
  });

  it('exchanges exactly 30 backpack Guild Tokens for 36 hours of access', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack = [{ itemId: 'guild-token', quantity: 31 }];

    const result = purchaseBlacksmithLicense(profile, NOW);

    expect(result.kind).toBe('purchased');
    if (result.kind !== 'purchased') return;
    expect(result.profile.blacksmith.availableUntil).toBe(NOW + BLACKSMITH_LICENSE_DURATION_MS);
    expect(result.profile.backpack).toEqual([{ itemId: 'guild-token', quantity: 1 }]);
    expect(profile.backpack).toEqual([{ itemId: 'guild-token', quantity: 31 }]);
  });

  it('leaves the profile untouched when 30 Guild Tokens are not in the backpack', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack = [{ itemId: 'guild-token', quantity: 29 }];

    const result = purchaseBlacksmithLicense(profile, NOW);

    expect(result).toEqual({ kind: 'insufficient-guild-tokens', profile });
  });

  it('crafts a Predador helmet into the backpack without auto-equipping it', () => {
    const profile = profileWithCommonMaterials();
    profile.blacksmith.availableUntil = NOW + 1;

    const result = craftBlacksmithRecipe(profile, PREDATOR_HELMET, NOW);

    expect(result.kind).toBe('crafted');
    if (result.kind !== 'crafted') return;
    expect(result.profile.backpack).toContainEqual({ itemId: PREDATOR_HELMET, quantity: 1 });
    expect(result.profile.backpack).toHaveLength(6);
    expect(result.profile.equipment.helmet).toBeNull();
  });

  it('does not consume materials when the workshop license is expired', () => {
    const profile = profileWithCommonMaterials();

    const result = craftBlacksmithRecipe(profile, PREDATOR_HELMET, NOW);

    expect(result).toEqual({ kind: 'license-expired', profile });
  });

  it('uses slots freed by consumed materials when an initially full backpack crafts equipment', () => {
    const profile = profileWithCommonMaterials();
    profile.blacksmith.availableUntil = NOW + 1;
    profile.backpack.push(
      { itemId: 'starter-sword', quantity: 1 },
      { itemId: 'iron-helmet', quantity: 1 },
      { itemId: 'leather-chest', quantity: 1 },
      { itemId: 'leather-gloves', quantity: 1 },
      { itemId: 'traveler-pants', quantity: 1 },
      { itemId: 'iron-boots', quantity: 1 },
      { itemId: 'runic-crystal', quantity: 1 },
      { itemId: 'iron-shard', quantity: 1 },
      { itemId: 'ancient-cloth', quantity: 1 },
    );

    const result = craftBlacksmithRecipe(profile, PREDATOR_HELMET, NOW);

    expect(result.kind).toBe('crafted');
    if (result.kind !== 'crafted') return;
    expect(result.profile.backpack).toHaveLength(15);
    expect(result.profile.backpack).toContainEqual({ itemId: PREDATOR_HELMET, quantity: 1 });
    expect(result.profile.backpack.some((stack) => recipeIngredientIds(stack.itemId))).toBe(false);
  });
});

function recipeIngredientIds(itemId: string): boolean {
  const recipe = BLACKSMITH_RECIPES.find((candidate) => candidate.id === PREDATOR_HELMET)!;
  return recipe.ingredients.some((ingredient) => ingredient.itemId === itemId);
}
