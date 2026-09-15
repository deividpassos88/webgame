// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getInventoryItem } from '../inventory/InventoryCatalog';
import { InventoryStore } from '../inventory/InventoryStore';
import { createDefaultPlayerProfile } from '../profile/PlayerProfile';
import { renderEquipmentSlotContent, equippedItemArt, inventoryItemArt } from './CraftRewardsPresentation';
import { bindItemTooltip, renderItemTooltip } from './ItemTooltip';
import { renderInventoryBackpackContents } from './InventoryOverlay';
import { renderLobbyBackpackContents } from './LobbyScreen';

describe('item tooltip', () => {
  it('renders the supplied item identity, art, rarity and lore', () => {
    const markup = renderItemTooltip(getInventoryItem('ossified-draco-ribs')!, 3);

    expect(markup).toContain('Costelas de Draco Ossificadas');
    expect(markup).toContain('/items/craft/common/7.webp');
    expect(markup).toContain('Comum');
    expect(markup).toContain('item-tooltip__description');
    expect(markup).toContain('x3');
  });

  it('keeps a descriptive tooltip for catalog items that predate lore metadata', () => {
    const markup = renderItemTooltip(getInventoryItem('worn-draco-hide')!, 1);
    const host = document.createElement('div');
    host.innerHTML = markup;

    expect(host.querySelector('.item-tooltip__description')?.textContent)
      .toBe('Usada para forjar o Capacete, Peitoral e Calca do Forjador Comum.');
  });

  it('shows one game-owned tooltip for a focused or hovered item and hides it on exit', () => {
    const host = document.createElement('section');
    host.innerHTML = `
      <button type="button" data-item-tooltip-id="ossified-draco-ribs" data-item-tooltip-quantity="3">
        Costelas de Draco Ossificadas
      </button>`;
    document.body.append(host);
    const unbind = bindItemTooltip(host);
    const item = host.querySelector<HTMLButtonElement>('[data-item-tooltip-id]')!;

    item.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    const tooltip = host.querySelector<HTMLElement>('[data-item-tooltip]');
    expect(tooltip?.hidden).toBe(false);
    expect(tooltip?.textContent).toContain('Costelas de Draco Ossificadas');
    expect(host.querySelectorAll('[data-item-tooltip]')).toHaveLength(1);

    item.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    expect(tooltip?.hidden).toBe(true);
    unbind();
  });

  it('shows and hides the tooltip from pointer entry and exit', () => {
    const host = document.createElement('section');
    host.innerHTML = '<button type="button" data-item-tooltip-id="ossified-draco-ribs" data-item-tooltip-quantity="3">Costelas</button>';
    document.body.append(host);
    const unbind = bindItemTooltip(host);
    const item = host.querySelector<HTMLButtonElement>('[data-item-tooltip-id]')!;

    item.dispatchEvent(new Event('pointerover', { bubbles: true }));

    const tooltip = host.querySelector<HTMLElement>('[data-item-tooltip]');
    expect(tooltip?.hidden).toBe(false);
    expect(tooltip?.textContent).toContain('Costelas de Draco Ossificadas');

    item.dispatchEvent(new Event('pointerout', { bubbles: true }));

    expect(tooltip?.hidden).toBe(true);
    unbind();
  });

  it('keeps the positioned tooltip inside the viewport at a right edge', () => {
    const host = document.createElement('section');
    host.innerHTML = '<button type="button" data-item-tooltip-id="ossified-draco-ribs" data-item-tooltip-quantity="3">Costelas</button>';
    document.body.append(host);
    const item = host.querySelector<HTMLButtonElement>('[data-item-tooltip-id]')!;
    Object.defineProperty(item, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 940, top: 40, width: 60, height: 60, right: 1000, bottom: 100 }),
    });
    const previousWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    const unbind = bindItemTooltip(host);

    try {
      item.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      expect(host.querySelector<HTMLElement>('[data-item-tooltip]')?.style.left).toBe('845px');
    } finally {
      unbind();
      if (previousWidth) Object.defineProperty(window, 'innerWidth', previousWidth);
    }
  });

  it('marks matching lobby and scenario slots with the item tooltip contract', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack = [{ itemId: 'ossified-draco-ribs', quantity: 3 }];
    const snapshot = InventoryStore.fromProfile(profile).snapshot();
    const scenarioHost = document.createElement('div');
    const lobbyHost = document.createElement('div');
    scenarioHost.innerHTML = renderInventoryBackpackContents(profile, snapshot);
    lobbyHost.innerHTML = renderLobbyBackpackContents(profile, snapshot);

    for (const host of [scenarioHost, lobbyHost]) {
      const slot = host.querySelector<HTMLElement>('[data-item-tooltip-id]');
      expect(slot?.dataset.itemTooltipId).toBe('ossified-draco-ribs');
      expect(slot?.dataset.itemTooltipQuantity).toBe('3');
      expect(slot?.getAttribute('title')).toBeNull();
    }
  });

  it('uses one large equipment card composition without a duplicated item label', () => {
    const markup = renderEquipmentSlotContent(
      'primaryWeapon',
      'Arma primária',
      getInventoryItem('starter-sword')!
    );
    const host = document.createElement('div');
    host.innerHTML = markup;

    expect(host.querySelector('.equipment-slot__label')?.textContent).toBe('Arma primária');
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/items/equipment/equipado/sword.webp');
    expect(host.querySelector('strong')).toBeNull();
  });

  it('keeps the framed inventory art for backpack cards while equipping uses the integrated art', () => {
    const sword = getInventoryItem('starter-sword')!;

    expect(inventoryItemArt(sword)).toContain('/items/equipment/armas/sword.webp');
    expect(equippedItemArt(sword)).toContain('/items/equipment/equipado/sword.webp');
    expect(equippedItemArt(sword)).toContain('is-equipped-art');
  });

  it('uses the supplied equipped art for common forged equipment', () => {
    const gloves = { ...getInventoryItem('common-forged-gloves')! };

    expect(gloves.equippedIconSrc).toBe('/items/equipment/equipado/gloves.png');
    expect(equippedItemArt(gloves)).toContain('/items/equipment/equipado/gloves.png');
    expect(equippedItemArt(gloves)).toContain('is-equipped-art');
  });
});
