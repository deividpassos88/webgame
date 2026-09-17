import { getInventoryItem } from '../inventory/InventoryCatalog';
import {
  ATTRIBUTE_KEYS,
  createDefaultCharacterAttributes,
  type CharacterAttributes,
} from '../profile/CharacterAttributes';
import type { PlayerEquipment } from '../profile/PlayerProfile';

/** Slots covered by a forged set, in the order the forge lists them. */
export const EQUIPMENT_SET_SLOTS = ['helmet', 'chest', 'pants', 'gloves', 'boots'] as const;
export type EquipmentSetSlot = (typeof EQUIPMENT_SET_SLOTS)[number];

export interface EquipmentSetDefinition {
  readonly id: 'predator' | 'bulwark';
  readonly label: string;
  /** Short player-facing identity of the line, used by the forge. */
  readonly tagline: string;
  readonly itemIds: Readonly<Record<EquipmentSetSlot, string>>;
  /** Granted once all five pieces of the set are worn at the same time. */
  readonly bonus: Readonly<Partial<CharacterAttributes>>;
}

/**
 * The common forged set used to be one flat "a little of everything" line with
 * a single five-piece bonus. It was split into two specialised lines so gear
 * changes how a fight plays out: Predador pushes damage, Muralha pushes
 * survivability. Values are tuned against the derived-stat curve in
 * CharacterAttributes (30 invested points is a full specialty).
 */
export const EQUIPMENT_SETS: readonly EquipmentSetDefinition[] = [
  {
    id: 'predator',
    label: 'Conjunto do Predador',
    tagline: 'Ofensivo: crítico, dano crítico e roubo de vida.',
    itemIds: {
      helmet: 'predator-forged-helmet',
      chest: 'predator-forged-chest',
      pants: 'predator-forged-pants',
      gloves: 'predator-forged-gloves',
      boots: 'predator-forged-boots',
    },
    bonus: { attack: 6, criticalAttack: 8, criticalDamage: 12, lifeSteal: 4 },
  },
  {
    id: 'bulwark',
    label: 'Conjunto da Muralha',
    tagline: 'Defensivo: vida, redução de dano e esquiva.',
    itemIds: {
      helmet: 'bulwark-forged-helmet',
      chest: 'bulwark-forged-chest',
      pants: 'bulwark-forged-pants',
      gloves: 'bulwark-forged-gloves',
      boots: 'bulwark-forged-boots',
    },
    bonus: { vitality: 14, defense: 16, dodge: 8 },
  },
];

export function equipmentSetById(id: string): EquipmentSetDefinition | undefined {
  return EQUIPMENT_SETS.find((set) => set.id === id);
}

/** The first set whose five pieces are all worn, or null when incomplete. */
export function activeEquipmentSet(equipment: PlayerEquipment): EquipmentSetDefinition | null {
  return EQUIPMENT_SETS.find((set) => isEquipmentSetComplete(equipment, set)) ?? null;
}

export function isEquipmentSetComplete(
  equipment: PlayerEquipment,
  set: EquipmentSetDefinition
): boolean {
  return EQUIPMENT_SET_SLOTS.every((slot) => equipment[slot] === set.itemIds[slot]);
}

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
 * always moves the "Dano" reading by its base damage.
 */
export function equippedWeaponDamage(equipment: PlayerEquipment): number {
  const itemId = equipment.primaryWeapon ?? equipment.weapon ?? null;
  const item = itemId ? getInventoryItem(itemId) : undefined;
  return item?.kind === 'equipment' && item.slot === 'weapon'
    ? Math.max(0, item.baseDamage ?? 0)
    : 0;
}

/** Total attribute bonus from every worn piece plus the completed set. */
export function equippedAttributeBonuses(equipment: PlayerEquipment): CharacterAttributes {
  const bonuses = createDefaultCharacterAttributes();
  for (const itemId of wornItemIds(equipment)) {
    const stats = itemId ? getInventoryItem(itemId)?.statBonuses : undefined;
    if (!stats) continue;
    for (const key of ATTRIBUTE_KEYS) bonuses[key] += stats[key] ?? 0;
  }
  const set = activeEquipmentSet(equipment);
  if (set) {
    for (const key of ATTRIBUTE_KEYS) bonuses[key] += set.bonus[key] ?? 0;
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

/**
 * Human-readable set bonus, e.g. "Ataque +6 · Crítico físico +8". The forge and
 * the status panel share it so the promised bonus cannot drift from the one the
 * combat pipeline actually applies.
 */
export function describeSetBonus(
  set: EquipmentSetDefinition,
  labelFor: (key: keyof CharacterAttributes) => string,
  percentKeys: readonly (keyof CharacterAttributes)[] = []
): string {
  return ATTRIBUTE_KEYS.flatMap((key) => {
    const value = set.bonus[key] ?? 0;
    if (!value) return [];
    const rendered = percentKeys.includes(key) ? `+${value * 0.1}%` : `+${value}`;
    return [`${labelFor(key)} ${rendered}`];
  }).join(' · ');
}
