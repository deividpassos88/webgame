import type { InventoryStack } from '../profile/PlayerProfile';
import { getInventoryItem, type InventoryItemId } from '../inventory/InventoryCatalog';
import type { InventoryStore } from '../inventory/InventoryStore';
import { COMMON_CRAFT_MATERIAL_IDS } from '../crafting/BlacksmithWorkshop';

export const COMMON_FINAL_BOSS_MATERIAL_IDS: readonly InventoryItemId[] = COMMON_CRAFT_MATERIAL_IDS;

export interface FinalBossLootSettlement {
  readonly delivered: InventoryStack[];
  /** Only rewards deferred by this settlement, for explicit player feedback. */
  readonly deferred: InventoryStack[];
  /** The complete persistent Guild Vault after the transaction. */
  readonly guildVault: InventoryStack[];
}

export interface GuildVaultDelivery {
  readonly delivered: InventoryStack[];
  readonly guildVault: InventoryStack[];
}

/**
 * One Guild Token always, one craft material at 80%, and a second material at 20%.
 */
export function rollFinalBossLoot(random: () => number = Math.random): InventoryStack[] {
  const loot: InventoryStack[] = [{ itemId: 'guild-token', quantity: 1 }];
  if (rollChance(0.8, random)) loot.push(pickCommonMaterial(random));
  if (rollChance(0.2, random)) loot.push(pickCommonMaterial(random));
  return mergeStacks(loot);
}

/**
 * Attempts automatic delivery, then puts the precise unresolved remainder in
 * the persisted Guild Vault. This is a durable alternative to dropping loot
 * on a full backpack where it could silently disappear on reset or reload.
 */
export function settleFinalBossLoot(
  inventory: InventoryStore,
  existingGuildVault: readonly InventoryStack[],
  loot: readonly InventoryStack[]
): FinalBossLootSettlement {
  const delivered: InventoryStack[] = [];
  const deferred: InventoryStack[] = [];
  const guildVault = mergeStacks(existingGuildVault);

  for (const stack of mergeStacks(loot)) {
    const result = inventory.add(stack);
    if (result.accepted > 0) appendStack(delivered, stack.itemId, result.accepted);
    if (result.remaining > 0) {
      appendStack(deferred, stack.itemId, result.remaining);
      appendStack(guildVault, stack.itemId, result.remaining);
    }
  }

  return { delivered, deferred, guildVault };
}

/** Attempts delivery again whenever inventory changes (for example after equipping gear). */
export function deliverGuildVault(
  inventory: InventoryStore,
  guildVault: readonly InventoryStack[]
): GuildVaultDelivery {
  const delivered: InventoryStack[] = [];
  const retained: InventoryStack[] = [];
  for (const stack of mergeStacks(guildVault)) {
    const result = inventory.add(stack);
    if (result.accepted > 0) appendStack(delivered, stack.itemId, result.accepted);
    if (result.remaining > 0) appendStack(retained, stack.itemId, result.remaining);
  }
  return { delivered, guildVault: retained };
}

function rollChance(chance: number, random: () => number): boolean {
  return normalizedRandom(random) < chance;
}

function pickCommonMaterial(random: () => number): InventoryStack {
  const index = Math.min(
    COMMON_FINAL_BOSS_MATERIAL_IDS.length - 1,
    Math.floor(normalizedRandom(random) * COMMON_FINAL_BOSS_MATERIAL_IDS.length)
  );
  return { itemId: COMMON_FINAL_BOSS_MATERIAL_IDS[index], quantity: 1 };
}

function normalizedRandom(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999999999, Math.max(0, value));
}

function mergeStacks(stacks: readonly InventoryStack[]): InventoryStack[] {
  const merged: InventoryStack[] = [];
  for (const { itemId, quantity } of stacks) {
    if (!getInventoryItem(itemId) || !Number.isInteger(quantity) || quantity <= 0) continue;
    appendStack(merged, itemId, quantity);
  }
  return merged;
}

function appendStack(stacks: InventoryStack[], itemId: string, quantity: number): void {
  const current = stacks.find((stack) => stack.itemId === itemId);
  if (current) current.quantity += quantity;
  else stacks.push({ itemId, quantity });
}
