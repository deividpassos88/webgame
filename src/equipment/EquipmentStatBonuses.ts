import { getInventoryItem } from '../inventory/InventoryCatalog';
import {
  ATTRIBUTE_KEYS,
  createDefaultCharacterAttributes,
  type CharacterAttributes,
} from '../profile/CharacterAttributes';
import type { PlayerEquipment } from '../profile/PlayerProfile';

const COMMON_FORGED_SET_IDS = {
  helmet: 'common-forged-helmet',
  chest: 'common-forged-chest',
  pants: 'common-forged-pants',
  gloves: 'common-forged-gloves',
  boots: 'common-forged-boots',
} as const;

export const COMMON_FORGED_SET_BONUS: Readonly<Partial<CharacterAttributes>> = {
  strength: 2,
  attack: 2,
  defense: 3,
  agility: 2,
};

export function equippedAttributeBonuses(equipment: PlayerEquipment): CharacterAttributes {
  const bonuses = createDefaultCharacterAttributes();
  for (const itemId of Object.values(equipment)) {
    const stats = itemId ? getInventoryItem(itemId)?.statBonuses : undefined;
    if (!stats) continue;
    for (const key of ATTRIBUTE_KEYS) bonuses[key] += stats[key] ?? 0;
  }
  if (hasCommonForgedSet(equipment)) {
    for (const key of ATTRIBUTE_KEYS) bonuses[key] += COMMON_FORGED_SET_BONUS[key] ?? 0;
  }
  return bonuses;
}

export function attributesWithEquipment(
  attributes: CharacterAttributes,
  equipment: PlayerEquipment
): CharacterAttributes {
  const bonuses = equippedAttributeBonuses(equipment);
  return ATTRIBUTE_KEYS.reduce((total, key) => {
    total[key] = attributes[key] + bonuses[key];
    return total;
  }, createDefaultCharacterAttributes());
}

export function hasCommonForgedSet(equipment: PlayerEquipment): boolean {
  return (Object.entries(COMMON_FORGED_SET_IDS) as [keyof typeof COMMON_FORGED_SET_IDS, string][])
    .every(([slot, itemId]) => equipment[slot] === itemId);
}
