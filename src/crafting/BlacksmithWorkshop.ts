import { getInventoryItem } from '../inventory/InventoryCatalog';
import type { InventoryStack, PlayerProfile } from '../profile/PlayerProfile';

export const BLACKSMITH_LICENSE_COST = 30;
export const BLACKSMITH_LICENSE_DURATION_MS = 36 * 60 * 60 * 1000;
export const BLACKSMITH_LICENSE_DURATION_HOURS = BLACKSMITH_LICENSE_DURATION_MS / (60 * 60 * 1000);

/** Shared player-facing labels so the license terms cannot drift between UI surfaces. */
export function getBlacksmithLicensePresentation(): {
  readonly costLabel: string;
  readonly durationLabel: string;
} {
  return {
    costLabel: `${BLACKSMITH_LICENSE_COST} Tokens da Guilda`,
    durationLabel: `${BLACKSMITH_LICENSE_DURATION_HOURS} horas`,
  };
}

export const COMMON_CRAFT_MATERIAL_IDS = [
  'worn-draco-claw', 'worn-draco-hide', 'black-horn-fragment', 'crimson-fang', 'serrated-rubra-scale',
  'volatile-draconic-essence', 'ossified-draco-ribs', 'verdant-draco-talisman', 'crimson-draco-talon', 'obsidian-draco-eye',
] as const;

const ingredients = (...itemIds: readonly (typeof COMMON_CRAFT_MATERIAL_IDS)[number][]) =>
  itemIds.map((itemId) => ({ itemId, quantity: 10 }));

/**
 * Recipes are grouped by set so the forge can list one block per line and show
 * what completing it grants. The old "Comum Forjado" recipes were replaced by
 * the two specialised lines (Predador / Muralha); the legacy items stay in the
 * catalog so gear already stored in a profile keeps working.
 */
export const BLACKSMITH_RECIPES = [
  { id: 'predator-forged-helmet', setId: 'predator', outputItemId: 'predator-forged-helmet', label: 'Elmo do Predador', ingredients: ingredients('crimson-fang', 'crimson-draco-talon', 'worn-draco-claw', 'black-horn-fragment', 'volatile-draconic-essence') },
  { id: 'predator-forged-chest', setId: 'predator', outputItemId: 'predator-forged-chest', label: 'Peitoral do Predador', ingredients: ingredients('crimson-fang', 'crimson-draco-talon', 'volatile-draconic-essence', 'serrated-rubra-scale', 'obsidian-draco-eye') },
  { id: 'predator-forged-pants', setId: 'predator', outputItemId: 'predator-forged-pants', label: 'Calça do Predador', ingredients: ingredients('crimson-fang', 'worn-draco-hide', 'crimson-draco-talon', 'volatile-draconic-essence', 'serrated-rubra-scale') },
  { id: 'predator-forged-gloves', setId: 'predator', outputItemId: 'predator-forged-gloves', label: 'Manoplas do Predador', ingredients: ingredients('crimson-fang', 'worn-draco-claw', 'crimson-draco-talon', 'obsidian-draco-eye', 'volatile-draconic-essence') },
  { id: 'predator-forged-boots', setId: 'predator', outputItemId: 'predator-forged-boots', label: 'Grevas do Predador', ingredients: ingredients('worn-draco-hide', 'crimson-draco-talon', 'serrated-rubra-scale', 'worn-draco-claw', 'crimson-fang') },
  { id: 'bulwark-forged-helmet', setId: 'bulwark', outputItemId: 'bulwark-forged-helmet', label: 'Elmo da Muralha', ingredients: ingredients('ossified-draco-ribs', 'black-horn-fragment', 'serrated-rubra-scale', 'obsidian-draco-eye', 'worn-draco-hide') },
  { id: 'bulwark-forged-chest', setId: 'bulwark', outputItemId: 'bulwark-forged-chest', label: 'Peitoral da Muralha', ingredients: ingredients('ossified-draco-ribs', 'black-horn-fragment', 'obsidian-draco-eye', 'serrated-rubra-scale', 'verdant-draco-talisman') },
  { id: 'bulwark-forged-pants', setId: 'bulwark', outputItemId: 'bulwark-forged-pants', label: 'Calça da Muralha', ingredients: ingredients('ossified-draco-ribs', 'worn-draco-hide', 'black-horn-fragment', 'verdant-draco-talisman', 'serrated-rubra-scale') },
  { id: 'bulwark-forged-gloves', setId: 'bulwark', outputItemId: 'bulwark-forged-gloves', label: 'Manoplas da Muralha', ingredients: ingredients('ossified-draco-ribs', 'black-horn-fragment', 'worn-draco-claw', 'obsidian-draco-eye', 'worn-draco-hide') },
  { id: 'bulwark-forged-boots', setId: 'bulwark', outputItemId: 'bulwark-forged-boots', label: 'Grevas da Muralha', ingredients: ingredients('ossified-draco-ribs', 'black-horn-fragment', 'serrated-rubra-scale', 'verdant-draco-talisman', 'obsidian-draco-eye') },
] as const;

export type BlacksmithRecipeId = (typeof BLACKSMITH_RECIPES)[number]['id'];
export type BlacksmithPurchaseResult =
  | { readonly kind: 'purchased'; readonly profile: PlayerProfile }
  | { readonly kind: 'license-active'; readonly profile: PlayerProfile }
  | { readonly kind: 'insufficient-guild-tokens'; readonly profile: PlayerProfile };
export type BlacksmithCraftResult =
  | { readonly kind: 'crafted'; readonly profile: PlayerProfile; readonly recipe: (typeof BLACKSMITH_RECIPES)[number] }
  | { readonly kind: 'license-expired'; readonly profile: PlayerProfile }
  | { readonly kind: 'insufficient-materials'; readonly profile: PlayerProfile }
  | { readonly kind: 'backpack-full'; readonly profile: PlayerProfile }
  | { readonly kind: 'unknown-recipe'; readonly profile: PlayerProfile };

/** Purchases one 36-hour workshop license using only Guild Tokens in the backpack. */
export function purchaseBlacksmithLicense(
  profile: PlayerProfile,
  now: number
): BlacksmithPurchaseResult {
  if (hasActiveLicense(profile, now)) return { kind: 'license-active', profile };
  if (countItem(profile.backpack, 'guild-token') < BLACKSMITH_LICENSE_COST) {
    return { kind: 'insufficient-guild-tokens', profile };
  }

  return {
    kind: 'purchased',
    profile: {
      ...profile,
      backpack: spendItem(profile.backpack, 'guild-token', BLACKSMITH_LICENSE_COST),
      blacksmith: { availableUntil: normalizedNow(now) + BLACKSMITH_LICENSE_DURATION_MS },
    },
  };
}

/** Crafts a recipe atomically: nothing changes unless its output can enter the backpack. */
export function craftBlacksmithRecipe(
  profile: PlayerProfile,
  recipeId: string,
  now: number
): BlacksmithCraftResult {
  const recipe = BLACKSMITH_RECIPES.find((candidate) => candidate.id === recipeId);
  if (!recipe) return { kind: 'unknown-recipe', profile };
  if (!hasActiveLicense(profile, now)) return { kind: 'license-expired', profile };
  if (!recipe.ingredients.every(({ itemId, quantity }) => countItem(profile.backpack, itemId) >= quantity)) {
    return { kind: 'insufficient-materials', profile };
  }

  const output = getInventoryItem(recipe.outputItemId);
  const hasOutputStack = profile.backpack.some((stack) => stack.itemId === recipe.outputItemId);
  if (!output || hasOutputStack) {
    return { kind: 'backpack-full', profile };
  }

  let backpack = profile.backpack.map((stack) => ({ ...stack }));
  for (const ingredient of recipe.ingredients) {
    backpack = spendItem(backpack, ingredient.itemId, ingredient.quantity);
  }
  if (backpack.length >= profile.backpackCapacity) {
    return { kind: 'backpack-full', profile };
  }
  backpack.push({ itemId: output.id, quantity: 1 });
  return {
    kind: 'crafted',
    profile: { ...profile, backpack },
    recipe,
  };
}

export function hasActiveLicense(profile: PlayerProfile, now: number): boolean {
  return profile.blacksmith.availableUntil !== null
    && profile.blacksmith.availableUntil > normalizedNow(now);
}

function normalizedNow(now: number): number {
  return Number.isFinite(now) ? Math.max(0, Math.floor(now)) : Date.now();
}

function countItem(stacks: readonly InventoryStack[], itemId: string): number {
  return stacks.reduce((total, stack) => total + (stack.itemId === itemId ? stack.quantity : 0), 0);
}

function spendItem(
  stacks: readonly InventoryStack[],
  itemId: string,
  quantity: number
): InventoryStack[] {
  let remaining = quantity;
  return stacks.flatMap((stack) => {
    if (stack.itemId !== itemId || remaining === 0) return [{ ...stack }];
    const spent = Math.min(stack.quantity, remaining);
    remaining -= spent;
    const nextQuantity = stack.quantity - spent;
    return nextQuantity > 0 ? [{ ...stack, quantity: nextQuantity }] : [];
  });
}
