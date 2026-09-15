import type { InventoryStack } from '../profile/PlayerProfile';

export interface LootContainerSnapshot {
  readonly id: string;
  readonly items: InventoryStack[];
}

export class LootContainerState {
  private readonly items: InventoryStack[];

  constructor(
    public readonly id: string,
    items: readonly InventoryStack[]
  ) {
    this.items = items
      .filter(({ itemId, quantity }) => itemId.length > 0 && Number.isInteger(quantity) && quantity > 0)
      .map((item) => ({ ...item }));
  }

  public available(itemId: string): number {
    return this.items.find((item) => item.itemId === itemId)?.quantity ?? 0;
  }

  public take(itemId: string, requestedQuantity: number): number {
    if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) return 0;
    const index = this.items.findIndex((item) => item.itemId === itemId);
    if (index < 0) return 0;
    const accepted = Math.min(this.items[index].quantity, requestedQuantity);
    this.items[index].quantity -= accepted;
    if (this.items[index].quantity === 0) this.items.splice(index, 1);
    return accepted;
  }

  public snapshot(): LootContainerSnapshot {
    return {
      id: this.id,
      items: this.items.map((item) => ({ ...item })),
    };
  }
}
