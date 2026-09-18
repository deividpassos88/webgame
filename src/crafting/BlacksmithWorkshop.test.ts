import { describe, expect, it } from 'vitest';
import {
  BLACKSMITH_LICENSE_DURATION_MS,
  BLACKSMITH_RECIPES,
  COMMON_CRAFT_MATERIAL_IDS,
  craftBlacksmithRecipe,
  findBlacksmithRecipe,
  getBlacksmithLicensePresentation,
  purchaseBlacksmithLicense,
  recipesForLine,
} from './BlacksmithWorkshop';
import { createDefaultPlayerProfile } from '../profile/PlayerProfile';

const NOW = 1_789_000_000_000;
const DRACONIC_HELMET_DEFENSE = 'common-forged-helmet:defense';
const DRACONIC_HELMET_ATTACK = 'common-forged-helmet-atk:attack';

function profileWithCommonMaterials(quantity = 10) {
  const profile = createDefaultPlayerProfile();
  profile.backpack = COMMON_CRAFT_MATERIAL_IDS.map((itemId) => ({ itemId, quantity }));
  return profile;
}

describe('BlacksmithWorkshop', () => {
  it('provides the exact license labels consumed by every workshop surface', () => {
    expect(getBlacksmithLicensePresentation()).toEqual({
      costLabel: '30 Tokens da Guilda',
      durationLabel: '36 horas',
    });
  });

  it('defines the five Draconic pieces twice, once per craft line', () => {
    expect(BLACKSMITH_RECIPES).toHaveLength(10);
    expect(recipesForLine('defense').map((recipe) => recipe.label)).toEqual([
      'Draconic Helmet [DEF]',
      'Draconic Chestplate [DEF]',
      'Draconic Pants [DEF]',
      'Draconic Gloves [DEF]',
      'Draconic Boots [DEF]',
    ]);
    expect(recipesForLine('attack').map((recipe) => recipe.label)).toEqual([
      'Draconic Helmet [ATK]',
      'Draconic Chestplate [ATK]',
      'Draconic Pants [ATK]',
      'Draconic Gloves [ATK]',
      'Draconic Boots [ATK]',
    ]);
    expect(recipesForLine('defense').map((recipe) => recipe.outputItemId)).toEqual([
      'common-forged-helmet',
      'common-forged-chest',
      'common-forged-pants',
      'common-forged-gloves',
      'common-forged-boots',
    ]);
    expect(recipesForLine('attack').map((recipe) => recipe.outputItemId)).toEqual([
      'common-forged-helmet-atk',
      'common-forged-chest-atk',
      'common-forged-pants-atk',
      'common-forged-gloves-atk',
      'common-forged-boots-atk',
    ]);
  });

  it('charges 15 units of each material for the ATK line and 10 for the DEF line', () => {
    for (const recipe of recipesForLine('defense')) {
      expect(recipe.ingredients).toHaveLength(5);
      expect(recipe.ingredients.every(({ quantity }) => quantity === 10)).toBe(true);
    }
    for (const recipe of recipesForLine('attack')) {
      expect(recipe.ingredients).toHaveLength(5);
      expect(recipe.ingredients.every(({ quantity }) => quantity === 15)).toBe(true);
    }

    const usedMaterials = new Set<string>();
    for (const recipe of BLACKSMITH_RECIPES) {
      recipe.ingredients.forEach(({ itemId }) => usedMaterials.add(itemId));
    }
    expect([...usedMaterials].sort()).toEqual([...COMMON_CRAFT_MATERIAL_IDS].sort());
  });

  it('refuses an ATK recipe when only the ten defensive units are in the backpack', () => {
    const profile = profileWithCommonMaterials(10);
    profile.blacksmith.availableUntil = NOW + 1;

    expect(craftBlacksmithRecipe(profile, DRACONIC_HELMET_ATTACK, NOW).kind).toBe('insufficient-materials');
    expect(craftBlacksmithRecipe(profile, DRACONIC_HELMET_DEFENSE, NOW).kind).toBe('crafted');
  });

  it('crafts the offensive line into its own item id', () => {
    const profile = profileWithCommonMaterials(15);
    profile.blacksmith.availableUntil = NOW + 1;

    const result = craftBlacksmithRecipe(profile, DRACONIC_HELMET_ATTACK, NOW);

    expect(result.kind).toBe('crafted');
    if (result.kind !== 'crafted') return;
    expect(result.profile.backpack).toContainEqual({ itemId: 'common-forged-helmet-atk', quantity: 1 });
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

  it('crafts a Draconic helmet into the backpack without auto-equipping it', () => {
    const profile = profileWithCommonMaterials();
    profile.blacksmith.availableUntil = NOW + 1;

    const result = craftBlacksmithRecipe(profile, DRACONIC_HELMET_DEFENSE, NOW);

    expect(result.kind).toBe('crafted');
    if (result.kind !== 'crafted') return;
    expect(result.profile.backpack).toContainEqual({ itemId: 'common-forged-helmet', quantity: 1 });
    expect(result.profile.backpack).toHaveLength(6);
    expect(result.profile.equipment.helmet).toBeNull();
  });

  it('does not consume materials when the workshop license is expired', () => {
    const profile = profileWithCommonMaterials();

    const result = craftBlacksmithRecipe(profile, DRACONIC_HELMET_DEFENSE, NOW);

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

    const result = craftBlacksmithRecipe(profile, DRACONIC_HELMET_DEFENSE, NOW);

    expect(result.kind).toBe('crafted');
    if (result.kind !== 'crafted') return;
    expect(result.profile.backpack).toHaveLength(15);
    expect(result.profile.backpack).toContainEqual({ itemId: 'common-forged-helmet', quantity: 1 });
    expect(result.profile.backpack.some((stack) => recipeIngredientIds(stack.itemId))).toBe(false);
  });
});

function recipeIngredientIds(itemId: string): boolean {
  const recipe = findBlacksmithRecipe(DRACONIC_HELMET_DEFENSE)!;
  return recipe.ingredients.some((ingredient) => ingredient.itemId === itemId);
}
