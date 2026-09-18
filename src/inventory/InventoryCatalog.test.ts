import { describe, expect, it } from 'vitest';
import { getInventoryItem } from './InventoryCatalog';

describe('final boss craft catalog', () => {
  it('catalogues the starter sword as an unequipped novice weapon with its art and base damage', () => {
    expect(getInventoryItem('starter-sword')).toMatchObject({
      id: 'starter-sword',
      label: 'Sword Novice',
      kind: 'equipment',
      maxStack: 1,
      slot: 'weapon',
      iconSrc: '/items/equipment/armas/sword.webp',
      description: 'Uma espada de treino confiável, entregue à recruta da guilda.',
      baseDamage: 4,
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

  it('catalogues both forged lines with their line tag, slots and supplied art', () => {
    const expected = [
      ['common-forged-helmet', 'Draconic Helmet [DEF]', 'helmet', 'defense'],
      ['common-forged-chest', 'Draconic Chestplate [DEF]', 'chest', 'defense'],
      ['common-forged-pants', 'Draconic Pants [DEF]', 'pants', 'defense'],
      ['common-forged-gloves', 'Draconic Gloves [DEF]', 'gloves', 'defense'],
      ['common-forged-boots', 'Draconic Boots [DEF]', 'boots', 'defense'],
      ['common-forged-helmet-atk', 'Draconic Helmet [ATK]', 'helmet', 'attack'],
      ['common-forged-chest-atk', 'Draconic Chestplate [ATK]', 'chest', 'attack'],
      ['common-forged-pants-atk', 'Draconic Pants [ATK]', 'pants', 'attack'],
      ['common-forged-gloves-atk', 'Draconic Gloves [ATK]', 'gloves', 'attack'],
      ['common-forged-boots-atk', 'Draconic Boots [ATK]', 'boots', 'attack'],
    ] as const;

    for (const [id, label, slot, craftLine] of expected) {
      expect(getInventoryItem(id)).toMatchObject({
        id,
        label,
        kind: 'equipment',
        rarity: 'common',
        slot,
        craftLine,
        maxStack: 1,
        iconSrc: `/items/equipment/common-forged/${slot}.webp`,
        equippedIconSrc: `/items/equipment/equipado/${slot}.png`,
      });
    }
  });

  it('focuses every defensive piece on Defense and every offensive piece on Attack', () => {
    for (const slot of ['helmet', 'chest', 'pants', 'gloves', 'boots'] as const) {
      const defense = getInventoryItem(`common-forged-${slot}`);
      const attack = getInventoryItem(`common-forged-${slot}-atk`);

      expect(defense?.statBonuses?.defense ?? 0).toBeGreaterThan(0);
      expect(defense?.statBonuses?.defense ?? 0).toBeGreaterThan(defense?.statBonuses?.attack ?? 0);
      expect(attack?.statBonuses?.attack ?? 0).toBeGreaterThan(0);
      expect(attack?.statBonuses?.attack ?? 0).toBeGreaterThan(attack?.statBonuses?.defense ?? 0);
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
