import { getInventoryItem } from '../inventory/InventoryCatalog';
import {
  ATTRIBUTE_KEYS,
  createDefaultCharacterAttributes,
  type CharacterAttributes,
} from '../profile/CharacterAttributes';
import type { PlayerEquipment } from '../profile/PlayerProfile';

/** The common forged line, worn as a full set. */
const COMMON_FORGE_SET_IDS = {
  helmet: 'common-forged-helmet',
  chest: 'common-forged-chest',
  pants: 'common-forged-pants',
  gloves: 'common-forged-gloves',
  boots: 'common-forged-boots',
} as const;

/**
 * Five-piece bonus for the common forged line. The retired `strength` point was
 * worth one health, while `vitality` is worth three, so the old +2 becomes a
 * single vitality point.
 */
export const COMMON_FORGED_SET_BONUS: Readonly<Partial<CharacterAttributes>> = {
  vitality: 1,
  attack: 2,
  defense: 3,
  agility: 2,
};

/**
 * Every worn slot, in the order the bonuses are summed. The legacy `weapon`
 * field is read through the same fallback the combat pipeline uses so a profile
 * that mirrors one item in `weapon` and `primaryWeapon` never counts it twice.
 */
function wornItemIds(equipment: PlayerEquipment): readonly string[] {
  const weapon = equipment.primaryWeapon ?? equipment.weapon ?? null;
  const itemIds = [
    equipment.helmet,
    equipment.chest,
    equipment.pants,
    equipment.gloves,
    equipment.boots,
    weapon,
    equipment.secondaryWeapon,
  ];
  return itemIds.filter((itemId): itemId is string => Boolean(itemId));
}

/**
 * Weapon damage handed to the combat pipeline. The lobby sheet, the character
 * overlay and Game resolve the same number, so equipping (or removing) a sword
 * always moves the attack reading by its base damage.
 */
export function equippedWeaponDamage(equipment: PlayerEquipment): number {
  const itemId = equipment.primaryWeapon ?? equipment.weapon ?? null;
  const item = itemId ? getInventoryItem(itemId) : undefined;
  return item?.kind === 'equipment' && item.slot === 'weapon'
    ? Math.max(0, item.baseDamage ?? 0)
    : 0;
}

export function equippedAttributeBonuses(equipment: PlayerEquipment): CharacterAttributes {
  const bonuses = createDefaultCharacterAttributes();
  for (const itemId of wornItemIds(equipment)) {
    const stats = getInventoryItem(itemId)?.statBonuses;
    if (!stats) continue;
    for (const key of ATTRIBUTE_KEYS) bonuses[key] += stats[key] ?? 0;
  }
  if (hasCommonForgedSet(equipment)) {
    for (const key of ATTRIBUTE_KEYS) bonuses[key] += COMMON_FORGED_SET_BONUS[key] ?? 0;
  }
  return bonuses;
}

export function hasCommonForgedSet(equipment: PlayerEquipment): boolean {
  return (Object.entries(COMMON_FORGE_SET_IDS) as [keyof typeof COMMON_FORGE_SET_IDS, string][])
    .every(([slot, itemId]) => equipment[slot] === itemId);
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
