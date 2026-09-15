import { getInventoryItem, type InventoryItemDefinition } from '../inventory/InventoryCatalog';
import { craftRarityLabel, inventoryItemArt } from './CraftRewardsPresentation';

let nextTooltipId = 0;

/** Renders item metadata in the shared game-owned tooltip treatment. */
export function renderItemTooltip(
  item: InventoryItemDefinition,
  quantity: number
): string {
  const safeQuantity = Math.max(1, Math.floor(quantity));
  const rarity = item.rarity
    ? craftRarityLabel(item)
    : item.kind === 'equipment'
      ? 'Equipamento'
      : item.kind === 'consumable'
        ? 'Consumível'
        : 'Material';
  const description = item.description?.trim() || fallbackDescription(item);
  return `
    <div class="item-tooltip__art">${inventoryItemArt(item)}</div>
    <div class="item-tooltip__body">
      <p class="item-tooltip__rarity">${escapeHtml(rarity)}</p>
      <h3 class="item-tooltip__title">${escapeHtml(item.label)}</h3>
      <p class="item-tooltip__description">${escapeHtml(description)}</p>
      <p class="item-tooltip__quantity">x${safeQuantity}</p>
    </div>`;
}

/**
 * Delegates item tooltip interactions from one stable UI root so rerendered
 * inventory slots do not create duplicate tooltip elements or listeners.
 */
export function bindItemTooltip(host: HTMLElement): () => void {
  const tooltip = host.ownerDocument.createElement('aside');
  tooltip.className = 'item-tooltip';
  tooltip.dataset.itemTooltip = '';
  tooltip.id = `item-tooltip-${nextTooltipId++}`;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.hidden = true;
  host.append(tooltip);

  let activeTrigger: HTMLElement | null = null;

  const show = (event: Event): void => {
    const trigger = tooltipTrigger(event.target);
    if (!trigger) return;
    const item = inventoryItemFrom(trigger);
    if (!item) return;
    activeTrigger?.removeAttribute('aria-describedby');
    activeTrigger = trigger;
    trigger.setAttribute('aria-describedby', tooltip.id);
    tooltip.innerHTML = renderItemTooltip(item.item, item.quantity);
    tooltip.hidden = false;
    tooltip.setAttribute('aria-hidden', 'false');
    positionTooltip(tooltip, trigger);
  };

  const hide = (event: Event): void => {
    const trigger = tooltipTrigger(event.target);
    if (!trigger || trigger !== activeTrigger) return;
    const relatedTrigger = tooltipTrigger(relatedTarget(event));
    if (relatedTrigger === trigger) return;
    trigger.removeAttribute('aria-describedby');
    activeTrigger = null;
    tooltip.hidden = true;
    tooltip.setAttribute('aria-hidden', 'true');
  };

  host.addEventListener('pointerover', show);
  host.addEventListener('focusin', show);
  host.addEventListener('pointerout', hide);
  host.addEventListener('focusout', hide);

  return () => {
    host.removeEventListener('pointerover', show);
    host.removeEventListener('focusin', show);
    host.removeEventListener('pointerout', hide);
    host.removeEventListener('focusout', hide);
    activeTrigger?.removeAttribute('aria-describedby');
    tooltip.remove();
  };
}

function inventoryItemFrom(trigger: HTMLElement): {
  readonly item: InventoryItemDefinition;
  readonly quantity: number;
} | null {
  const itemId = trigger.dataset.itemTooltipId;
  if (!itemId) return null;
  const item = getInventoryItem(itemId);
  if (!item) return null;
  const quantity = Number(trigger.dataset.itemTooltipQuantity);
  return { item, quantity: Number.isFinite(quantity) ? quantity : 1 };
}

function tooltipTrigger(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement
    ? target.closest<HTMLElement>('[data-item-tooltip-id]')
    : null;
}

function relatedTarget(event: Event): EventTarget | null {
  return 'relatedTarget' in event
    ? (event.relatedTarget as EventTarget | null)
    : null;
}

function positionTooltip(tooltip: HTMLElement, trigger: HTMLElement): void {
  const bounds = trigger.getBoundingClientRect();
  const margin = 12;
  const tooltipWidth = tooltip.offsetWidth || 286;
  const tooltipHeight = tooltip.offsetHeight || 132;
  const halfWidth = tooltipWidth / 2;
  const idealLeft = bounds.left + (bounds.width / 2);
  const minLeft = halfWidth + margin;
  const maxLeft = Math.max(minLeft, window.innerWidth - halfWidth - margin);
  const below = bounds.bottom + margin;
  const top = below + tooltipHeight <= window.innerHeight
    ? below
    : Math.max(margin, bounds.top - tooltipHeight - margin);
  tooltip.style.left = `${Math.round(Math.min(maxLeft, Math.max(minLeft, idealLeft)))}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function fallbackDescription(item: InventoryItemDefinition): string {
  if (item.kind === 'equipment') return 'Equipamento guardado na mochila.';
  if (item.kind === 'consumable') return 'Consumível guardado na mochila.';
  return 'Material de craft guardado na mochila.';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]!);
}
