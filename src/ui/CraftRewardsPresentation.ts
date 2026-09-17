import {
  getInventoryItem,
  isCraftMaterial,
  type InventoryItemDefinition,
} from '../inventory/InventoryCatalog';
import type { InventoryStack } from '../profile/PlayerProfile';
import type { UiEquipmentSlot } from './RpgUiViewModel';
import { equipmentSlotIcon, itemKindIcon } from './RpgIcons';

export function craftRarityLabel(item: Pick<InventoryItemDefinition, 'rarity'>): string {
  if (item.rarity === 'rare') return 'Raro';
  if (item.rarity === 'guild') return 'Guilda';
  return 'Comum';
}

/** Reuses the supplied PNG when available and the project RPG icon set otherwise. */
export function inventoryItemArt(item: InventoryItemDefinition): string {
  if (item.iconSrc) {
    return `<img class="inventory-item-art" src="${item.iconSrc}" alt="" aria-hidden="true">`;
  }
  return `<span class="inventory-item-glyph" aria-hidden="true">${itemKindIcon(item.kind)}</span>`;
}

/**
 * Prefers the background-free equipped artwork so the character sheet shows a
 * premium, integrated silhouette instead of a framed inventory card. Falls
 * back to the regular inventory art while the dedicated piece is missing.
 */
export function equippedItemArt(item: InventoryItemDefinition): string {
  if (item.equippedIconSrc) {
    return `<img class="inventory-item-art is-equipped-art" src="${item.equippedIconSrc}" alt="" aria-hidden="true">`;
  }
  return inventoryItemArt(item);
}

export function renderInventorySlotContent(
  item: InventoryItemDefinition,
  quantity: number
): string {
  return `${inventoryItemArt(item)}<span class="item-quantity" data-item-quantity>${Math.max(1, Math.floor(quantity))}</span>`;
}

/**
 * Item names carry the tier in brackets ("Draconic Helmet [Common]"). Rendering
 * splits that suffix into its own element so it can stay smaller and brighter
 * than the name without repeating the markup in every surface.
 */
export function renderItemLabel(label: string): string {
  const match = /^(.*?)\s*\[([^\]]+)\]$/.exec(label.trim());
  if (!match) return escapeItemLabel(label);
  return `${escapeItemLabel(match[1])}<span class="item-label__tier">[${escapeItemLabel(match[2])}]</span>`;
}

function escapeItemLabel(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Supplies the stable data contract shared by every item tooltip trigger. */
export function itemTooltipDataAttributes(
  item: Pick<InventoryItemDefinition, 'id'>,
  quantity: number
): string {
  return `data-item-tooltip-id="${item.id}" data-item-tooltip-quantity="${Math.max(1, Math.floor(quantity))}"`;
}

/** Keeps equipment cards visual: equipped art in the center and one engraved slot label. */
export function renderEquipmentSlotContent(
  slot: UiEquipmentSlot,
  label: string,
  item: InventoryItemDefinition | null
): string {
  return `
    <span class="equipment-slot__art"${item ? '' : ' aria-hidden="true"'}>${item ? equippedItemArt(item) : equipmentSlotIcon(slot)}</span>
    <span class="equipment-slot__label">${label}</span>`;
}

/** True when the inspector can present the item, i.e. craft materials and equipment. */
export function isInspectableItem(item: InventoryItemDefinition | undefined): item is InventoryItemDefinition {
  return isCraftMaterial(item) || (item?.kind === 'equipment' && Boolean(item.slot));
}

export function populateCraftInspector(
  inspector: HTMLElement,
  item: InventoryItemDefinition,
  quantity: number
): void {
  if (!isInspectableItem(item)) return;
  const equipment = item.kind === 'equipment';
  inspector.dataset.rarity = item.rarity ?? 'common';
  const image = inspector.querySelector<HTMLImageElement>('[data-craft-inspector-image]');
  if (image) {
    image.src = item.iconSrc ?? '';
    image.alt = `Ilustração de ${item.label}`;
  }
  const rarity = inspector.querySelector<HTMLElement>('[data-craft-inspector-rarity]');
  if (rarity) rarity.textContent = craftRarityLabel(item);
  const name = inspector.querySelector<HTMLElement>('[data-craft-inspector-name]');
  if (name) name.textContent = item.label;
  const copy = inspector.querySelector<HTMLElement>('[data-craft-inspector-copy]');
  if (copy) copy.textContent = equipment ? item.description ?? 'Equipamento' : 'Material de craft';
  const amount = inspector.querySelector<HTMLOutputElement>('[data-craft-inspector-quantity]');
  if (amount) amount.textContent = `x${Math.max(1, Math.floor(quantity))}`;
  // Equipping is an explicit confirmation so a stray click never swaps gear.
  const equip = inspector.querySelector<HTMLButtonElement>('[data-equip-inventory-item]');
  if (equip) equip.hidden = !equipment;
}

export function renderCraftRewardNotification(
  host: HTMLElement,
  rewards: readonly InventoryStack[],
  deferred: readonly InventoryStack[] = [],
  saved = true
): void {
  const rewardItems = toCraftRows(rewards);
  const deferredItems = toCraftRows(deferred);
  host.setAttribute('aria-label', 'Recompensas do boss final');
  host.innerHTML = `
    <header class="craft-notice-heading"><span>Recompensas do boss final</span><strong>Baú de Cinzafogo</strong></header>
    <ul class="craft-notice-list">${rewardItems.map(renderRewardRow).join('')}</ul>
    ${deferredItems.length > 0
      ? `<section class="craft-notice-vault"><p>Mochila cheia — preservado no Cofre da Guilda.</p><ul class="craft-notice-list">${deferredItems.map(renderRewardRow).join('')}</ul></section>`
      : ''}
    ${saved ? '' : '<p class="craft-notice-save-warning">A recompensa está segura nesta sessão, mas não pôde ser gravada localmente.</p>'}`;
}

interface CraftRow {
  readonly item: InventoryItemDefinition;
  readonly quantity: number;
}

function toCraftRows(stacks: readonly InventoryStack[]): CraftRow[] {
  const rows: CraftRow[] = [];
  for (const stack of stacks) {
    const item = getInventoryItem(stack.itemId);
    if (!item || !Number.isInteger(stack.quantity) || stack.quantity <= 0) continue;
    const matching = rows.find((row) => row.item.id === item.id);
    if (matching) {
      (matching as { quantity: number }).quantity += stack.quantity;
    } else {
      rows.push({ item, quantity: stack.quantity });
    }
  }
  return rows;
}

function renderRewardRow({ item, quantity }: CraftRow): string {
  return `<li class="craft-notice-item" data-rarity="${item.rarity ?? 'common'}">
    ${inventoryItemArt(item)}
    <span><strong>${item.label}</strong><small>${item.rarity ? craftRarityLabel(item) : 'Material'}</small></span>
    <b>x${quantity}</b>
  </li>`;
}
