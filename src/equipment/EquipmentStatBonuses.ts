import { getInventoryItem } from '../inventory/InventoryCatalog';
import {
  ATTRIBUTE_KEYS,
  createDefaultCharacterAttributes,
  type CharacterAttributes,
} from '../profile/CharacterAttributes';
import type { PlayableCharacterId } from '../characters/CharacterCatalog';
import type { PlayerEquipment } from '../profile/PlayerProfile';

import type { CraftLineId } from '../crafting/CraftLine';

/**
 * The forged lines, worn as a full set. Both share the five slots; the ids
 * differ because the workshop now forges an ATK and a DEF variant of each.
 * Classes are separate too: the Guerreiro wears `common-forged-*` and the Maga
 * the mirror `maga-forged-*` pieces, so each set is checked on its own ids and
 * a loadout that mixes classes earns no set bonus.
 */
const FORGE_SET_IDS: Readonly<Record<CraftLineId, Readonly<Record<PlayableCharacterId, Readonly<Record<ArmorSlot, string>>>>>> = {
  defense: {
    paladin: {
      helmet: 'common-forged-helmet',
      chest: 'common-forged-chest',
      pants: 'common-forged-pants',
      gloves: 'common-forged-gloves',
      boots: 'common-forged-boots',
    },
    mage: {
      helmet: 'maga-forged-helmet',
      chest: 'maga-forged-chest',
      pants: 'maga-forged-pants',
      gloves: 'maga-forged-gloves',
      boots: 'maga-forged-boots',
    },
  },
  attack: {
    paladin: {
      helmet: 'common-forged-helmet-atk',
      chest: 'common-forged-chest-atk',
      pants: 'common-forged-pants-atk',
      gloves: 'common-forged-gloves-atk',
      boots: 'common-forged-boots-atk',
    },
    mage: {
      helmet: 'maga-forged-helmet-atk',
      chest: 'maga-forged-chest-atk',
      pants: 'maga-forged-pants-atk',
      gloves: 'maga-forged-gloves-atk',
      boots: 'maga-forged-boots-atk',
    },
  },
};

/** The five armor slots a forged set covers (weapons are not part of it). */
type ArmorSlot = 'helmet' | 'chest' | 'pants' | 'gloves' | 'boots';
const ARMOR_SLOTS: readonly ArmorSlot[] = ['helmet', 'chest', 'pants', 'gloves', 'boots'];

/**
 * Five-piece bonus per line. Each set leans on the attribute its pieces stack:
 * the defensive line closes on Defense (plus health), the offensive one on
 * Attack. The retired `strength` point was worth one health, while `vitality`
 * is worth three, so the old +2 becomes a single vitality point.
 */
export const FORGED_SET_BONUS: Readonly<Record<CraftLineId, Readonly<Partial<CharacterAttributes>>>> = {
  defense: {
    vitality: 2,
    defense: 7,
    agility: 1,
  },
  attack: {
    vitality: 1,
    attack: 7,
    agility: 2,
  },
};

/**
 * Bonus of the defensive line, kept under the historical name so surfaces that
 * only ever rendered the original set keep compiling unchanged.
 */
export const COMMON_FORGED_SET_BONUS: Readonly<Partial<CharacterAttributes>> = FORGED_SET_BONUS.defense;

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
  const setLine = equippedForgedSetLine(equipment);
  if (setLine) {
    for (const key of ATTRIBUTE_KEYS) bonuses[key] += FORGED_SET_BONUS[setLine][key] ?? 0;
  }
  return bonuses;
}

/** True when the five armor slots wear the same forged line. */
export function hasCommonForgedSet(equipment: PlayerEquipment): boolean {
  return equippedForgedSetLine(equipment) !== null;
}

/**
 * Which forged line is worn as a complete set, or `null` when the armor is
 * incomplete or mixes lines or classes - a mixed loadout earns no set bonus.
 */
export function equippedForgedSetLine(equipment: PlayerEquipment): CraftLineId | null {
  for (const line of ['defense', 'attack'] as const) {
    for (const classRole of ['paladin', 'mage'] as const) {
      const ids = FORGE_SET_IDS[line][classRole];
      if (ARMOR_SLOTS.every((slot) => equipment[slot] === ids[slot])) return line;
    }
  }
  return null;
}

/** Set label for the line currently worn, used by the character sheet. */
export function forgedSetLabel(line: CraftLineId | null): string | null {
  if (line === 'attack') return 'Conjunto Dragonic ATK';
  if (line === 'defense') return 'Conjunto Dragonic DEF';
  return null;
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
