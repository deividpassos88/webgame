import type { InventoryStack, PlayerProfile } from '../profile/PlayerProfile';
import { deliverGuildVault } from '../rewards/FinalBossLoot';
import {
  BACKPACK_CAPACITY_INCREMENT,
  BACKPACK_MAX_CAPACITY,
} from './InventoryCapacity';
import { InventoryStore, type InventorySnapshot } from './InventoryStore';

export const GUILD_TOKEN_BACKPACK_EXPANSION_COST = 30;

export interface BackpackExpansionState {
  readonly backpackCapacity: number;
  readonly backpack: InventoryStack[];
  readonly guildVault: InventoryStack[];
}

export type BackpackExpansionResult =
  | (BackpackExpansionState & { readonly kind: 'expanded' })
  | (BackpackExpansionState & { readonly kind: 'insufficient-guild-tokens' })
  | (BackpackExpansionState & { readonly kind: 'capacity-maximum' });

export type BackpackExpansionCommitResult =
  | {
    readonly kind: 'expanded';
    readonly backpackCapacity: number;
    readonly deliveredFromGuildVault: readonly InventoryStack[];
  }
  | { readonly kind: 'persistence-failed' }
  | Exclude<BackpackExpansionResult, { readonly kind: 'expanded' }>;

/**
 * Prepares, without mutating either input, the complete state required to
 * purchase five backpack slots with Guild Tokens.
 */
export function prepareGuildTokenBackpackExpansion(
  profile: PlayerProfile,
  snapshot: InventorySnapshot
): BackpackExpansionResult {
  const current = cloneState(profile.backpackCapacity, snapshot.backpack, profile.guildVault);
  if (profile.backpackCapacity >= BACKPACK_MAX_CAPACITY) {
    return { kind: 'capacity-maximum', ...current };
  }

  const tokenCount = countGuildTokens(current.backpack) + countGuildTokens(current.guildVault);
  if (tokenCount < GUILD_TOKEN_BACKPACK_EXPANSION_COST) {
    return { kind: 'insufficient-guild-tokens', ...current };
  }

  const backpackSpend = spendGuildTokens(current.backpack, GUILD_TOKEN_BACKPACK_EXPANSION_COST);
  const guildVaultSpend = spendGuildTokens(current.guildVault, backpackSpend.remaining);
  return {
    kind: 'expanded',
    backpackCapacity: profile.backpackCapacity + BACKPACK_CAPACITY_INCREMENT,
    backpack: backpackSpend.stacks,
    guildVault: guildVaultSpend.stacks,
  };
}

/**
 * Commits a prepared expansion only after its complete next profile is
 * durably persisted. The live profile and inventory remain untouched when
 * persistence rejects the candidate.
 */
export function commitGuildTokenBackpackExpansion(
  profile: PlayerProfile,
  inventory: InventoryStore,
  persist: (candidate: PlayerProfile) => boolean
): BackpackExpansionCommitResult {
  const expansion = prepareGuildTokenBackpackExpansion(profile, inventory.snapshot());
  if (expansion.kind !== 'expanded') return expansion;

  const serialized = inventory.toProfileInventory();
  const candidate: PlayerProfile = {
    ...profile,
    equipment: serialized.equipment,
    backpackCapacity: expansion.backpackCapacity,
    backpack: expansion.backpack,
    guildVault: expansion.guildVault,
  };
  const candidateInventory = InventoryStore.fromProfile(candidate);
  const vaultDelivery = deliverGuildVault(candidateInventory, candidate.guildVault);
  const deliveredInventory = candidateInventory.toProfileInventory();
  candidate.equipment = deliveredInventory.equipment;
  candidate.backpack = deliveredInventory.backpack;
  candidate.guildVault = vaultDelivery.guildVault;

  if (!persist(candidate)) return { kind: 'persistence-failed' };

  Object.assign(profile, candidate);
  inventory.commitProfile(candidate);
  return {
    kind: 'expanded',
    backpackCapacity: candidate.backpackCapacity,
    deliveredFromGuildVault: vaultDelivery.delivered,
  };
}

function cloneState(
  backpackCapacity: number,
  backpack: readonly InventoryStack[],
  guildVault: readonly InventoryStack[]
): BackpackExpansionState {
  return {
    backpackCapacity,
    backpack: backpack.map((stack) => ({ ...stack })),
    guildVault: guildVault.map((stack) => ({ ...stack })),
  };
}

function countGuildTokens(stacks: readonly InventoryStack[]): number {
  return stacks.reduce(
    (total, stack) => total + (stack.itemId === 'guild-token' ? stack.quantity : 0),
    0
  );
}

function spendGuildTokens(
  stacks: readonly InventoryStack[],
  required: number
): { stacks: InventoryStack[]; remaining: number } {
  let remaining = required;
  const nextStacks: InventoryStack[] = [];
  for (const stack of stacks) {
    if (stack.itemId !== 'guild-token' || remaining === 0) {
      nextStacks.push({ ...stack });
      continue;
    }
    const spent = Math.min(stack.quantity, remaining);
    const quantity = stack.quantity - spent;
    remaining -= spent;
    if (quantity > 0) nextStacks.push({ ...stack, quantity });
  }
  return { stacks: nextStacks, remaining };
}
