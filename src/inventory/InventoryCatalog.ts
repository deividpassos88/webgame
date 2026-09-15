import type { RpgEquipmentSlot } from '../profile/PlayerProfile';
import type { CharacterAttributes } from '../profile/CharacterAttributes';

export type InventoryItemKind = 'equipment' | 'material' | 'consumable';
export type InventoryItemRarity = 'common' | 'rare' | 'guild';

export interface InventoryItemDefinition {
  readonly id: string;
  readonly label: string;
  readonly kind: InventoryItemKind;
  readonly maxStack: number;
  readonly slot?: RpgEquipmentSlot;
  /** Craft rarity is intentionally absent from legacy non-craft materials. */
  readonly rarity?: InventoryItemRarity;
  /** Public artwork path for material cards, notices and inspection. */
  readonly iconSrc?: string;
  /**
   * Background-free artwork shown while the item is equipped on the
   * character sheet. Falls back to `iconSrc` when absent.
   */
  readonly equippedIconSrc?: string;
  /** Short lore used by the game-owned item tooltip. */
  readonly description?: string;
  /** Weapon damage contributed only while this item is equipped. */
  readonly baseDamage?: number;
  /** Persistent attribute bonuses granted while this equipment is worn. */
  readonly statBonuses?: Partial<CharacterAttributes>;
}

export const INVENTORY_ITEMS = {
  'starter-sword': {
    id: 'starter-sword',
    label: 'Espada do Recruta',
    kind: 'equipment',
    maxStack: 1,
    slot: 'weapon',
    iconSrc: '/items/equipment/armas/sword.webp',
    equippedIconSrc: '/items/equipment/equipado/sword.webp',
    description: 'Uma espada de treino confiável, entregue à recruta da guilda.',
    baseDamage: 8,
  },
  'iron-helmet': {
    id: 'iron-helmet',
    label: 'Capacete de Ferro',
    kind: 'equipment',
    maxStack: 1,
    slot: 'helmet',
    iconSrc: '/items/equipment/common-forged/helmet.webp',
    equippedIconSrc: '/items/equipment/equipado/helmet.png',
    description: 'Capacete de ferro simples para os primeiros combates da guilda.',
    statBonuses: { defense: 1 },
  },
  'leather-chest': {
    id: 'leather-chest',
    label: 'Peitoral de Couro',
    kind: 'equipment',
    maxStack: 1,
    slot: 'chest',
    iconSrc: '/items/equipment/common-forged/chest.webp',
    equippedIconSrc: '/items/equipment/equipado/chest.png',
    description: 'Peitoral de couro reforçado que protege o torso.',
    statBonuses: { defense: 2 },
  },
  'leather-gloves': {
    id: 'leather-gloves',
    label: 'Luvas de Couro',
    kind: 'equipment',
    maxStack: 1,
    slot: 'gloves',
    iconSrc: '/items/equipment/common-forged/gloves.webp',
    equippedIconSrc: '/items/equipment/equipado/gloves.png',
    description: 'Luvas de couro que deixam a empunhadura mais firme.',
    statBonuses: { attack: 1 },
  },
  'traveler-pants': {
    id: 'traveler-pants',
    label: 'Calça do Viajante',
    kind: 'equipment',
    maxStack: 1,
    slot: 'pants',
    iconSrc: '/items/equipment/common-forged/pants.webp',
    equippedIconSrc: '/items/equipment/equipado/pants.png',
    description: 'Calça resistente para longas jornadas e esquivas rápidas.',
    statBonuses: { defense: 1, agility: 1 },
  },
  'iron-boots': {
    id: 'iron-boots',
    label: 'Botas de Ferro',
    kind: 'equipment',
    maxStack: 1,
    slot: 'boots',
    iconSrc: '/items/equipment/common-forged/boots.webp',
    equippedIconSrc: '/items/equipment/equipado/boots.png',
    description: 'Botas de ferro com sola firme para atravessar terreno hostil.',
    statBonuses: { agility: 1 },
  },
  'common-forged-helmet': {
    id: 'common-forged-helmet',
    label: 'Capacete do Forjador Comum',
    kind: 'equipment',
    rarity: 'common',
    maxStack: 1,
    slot: 'helmet',
    iconSrc: '/items/equipment/common-forged/helmet.webp',
    equippedIconSrc: '/items/equipment/equipado/helmet.png',
    description: 'Capacete comum criado na Forja de Cinzafogo. Protege contra estilhacos e golpes rasos.',
    statBonuses: { defense: 2 },
  },
  'common-forged-chest': {
    id: 'common-forged-chest',
    label: 'Peitoral do Forjador Comum',
    kind: 'equipment',
    rarity: 'common',
    maxStack: 1,
    slot: 'chest',
    iconSrc: '/items/equipment/common-forged/chest.webp',
    equippedIconSrc: '/items/equipment/equipado/chest.png',
    description: 'Peitoral comum rebitado para absorver o impacto das investidas do draco.',
    statBonuses: { strength: 3, defense: 4 },
  },
  'common-forged-pants': {
    id: 'common-forged-pants',
    label: 'Calça do Forjador Comum',
    kind: 'equipment',
    rarity: 'common',
    maxStack: 1,
    slot: 'pants',
    iconSrc: '/items/equipment/common-forged/pants.webp',
    equippedIconSrc: '/items/equipment/equipado/pants.png',
    description: 'Calca comum de placas leves, feita para manter a guarda em combate prolongado.',
    statBonuses: { defense: 3, agility: 1 },
  },
  'common-forged-gloves': {
    id: 'common-forged-gloves',
    label: 'Luvas do Forjador Comum',
    kind: 'equipment',
    rarity: 'common',
    maxStack: 1,
    slot: 'gloves',
    iconSrc: '/items/equipment/common-forged/gloves.webp',
    equippedIconSrc: '/items/equipment/equipado/gloves.png',
    description: 'Luvas comuns que firmam a empunhadura e transferem melhor a forca do golpe.',
    statBonuses: { attack: 3 },
  },
  'common-forged-boots': {
    id: 'common-forged-boots',
    label: 'Botas do Forjador Comum',
    kind: 'equipment',
    rarity: 'common',
    maxStack: 1,
    slot: 'boots',
    iconSrc: '/items/equipment/common-forged/boots.webp',
    equippedIconSrc: '/items/equipment/equipado/boots.png',
    description: 'Botas comuns com sola reforcada para avancar entre pedras e cinzas.',
    statBonuses: { agility: 3 },
  },
  'runic-crystal': {
    id: 'runic-crystal',
    label: 'Cristal Rúnico',
    kind: 'material',
    maxStack: 99,
  },
  'iron-shard': {
    id: 'iron-shard',
    label: 'Fragmento de Ferro',
    kind: 'material',
    maxStack: 99,
  },
  'ancient-cloth': {
    id: 'ancient-cloth',
    label: 'Tecido Antigo',
    kind: 'material',
    maxStack: 99,
  },
  'health-tonic': {
    id: 'health-tonic',
    label: 'Tônico de Vida',
    kind: 'consumable',
    maxStack: 10,
  },
  'worn-draco-claw': {
    id: 'worn-draco-claw',
    label: 'Garra de Draco Desgastada',
    kind: 'material',
    rarity: 'common',
    iconSrc: '/items/craft/common/1.webp',
    description: 'Usada para forjar o Capacete, Peitoral e Luvas do Forjador Comum.',
    maxStack: 99,
  },
  'worn-draco-hide': {
    id: 'worn-draco-hide',
    label: 'Couro de Draco Antigo',
    kind: 'material',
    rarity: 'common',
    iconSrc: '/items/craft/common/2.webp',
    description: 'Usada para forjar o Capacete, Peitoral e Calca do Forjador Comum.',
    maxStack: 99,
  },
  'black-horn-fragment': {
    id: 'black-horn-fragment',
    label: 'Fragmento de Chifre Negro',
    kind: 'material',
    rarity: 'common',
    iconSrc: '/items/craft/common/3.webp',
    description: 'Usado para forjar o Capacete, Calca e Botas do Forjador Comum.',
    maxStack: 99,
  },
  'crimson-fang': {
    id: 'crimson-fang',
    label: 'Presa Carmesim',
    kind: 'material',
    rarity: 'common',
    iconSrc: '/items/craft/common/4.webp',
    description: 'Usada para forjar o Capacete, Luvas e Botas do Forjador Comum.',
    maxStack: 99,
  },
  'serrated-rubra-scale': {
    id: 'serrated-rubra-scale',
    label: 'Escama Rubra Serrilhada',
    kind: 'material',
    rarity: 'common',
    iconSrc: '/items/craft/common/5.webp',
    description: 'Usada para forjar o Capacete e as Luvas do Forjador Comum.',
    maxStack: 99,
  },
  'volatile-draconic-essence': {
    id: 'volatile-draconic-essence',
    label: 'Essência Dracônica Instável',
    kind: 'material',
    rarity: 'common',
    iconSrc: '/items/craft/common/6.webp',
    description: 'Usada para forjar o Peitoral, Calca e Botas do Forjador Comum.',
    maxStack: 99,
  },
  'ossified-draco-ribs': {
    id: 'ossified-draco-ribs',
    label: 'Costelas de Draco Ossificadas',
    kind: 'material',
    rarity: 'common',
    iconSrc: '/items/craft/common/7.webp',
    description: 'Usadas para forjar o Peitoral e as Luvas do Forjador Comum.',
    maxStack: 99,
  },
  'verdant-draco-talisman': {
    id: 'verdant-draco-talisman',
    label: 'Talismã Dracônico Esmeralda',
    kind: 'material',
    rarity: 'common',
    iconSrc: '/items/craft/common/8.webp',
    description: 'Usado para forjar o Peitoral e as Botas do Forjador Comum.',
    maxStack: 99,
  },
  'crimson-draco-talon': {
    id: 'crimson-draco-talon',
    label: 'Garra do Draco Carmesim',
    kind: 'material',
    rarity: 'common',
    iconSrc: '/items/craft/common/9.webp',
    description: 'Usada para forjar a Calca e as Luvas do Forjador Comum.',
    maxStack: 99,
  },
  'obsidian-draco-eye': {
    id: 'obsidian-draco-eye',
    label: 'Olho de Draco Obsidiano',
    kind: 'material',
    rarity: 'common',
    iconSrc: '/items/craft/common/10.webp',
    description: 'Usado para forjar a Calca e as Botas do Forjador Comum.',
    maxStack: 99,
  },
  'fractured-draconic-heart': {
    id: 'fractured-draconic-heart',
    label: 'Coração Dracônico Fraturado',
    kind: 'material',
    rarity: 'rare',
    iconSrc: '/items/craft/rare/1.png',
    maxStack: 99,
  },
  'abyssal-draco-carapace': {
    id: 'abyssal-draco-carapace',
    label: 'Carapaça do Draco Abissal',
    kind: 'material',
    rarity: 'rare',
    iconSrc: '/items/craft/rare/2.png',
    maxStack: 99,
  },
  'ancestral-scale-core': {
    id: 'ancestral-scale-core',
    label: 'Núcleo de Escamas Ancestrais',
    kind: 'material',
    rarity: 'rare',
    iconSrc: '/items/craft/rare/3.png',
    maxStack: 99,
  },
  'draconic-thorn-crown': {
    id: 'draconic-thorn-crown',
    label: 'Coroa de Espinhos Dracônicos',
    kind: 'material',
    rarity: 'rare',
    iconSrc: '/items/craft/rare/4.png',
    maxStack: 99,
  },
  'ancestral-crimson-plate': {
    id: 'ancestral-crimson-plate',
    label: 'Placa Carmesim Ancestral',
    kind: 'material',
    rarity: 'rare',
    iconSrc: '/items/craft/rare/5.png',
    maxStack: 99,
  },
  'guild-token': {
    id: 'guild-token',
    label: 'Token da Guilda',
    kind: 'material',
    rarity: 'guild',
    iconSrc: '/items/craft/token-guild.png',
    maxStack: 999,
  },
} as const satisfies Record<string, InventoryItemDefinition>;

export type InventoryItemId = keyof typeof INVENTORY_ITEMS;

export function getInventoryItem(itemId: string): InventoryItemDefinition | undefined {
  return INVENTORY_ITEMS[itemId as InventoryItemId];
}

export function isCraftMaterial(
  item: InventoryItemDefinition | undefined
): item is InventoryItemDefinition & { readonly rarity: InventoryItemRarity; readonly iconSrc: string } {
  return item?.kind === 'material' && item.rarity !== undefined && item.iconSrc !== undefined;
}
