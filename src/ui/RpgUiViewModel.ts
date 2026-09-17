import { WARRIOR_SKILLS } from '../combat/WarriorSkillCatalog';
import { getInventoryItem, type InventoryItemDefinition } from '../inventory/InventoryCatalog';
import type { InventorySnapshot } from '../inventory/InventoryStore';
import type { CharacterAttributeKey } from '../profile/CharacterAttributes';
import type { CanonicalRpgEquipmentSlot, PlayerProfile } from '../profile/PlayerProfile';
import {
  activeEquipmentSet,
  attributesWithEquipment,
} from '../equipment/EquipmentStatBonuses';

export type UiEquipmentSlot = CanonicalRpgEquipmentSlot;

const EQUIPMENT_LABELS: Readonly<Record<UiEquipmentSlot, string>> = {
  helmet: 'Capacete',
  chest: 'Peitoral',
  pants: 'Calça',
  gloves: 'Luvas',
  boots: 'Botas',
  secondaryWeapon: 'Segundária',
  primaryWeapon: 'Primária',
};

export interface EquipmentSlotView {
  readonly slot: UiEquipmentSlot;
  readonly label: string;
  readonly item: InventoryItemDefinition | null;
}

export interface BackpackSlotView {
  readonly index: number;
  readonly item: InventoryItemDefinition | null;
  readonly quantity: number;
}

export interface CurrentCharacterStatusView {
  readonly level: number;
  readonly attributePointsRemaining: number;
  readonly attributes: readonly {
    readonly key: CharacterAttributeKey;
    readonly label: string;
    readonly value: number;
  }[];
  readonly setBonus: {
    readonly label: string;
    readonly attributes: readonly { readonly label: string; readonly value: number }[];
  } | null;
}

export type WarriorSkillView = (typeof WARRIOR_SKILLS)[number] & {
  readonly stars: readonly boolean[];
};

export interface RpgUiViewModel {
  readonly equipment: readonly EquipmentSlotView[];
  readonly backpack: readonly BackpackSlotView[];
  readonly skills: readonly WarriorSkillView[];
  readonly currentStatus: CurrentCharacterStatusView;
}

const CURRENT_STATUS_ATTRIBUTES: readonly {
  readonly key: CharacterAttributeKey;
  readonly label: string;
}[] = [
  { key: 'vitality', label: 'Vitalidade' },
  { key: 'attack', label: 'Ataque' },
  { key: 'defense', label: 'Defesa' },
  { key: 'agility', label: 'Agilidade' },
  { key: 'criticalAttack', label: 'Crítico físico' },
  { key: 'criticalDamage', label: 'Dano crítico' },
  { key: 'lifeSteal', label: 'Roubo de vida' },
  { key: 'criticalMagic', label: 'Crítico mágico' },
  { key: 'dodge', label: 'Esquiva' },
];

export function buildRpgUiViewModel(
  profile: PlayerProfile,
  inventory: InventorySnapshot
): RpgUiViewModel {
  const equipment = (Object.keys(EQUIPMENT_LABELS) as UiEquipmentSlot[]).map((slot) => ({
    slot,
    label: EQUIPMENT_LABELS[slot],
    item: inventory.equipment[slot]
      ? getInventoryItem(inventory.equipment[slot]!) ?? null
      : null,
  }));
  const backpack: BackpackSlotView[] = Array.from({ length: inventory.capacity }, (_, index) => {
    const stack = inventory.backpack[index];
    return {
      index,
      item: stack ? getInventoryItem(stack.itemId) ?? null : null,
      quantity: stack?.quantity ?? 0,
    };
  });
  const skills: WarriorSkillView[] = WARRIOR_SKILLS.map((skill) => ({
    ...skill,
    stars: Array.from(
      { length: 5 },
      (_, index) => index < profile.skillStars[skill.id]
    ),
  }));
  const equippedAttributes = attributesWithEquipment(profile.attributes, inventory.equipment);
  const activeSet = activeEquipmentSet(inventory.equipment);
  const setBonus = activeSet
    ? {
      label: activeSet.label,
      attributes: CURRENT_STATUS_ATTRIBUTES.flatMap(({ key, label }) => {
        const value = activeSet.bonus[key] ?? 0;
        return value ? [{ label, value }] : [];
      }),
    }
    : null;
  const currentStatus: CurrentCharacterStatusView = {
    level: profile.progression.level,
    attributePointsRemaining: profile.attributePointsRemaining,
    attributes: CURRENT_STATUS_ATTRIBUTES.map(({ key, label }) => ({
      key,
      label,
      value: equippedAttributes[key],
    })),
    setBonus,
  };
  return { equipment, backpack, skills, currentStatus };
}

export function equipmentSlotLabel(slot: UiEquipmentSlot): string {
  return EQUIPMENT_LABELS[slot];
}
