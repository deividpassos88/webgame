import { describe, expect, it } from 'vitest';
import { getInventoryItem } from './InventoryCatalog';

describe('final boss craft catalog', () => {
  it('catalogues the starter sword as an unequipped recruit weapon with its art and base damage', () => {
    expect(getInventoryItem('starter-sword')).toMatchObject({
      id: 'starter-sword',
      label: 'Espada do Recruta',
      kind: 'equipment',
      maxStack: 1,
      slot: 'weapon',
      iconSrc: '/items/equipment/armas/sword.webp',
      description: 'Uma espada de treino confiável, entregue à recruta da guilda.',
      baseDamage: 8,
    });
  });

  it('catalogues the five additional common draconic materials with supplied WebP art', () => {
    const expected = [
      ['volatile-draconic-essence', 'Essência Dracônica Instável', '/items/craft/common/6.webp'],
      ['ossified-draco-ribs', 'Costelas de Draco Ossificadas', '/items/craft/common/7.webp'],
      ['verdant-draco-talisman', 'Talismã Dracônico Esmeralda', '/items/craft/common/8.webp'],
      ['crimson-draco-talon', 'Garra do Draco Carmesim', '/items/craft/common/9.webp'],
      ['obsidian-draco-eye', 'Olho de Draco Obsidiano', '/items/craft/common/10.webp'],
    ] as const;

    for (const [id, label, iconSrc] of expected) {
      expect(getInventoryItem(id)).toMatchObject({
        id,
        label,
        kind: 'material',
        rarity: 'common',
        iconSrc,
      });
      expect(getInventoryItem(id)?.description).toEqual(expect.any(String));
      expect(getInventoryItem(id)?.description?.trim().length).toBeGreaterThan(0);
    }
  });

  it('catalogues the five common forged equipment pieces with their compatible slots and supplied art', () => {
    const expected = [
      ['common-forged-helmet', 'Capacete do Forjador Comum', 'helmet', '/items/equipment/common-forged/helmet.webp'],
      ['common-forged-chest', 'Peitoral do Forjador Comum', 'chest', '/items/equipment/common-forged/chest.webp'],
      ['common-forged-pants', 'Calça do Forjador Comum', 'pants', '/items/equipment/common-forged/pants.webp'],
      ['common-forged-gloves', 'Luvas do Forjador Comum', 'gloves', '/items/equipment/common-forged/gloves.webp'],
      ['common-forged-boots', 'Botas do Forjador Comum', 'boots', '/items/equipment/common-forged/boots.webp'],
    ] as const;

    for (const [id, label, slot, iconSrc] of expected) {
      expect(getInventoryItem(id)).toMatchObject({
        id,
        label,
        kind: 'equipment',
        rarity: 'common',
        slot,
        maxStack: 1,
        iconSrc,
        equippedIconSrc: `/items/equipment/equipado/${slot}.png`,
      });
    }
  });

  it('catalogues all provided common and rare materials as non-equippable craft materials', () => {
    const expected = [
      ['worn-draco-claw', 'Garra de Draco Desgastada', 'common', '/items/craft/common/1.webp'],
      ['worn-draco-hide', 'Couro de Draco Antigo', 'common', '/items/craft/common/2.webp'],
      ['black-horn-fragment', 'Fragmento de Chifre Negro', 'common', '/items/craft/common/3.webp'],
      ['crimson-fang', 'Presa Carmesim', 'common', '/items/craft/common/4.webp'],
      ['serrated-rubra-scale', 'Escama Rubra Serrilhada', 'common', '/items/craft/common/5.webp'],
      ['fractured-draconic-heart', 'Coração Dracônico Fraturado', 'rare', '/items/craft/rare/1.png'],
      ['abyssal-draco-carapace', 'Carapaça do Draco Abissal', 'rare', '/items/craft/rare/2.png'],
      ['ancestral-scale-core', 'Núcleo de Escamas Ancestrais', 'rare', '/items/craft/rare/3.png'],
      ['draconic-thorn-crown', 'Coroa de Espinhos Dracônicos', 'rare', '/items/craft/rare/4.png'],
      ['ancestral-crimson-plate', 'Placa Carmesim Ancestral', 'rare', '/items/craft/rare/5.png'],
    ] as const;

    for (const [id, label, rarity, iconSrc] of expected) {
      expect(getInventoryItem(id)).toMatchObject({
        id,
        label,
        kind: 'material',
        rarity,
        iconSrc,
      });
      expect(getInventoryItem(id)?.slot).toBeUndefined();
    }
  });

  it('catalogues the Guild Token with its supplied artwork as a non-equippable craft material', () => {
    expect(getInventoryItem('guild-token')).toMatchObject({
      label: 'Token da Guilda',
      kind: 'material',
      rarity: 'guild',
      iconSrc: '/items/craft/token-guild.png',
    });
    expect(getInventoryItem('guild-token')?.slot).toBeUndefined();
  });
});
