import type { WarriorSkillDefinition } from '../combat/WarriorSkillCatalog';
import type { InventoryItemKind } from '../inventory/InventoryCatalog';
import type { PlayableCharacterId } from '../characters/CharacterCatalog';
import type { UiEquipmentSlot } from './RpgUiViewModel';

const base = (paths: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;

/**
 * Painted art used by the empty equipment sockets: one piece per slot, so the
 * player reads where the item goes instead of a generic outline. A socket with
 * an item shows that item's art, never this placeholder.
 *
 * The seven files live in public/assets/ui/lobby/arena/slots and were cut out
 * from the same bronze-line art direction as the equipped pieces. The primary
 * weapon socket is class-bound: the sword placeholder appears only for the
 * Guerreiro and the cajado placeholder only for the Maga.
 */
const EQUIPMENT_SLOT_ICON_SOURCES: Record<UiEquipmentSlot, string> = {
  helmet: 'helmet.png',
  chest: 'chest.png',
  pants: 'pants.png',
  gloves: 'gloves.png',
  boots: 'boots.png',
  primaryWeapon: 'sword.png',
  secondaryWeapon: 'shield.png',
};

const CLASS_WEAPON_SLOT_ICONS: Partial<Record<PlayableCharacterId, string>> = {
  mage: 'cajado.webp',
};

export function equipmentSlotIconSource(slot: UiEquipmentSlot, classId?: PlayableCharacterId): string {
  const classIcon = slot === 'primaryWeapon' && classId
    ? CLASS_WEAPON_SLOT_ICONS[classId]
    : undefined;
  return `/assets/ui/lobby/arena/slots/${classIcon ?? EQUIPMENT_SLOT_ICON_SOURCES[slot]}`;
}

/** Markup for the placeholder inside an empty socket. Decorative only. */
export function equipmentSlotIcon(slot: UiEquipmentSlot, classId?: PlayableCharacterId): string {
  return `<img class="equipment-slot__icon" src="${equipmentSlotIconSource(slot, classId)}" alt="" aria-hidden="true" loading="lazy" decoding="async">`;
}

export function equipmentIcon(slot: UiEquipmentSlot): string {
  const icons: Record<UiEquipmentSlot, string> = {
    helmet: '<path d="M5 12a7 7 0 0 1 14 0v7h-5v-5h-4v5H5v-7Z"/><path d="M8 9h8"/>',
    chest: '<path d="m8 4 4 2 4-2 4 4-3 3v9H7v-9L4 8l4-4Z"/><path d="M12 6v14"/>',
    gloves: '<path d="M7 4v7M10 3v8M13 4v7M16 6v8c0 4-2 6-6 6s-6-3-6-7v-2h3"/>',
    pants: '<path d="M7 4h10l1 16h-5l-1-9-1 9H6L7 4Z"/>',
    boots: '<path d="M6 4h5v10l3 2v4H4v-4l2-3V4ZM15 4h4v12l2 1v3h-7"/>',
    primaryWeapon: '<path d="m5 19 12-12M14 4l6 6M4 15l5 5M3 21l3-3"/>',
    secondaryWeapon: '<path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z"/>',
  };
  return base(icons[slot]);
}

export function skillIcon(icon: WarriorSkillDefinition['icon'] | 'basic'): string {
  const icons: Record<WarriorSkillDefinition['icon'] | 'basic', string> = {
    basic: '<path d="m4 20 13-13M14 4l6 6M3 16l5 5"/>',
    spin: '<path d="M5 7a8 8 0 1 1-1 8"/><path d="M4 4v5h5M8 16l9-9"/>',
    'arcane-spin': '<circle cx="12" cy="12" r="8"/><path d="M12 4c4 4 4 12 0 16M4 12h16"/>',
    'jump-impact': '<path d="M12 3v12M7 8l5-5 5 5M4 20h16M7 17h10"/>',
    'triple-flame': '<path d="M8 20c-3-4 1-7 2-10 1 2 2 3 3 4 1-4 0-7 2-10 4 5 5 9 2 13-2 3-6 4-9 3Z"/><path d="m4 7 3 3M20 7l-3 3"/>',
    'double-cut': '<path d="M4 18 17 5M7 21 20 8M14 4l6 6M3 15l6 6"/>',
  };
  return base(icons[icon]);
}

export function itemKindIcon(kind: InventoryItemKind): string {
  if (kind === 'equipment') return base('<path d="m5 19 12-12M14 4l6 6M4 15l5 5"/>');
  if (kind === 'consumable') return base('<path d="M9 3h6M10 3v5l-4 6a4 4 0 0 0 4 6h4a4 4 0 0 0 4-6l-4-6V3Z"/><path d="M8 15h8"/>');
  return base('<path d="m12 3 7 5-3 10H8L5 8l7-5Z"/><path d="m8 8 4 4 4-4M12 12v6"/>');
}
