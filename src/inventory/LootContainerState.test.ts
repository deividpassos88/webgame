import { describe, expect, it } from 'vitest';
import { LootContainerState } from './LootContainerState';

describe('LootContainerState', () => {
  it('removes only a requested quantity and drops empty stacks', () => {
    const container = new LootContainerState('urn-2', [
      { itemId: 'iron-shard', quantity: 5 },
      { itemId: 'health-tonic', quantity: 1 },
    ]);

    expect(container.take('iron-shard', 2)).toBe(2);
    expect(container.take('health-tonic', 5)).toBe(1);
    expect(container.snapshot()).toEqual({
      id: 'urn-2',
      items: [{ itemId: 'iron-shard', quantity: 3 }],
    });
  });

  it('returns defensive snapshots that cannot mutate the container', () => {
    const container = new LootContainerState('urn-3', [
      { itemId: 'ancient-cloth', quantity: 2 },
    ]);
    const snapshot = container.snapshot();
    snapshot.items[0].quantity = 99;

    expect(container.available('ancient-cloth')).toBe(2);
  });
});
