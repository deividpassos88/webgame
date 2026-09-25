import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { INVENTORY_ITEMS, type InventoryItemDefinition } from './InventoryCatalog';

/**
 * Every artwork path the catalog declares must exist on disk, so folder
 * reorganizations (like the Guerreiro/Maga split under common-forged and
 * equipado) can never silently break an image in the UI.
 */
describe('equipment artwork folders', () => {
  it('ships every iconSrc and equippedIconSrc referenced by the catalog', () => {
    const items = Object.values(INVENTORY_ITEMS) as readonly InventoryItemDefinition[];
    for (const item of items) {
      for (const artPath of [item.iconSrc, item.equippedIconSrc]) {
        if (!artPath) continue;
        const file = new URL(`../../public${artPath}`, import.meta.url);
        expect(existsSync(file), `${item.id}: ${artPath} ausente em public/`).toBe(true);
      }
    }
  });

  it('keeps the Guerreiro and Maga set artwork split per class folders', () => {
    for (const slot of ['boots', 'chest', 'gloves', 'helmet', 'pants'] as const) {
      expect(existsSync(new URL(`../../public/items/equipment/common-forged/guerreiro/${slot}.webp`, import.meta.url))).toBe(true);
      expect(existsSync(new URL(`../../public/items/equipment/common-forged/maga/${slot}.webp`, import.meta.url))).toBe(true);
    }
    for (const slot of ['boots', 'chest', 'gloves', 'helmet', 'pants'] as const) {
      expect(existsSync(new URL(`../../public/items/equipment/equipado/maga/${slot}.webp`, import.meta.url))).toBe(true);
    }
    for (const file of ['boots.png', 'chest.png', 'gloves.png', 'helmet.png', 'pants.png', 'sword.webp']) {
      expect(existsSync(new URL(`../../public/items/equipment/equipado/guerreiro/${file}`, import.meta.url))).toBe(true);
    }
    // The equipped cajado keeps the path the workshop delivery uses.
    expect(existsSync(new URL('../../public/items/equipment/equipado/cajado_equipado.webp', import.meta.url))).toBe(true);
  });
});
