import { describe, expect, it } from 'vitest';
import { getInventoryItem } from '../inventory/InventoryCatalog';
import { InventoryStore } from '../inventory/InventoryStore';
import {
  COMMON_FINAL_BOSS_MATERIAL_IDS,
  deliverGuildVault,
  rollFinalBossLoot,
  settleFinalBossLoot,
} from './FinalBossLoot';

function sequence(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe('final boss craft loot', () => {
  it('always awards one Guild Token even when both material rolls miss', () => {
    const loot = rollFinalBossLoot(sequence([0.8, 0.2]));

    expect(loot).toEqual([{ itemId: 'guild-token', quantity: 1 }]);
  });

  it('makes independent 80% and 20% material rolls and accumulates repeated material', () => {
    const loot = rollFinalBossLoot(sequence([
      0.79, 0,
      0.19, 0,
    ]));

    expect(loot).toEqual([
      { itemId: 'guild-token', quantity: 1 },
      { itemId: COMMON_FINAL_BOSS_MATERIAL_IDS[0], quantity: 2 },
    ]);
  });

  it('only rolls catalogued common materials, never the rare catalog entries', () => {
    const loot = rollFinalBossLoot(sequence([
      0, 0.99,
      0, 0.99,
    ]));

    expect(loot.slice(1).every(({ itemId }) => {
      const item = getInventoryItem(itemId);
      return item?.rarity === 'common';
    })).toBe(true);
  });

  it('preserves every reward in the persisted Guild Vault when the backpack is full', () => {
    const inventory = InventoryStore.empty(1);
    inventory.add({ itemId: 'runic-crystal', quantity: 1 });

    const result = settleFinalBossLoot(inventory, [], [
      { itemId: 'guild-token', quantity: 1 },
      { itemId: 'worn-draco-claw', quantity: 2 },
    ]);

    expect(result.delivered).toEqual([]);
    expect(result.deferred).toEqual([
      { itemId: 'guild-token', quantity: 1 },
      { itemId: 'worn-draco-claw', quantity: 2 },
    ]);
    expect(result.guildVault).toEqual(result.deferred);
    expect(inventory.snapshot().backpack).toEqual([{ itemId: 'runic-crystal', quantity: 1 }]);
  });

  it('automatically delivers preserved Guild Vault items when a backpack slot is available', () => {
    const inventory = InventoryStore.empty(2);
    inventory.add({ itemId: 'runic-crystal', quantity: 1 });

    const result = deliverGuildVault(inventory, [
      { itemId: 'guild-token', quantity: 1 },
    ]);

    expect(result.delivered).toEqual([{ itemId: 'guild-token', quantity: 1 }]);
    expect(result.guildVault).toEqual([]);
    expect(inventory.snapshot().backpack).toEqual([
      { itemId: 'runic-crystal', quantity: 1 },
      { itemId: 'guild-token', quantity: 1 },
    ]);
  });
});
