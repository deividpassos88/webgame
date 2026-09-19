import { CRAFT_LINES, type CraftLineId } from './CraftLine';
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

/**
 * One entry per armor slot. The two craft lines share the material list and
 * differ only in the cost per material and in the item they output, so the
 * slot table is declared once and expanded below.
 */
const SLOT_RECIPES = [
  { slot: 'helmet', label: 'Dragonic Helmet', materials: ['worn-draco-claw', 'worn-draco-hide', 'black-horn-fragment', 'crimson-fang', 'serrated-rubra-scale'] },
  { slot: 'chest', label: 'Dragonic Chestplate', materials: ['worn-draco-claw', 'worn-draco-hide', 'volatile-draconic-essence', 'ossified-draco-ribs', 'verdant-draco-talisman'] },
  { slot: 'pants', label: 'Dragonic Pants', materials: ['worn-draco-hide', 'black-horn-fragment', 'volatile-draconic-essence', 'crimson-draco-talon', 'obsidian-draco-eye'] },
  { slot: 'gloves', label: 'Dragonic Gloves', materials: ['worn-draco-claw', 'crimson-fang', 'serrated-rubra-scale', 'ossified-draco-ribs', 'crimson-draco-talon'] },
  { slot: 'boots', label: 'Dragonic Boots', materials: ['black-horn-fragment', 'crimson-fang', 'volatile-draconic-essence', 'verdant-draco-talisman', 'obsidian-draco-eye'] },
] as const;

export type BlacksmithSlotRecipeId = (typeof SLOT_RECIPES)[number]['slot'];

/**
 * The output of a slot recipe. The defensive line keeps the historical ids so
 * profiles saved before the two lines existed stay valid; the offensive line
 * adds the `-atk` suffix.
 */
function outputItemId(slot: BlacksmithSlotRecipeId, line: CraftLineId): string {
  return line === 'attack' ? `common-forged-${slot}-atk` : `common-forged-${slot}`;
}

/** The forge sells the five-piece common line in both ATK and DEF variants. */
export const BLACKSMITH_RECIPES = CRAFT_LINES.flatMap((line) =>
  SLOT_RECIPES.map((slotRecipe) => ({
    id: `${outputItemId(slotRecipe.slot, line.id)}:${line.id}`,
    line: line.id,
    slot: slotRecipe.slot,
    outputItemId: outputItemId(slotRecipe.slot, line.id),
    label: `${slotRecipe.label} [${line.tag}]`,
    ingredients: slotRecipe.materials.map((itemId) => ({
      itemId: itemId as (typeof COMMON_CRAFT_MATERIAL_IDS)[number],
      quantity: line.materialCost,
    })),
  })),
) as readonly BlacksmithRecipe[];

export interface BlacksmithRecipe {
  readonly id: string;
  readonly line: CraftLineId;
  readonly slot: BlacksmithSlotRecipeId;
  readonly outputItemId: string;
  readonly label: string;
  readonly ingredients: readonly { readonly itemId: string; readonly quantity: number }[];
}

export type BlacksmithRecipeId = (typeof BLACKSMITH_RECIPES)[number]['id'];

/** Every recipe of one line, in the slot order the catalog lists them. */
export function recipesForLine(line: CraftLineId): readonly BlacksmithRecipe[] {
  return BLACKSMITH_RECIPES.filter((recipe) => recipe.line === line);
}

export function findBlacksmithRecipe(recipeId: string): BlacksmithRecipe | undefined {
  return BLACKSMITH_RECIPES.find((recipe) => recipe.id === recipeId);
}

export type BlacksmithPurchaseResult =
  | { readonly kind: 'purchased'; readonly profile: PlayerProfile }
  | { readonly kind: 'license-active'; readonly profile: PlayerProfile }
  | { readonly kind: 'insufficient-guild-tokens'; readonly profile: PlayerProfile };
export type BlacksmithCraftResult =
  | { readonly kind: 'crafted'; readonly profile: PlayerProfile; readonly recipe: BlacksmithRecipe }
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
  const recipe = findBlacksmithRecipe(recipeId);
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
  const next: InventoryStack[] = [];
  for (const stack of stacks) {
    if (stack.itemId !== itemId || remaining === 0) {
      next.push(stack);
      continue;
    }
    const consumed = Math.min(stack.quantity, remaining);
    remaining -= consumed;
    const leftover = stack.quantity - consumed;
    if (leftover > 0) next.push({ ...stack, quantity: leftover });
  }
  return next;
}
