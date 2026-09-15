import type {
  InventoryStack,
  PlayerEquipment,
  PlayerProfile,
  RpgEquipmentSlot,
} from '../profile/PlayerProfile';
import { getInventoryItem } from './InventoryCatalog';
import { BACKPACK_CAPACITY } from './InventoryCapacity';
import type { LootContainerState } from './LootContainerState';

export interface InventorySnapshot {
  readonly capacity: number;
  readonly usedSlots: number;
  readonly backpack: InventoryStack[];
  readonly equipment: PlayerEquipment;
}

export interface TransferResult {
  readonly accepted: number;
  readonly remaining: number;
  readonly reason: 'backpack-full' | 'unknown-item' | null;
}

export type InventoryMutationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'backpack-full' | 'invalid-quantity' | 'stack-limit' | 'unknown-item';
    };

export type EquipResult =
  | { kind: 'equipped' }
  | { kind: 'empty-slot' }
  | { kind: 'incompatible-slot' };

export type UnequipResult =
  | { kind: 'unequipped' }
  | { kind: 'empty-equipment-slot' }
  | { kind: 'backpack-full' };

const EMPTY_EQUIPMENT: PlayerEquipment = {
  helmet: null,
  chest: null,
  gloves: null,
  pants: null,
  boots: null,
  weapon: null,
  primaryWeapon: null,
  secondaryWeapon: null,
};

export class InventoryStore {
  private readonly backpack: InventoryStack[];
  private readonly equipment: PlayerEquipment;

  private constructor(
    private capacity: number,
    backpack: readonly InventoryStack[],
    equipment: PlayerEquipment
  ) {
    this.backpack = backpack.map((item) => ({ ...item }));
    this.equipment = { ...equipment };
    this.removeDuplicateStarterSwords();
  }

  public static empty(capacity = BACKPACK_CAPACITY): InventoryStore {
    return new InventoryStore(capacity, [], EMPTY_EQUIPMENT);
  }

  public static fromProfile(profile: PlayerProfile): InventoryStore {
    return new InventoryStore(profile.backpackCapacity, profile.backpack, profile.equipment);
  }

  /**
   * Applies persisted inventory after a transaction while retaining the store
   * object that overlays and gameplay code already reference.
   */
  public commitProfile(profile: PlayerProfile): void {
    this.capacity = profile.backpackCapacity;
    this.backpack.splice(0, this.backpack.length, ...profile.backpack.map((stack) => ({ ...stack })));
    for (const key of Object.keys(this.equipment)) {
      delete this.equipment[key as keyof PlayerEquipment];
    }
    Object.assign(this.equipment, profile.equipment);
    this.removeDuplicateStarterSwords();
  }

  /** Repairs duplicate starter swords created by older equipment-slot sync code. */
  private removeDuplicateStarterSwords(): void {
    const starterSwordInBackpack = this.backpack.some((stack) => stack.itemId === 'starter-sword');
    // Older desequip code cleared only primaryWeapon and left weapon set. When
    // it also left swords in the backpack, that durable state means equipped
    // no longer and must keep exactly one backpack copy.
    if (
      this.equipment.weapon === 'starter-sword'
      && this.equipment.primaryWeapon === null
      && starterSwordInBackpack
    ) {
      this.equipment.weapon = null;
    } else if (this.equipment.weapon === 'starter-sword' && this.equipment.primaryWeapon === null) {
      this.equipment.primaryWeapon = 'starter-sword';
    } else if (this.equipment.primaryWeapon === 'starter-sword' && this.equipment.weapon === null) {
      this.equipment.weapon = 'starter-sword';
    }
    const starterSwordEquipped = this.equipment.weapon === 'starter-sword'
      || this.equipment.primaryWeapon === 'starter-sword';
    let retainedInBackpack = false;
    for (let index = this.backpack.length - 1; index >= 0; index -= 1) {
      const stack = this.backpack[index];
      if (stack.itemId !== 'starter-sword') continue;
      if (starterSwordEquipped || retainedInBackpack) {
        this.backpack.splice(index, 1);
      } else {
        retainedInBackpack = true;
      }
    }
  }

  /**
   * Adds a complete catalog stack atomically. Invalid requests, capacity
   * overflow and stack-limit overflow leave the live inventory untouched.
   */
  public add(itemId: string, quantity: number): InventoryMutationResult;
  /** Compatibility adapter for legacy loot transfers, which may accept a partial stack. */
  public add(stack: InventoryStack): TransferResult;
  public add(itemOrStack: string | InventoryStack, quantity?: number): InventoryMutationResult | TransferResult {
    if (typeof itemOrStack === 'string') {
      return this.addAtomically(itemOrStack, quantity);
    }
    return this.addForTransfer(itemOrStack);
  }

  private addAtomically(itemId: string, quantity: number | undefined): InventoryMutationResult {
    const definition = getInventoryItem(itemId);
    if (!definition) return { ok: false, reason: 'unknown-item' };
    if (!Number.isInteger(quantity) || quantity === undefined || quantity <= 0) {
      return { ok: false, reason: 'invalid-quantity' };
    }

    const nextBackpack = this.backpack.map((stack) => ({ ...stack }));
    const existing = nextBackpack.find((stack) => stack.itemId === itemId);
    if (existing) {
      if (existing.quantity + quantity > definition.maxStack) {
        return { ok: false, reason: 'stack-limit' };
      }
      existing.quantity += quantity;
    } else {
      if (quantity > definition.maxStack) return { ok: false, reason: 'stack-limit' };
      if (nextBackpack.length >= this.capacity) return { ok: false, reason: 'backpack-full' };
      nextBackpack.push({ itemId, quantity });
    }

    this.backpack.splice(0, this.backpack.length, ...nextBackpack);
    return { ok: true };
  }

  private addForTransfer(stack: InventoryStack): TransferResult {
    const definition = getInventoryItem(stack.itemId);
    if (!definition || !Number.isInteger(stack.quantity) || stack.quantity <= 0) {
      return { accepted: 0, remaining: Math.max(0, stack.quantity), reason: 'unknown-item' };
    }

    const existing = this.backpack.find((item) => item.itemId === stack.itemId);
    if (existing) {
      const room = Math.max(0, definition.maxStack - existing.quantity);
      const accepted = Math.min(room, stack.quantity);
      existing.quantity += accepted;
      return {
        accepted,
        remaining: stack.quantity - accepted,
        reason: accepted < stack.quantity ? 'backpack-full' : null,
      };
    }

    if (this.backpack.length >= this.capacity) {
      return { accepted: 0, remaining: stack.quantity, reason: 'backpack-full' };
    }
    const accepted = Math.min(definition.maxStack, stack.quantity);
    this.backpack.push({ itemId: stack.itemId, quantity: accepted });
    return {
      accepted,
      remaining: stack.quantity - accepted,
      reason: accepted < stack.quantity ? 'backpack-full' : null,
    };
  }

  public transferFrom(
    container: LootContainerState,
    itemId: string,
    requestedQuantity: number
  ): TransferResult {
    const available = container.available(itemId);
    const requested = Math.min(Math.max(0, requestedQuantity), available);
    if (requested === 0) return { accepted: 0, remaining: 0, reason: null };
    const result = this.add({ itemId, quantity: requested });
    if (result.accepted > 0) container.take(itemId, result.accepted);
    return result;
  }

  public equip(backpackIndex: number, slot: RpgEquipmentSlot): EquipResult {
    const stack = this.backpack[backpackIndex];
    if (!stack) return { kind: 'empty-slot' };
    const definition = getInventoryItem(stack.itemId);
    if (definition?.kind !== 'equipment' || definition.slot !== slot) {
      return { kind: 'incompatible-slot' };
    }

    const previous = this.equipment[slot];
    this.equipment[slot] = stack.itemId;
    if (slot === 'weapon') this.equipment.primaryWeapon = stack.itemId;
    this.backpack.splice(backpackIndex, 1);
    if (previous) this.backpack.push({ itemId: previous, quantity: 1 });
    return { kind: 'equipped' };
  }

  /** Returns equipped gear to the backpack without losing the canonical weapon state. */
  public unequip(slot: RpgEquipmentSlot | 'primaryWeapon' | 'secondaryWeapon'): UnequipResult {
    // The lobby renders canonical weapon slots; inventory mutations keep the
    // legacy weapon field in lockstep for older gameplay consumers.
    const equipmentSlot = slot === 'primaryWeapon' ? 'weapon' : slot;
    const equippedItemId = this.equipment[equipmentSlot];
    if (!equippedItemId) return { kind: 'empty-equipment-slot' };
    if (this.backpack.length >= this.capacity) return { kind: 'backpack-full' };

    this.equipment[equipmentSlot] = null;
    if (equipmentSlot === 'weapon') this.equipment.primaryWeapon = null;
    this.backpack.push({ itemId: equippedItemId, quantity: 1 });
    return { kind: 'unequipped' };
  }

  /**
   * Destroys part or all of a backpack stack after the player confirms the
   * action. Removing the full stack drops the slot; partial removals keep it.
   */
  public removeAt(
    backpackIndex: number,
    quantity: number
  ): { kind: 'removed' } | { kind: 'empty-slot' } | { kind: 'invalid-quantity' } {
    const stack = this.backpack[backpackIndex];
    if (!stack) return { kind: 'empty-slot' };
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { kind: 'invalid-quantity' };
    }

    if (quantity >= stack.quantity) {
      this.backpack.splice(backpackIndex, 1);
      return { kind: 'removed' };
    }
    stack.quantity -= quantity;
    return { kind: 'removed' };
  }

  public snapshot(): InventorySnapshot {
    return {
      capacity: this.capacity,
      usedSlots: this.backpack.length,
      backpack: this.backpack.map((item) => ({ ...item })),
      equipment: { ...this.equipment },
    };
  }

  public toProfileInventory(): Pick<PlayerProfile, 'equipment' | 'backpack'> {
    return {
      equipment: { ...this.equipment },
      backpack: this.backpack.map((item) => ({ ...item })),
    };
  }
}
