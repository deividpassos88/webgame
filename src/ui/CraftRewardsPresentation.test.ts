// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { getInventoryItem } from '../inventory/InventoryCatalog';
import {
  renderEquipmentSlotContent,
  renderInventorySlotContent,
  populateCraftInspector,
  renderCraftRewardNotification,
} from './CraftRewardsPresentation';
import { equipmentSlotIconSource } from './RpgIcons';
import { EQUIPMENT_LABELS } from './RpgUiViewModel';
import type { UiEquipmentSlot } from './RpgUiViewModel';

describe('craft reward presentation', () => {
  it('fills every empty equipment socket with the icon of the piece that belongs there', () => {
    const slots = Object.keys(EQUIPMENT_LABELS) as UiEquipmentSlot[];
    // All seven sockets of the equipment grid, including both hands.
    expect(slots).toHaveLength(7);

    for (const slot of slots) {
      const host = document.createElement('div');
      host.innerHTML = renderEquipmentSlotContent(slot, null);
      const icon = host.querySelector<HTMLImageElement>('.equipment-slot__icon');

      expect(icon, `${slot} sem icone de slot vazio`).not.toBeNull();
      expect(icon?.getAttribute('src')).toBe(equipmentSlotIconSource(slot));
      // The socket name is gone from the cell: the picture answers for it.
      expect(host.querySelector('.equipment-slot__label')).toBeNull();
      // The slot icon is decoration; the socket itself carries the aria-label.
      expect(icon?.getAttribute('alt')).toBe('');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('shows the painted icon files shipped with the game, not a missing asset', () => {
    for (const slot of Object.keys(EQUIPMENT_LABELS) as UiEquipmentSlot[]) {
      const source = equipmentSlotIconSource(slot);
      expect(source.startsWith('/assets/')).toBe(true);
      expect(existsSync(`${process.cwd()}/public${source}`), `${source} ausente em public/`).toBe(true);
    }
  });

  it('keeps the sword placeholder on the Guerreiro socket and the cajado on the Maga one', () => {
    expect(equipmentSlotIconSource('primaryWeapon')).toContain('sword');
    expect(equipmentSlotIconSource('primaryWeapon', 'paladin')).toContain('sword');
    expect(equipmentSlotIconSource('primaryWeapon', 'mage')).toContain('cajado');
    expect(existsSync(`${process.cwd()}/public${equipmentSlotIconSource('primaryWeapon', 'mage')}`)).toBe(true);

    const magaSocket = document.createElement('div');
    magaSocket.innerHTML = renderEquipmentSlotContent('primaryWeapon', null, 'mage');
    expect(magaSocket.querySelector<HTMLImageElement>('.equipment-slot__icon')?.src)
      .toContain('cajado');
  });

  it('replaces the placeholder with the equipped art once an item fills the socket', () => {
    const equipado = getInventoryItem('common-forged-helmet')!;
    const comItem = document.createElement('div');
    comItem.innerHTML = renderEquipmentSlotContent('helmet', equipado);

    expect(comItem.querySelector('.equipment-slot__icon')).toBeNull();
    // Armor pieces use the art cut out for the body; the equipped icon wins.
    const esperado = equipado.equippedIconSrc ?? equipado.iconSrc;
    expect(comItem.querySelector('img')?.getAttribute('src')).toBe(esperado);
    expect(comItem.querySelector('.equipment-slot__label')).toBeNull();
  });

  it('renders the real craft artwork and quantity for backpack surfaces', () => {
    const item = getInventoryItem('worn-draco-claw')!;
    const host = document.createElement('div');

    host.innerHTML = renderInventorySlotContent(item, 3);

    expect(host.querySelector('img')?.getAttribute('src')).toBe('/items/craft/common/1.webp');
    expect(host.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(host.querySelector('[data-item-quantity]')?.textContent).toBe('3');
  });
  it('renders a labelled lateral notification with provided artwork, names and quantities', () => {
    document.body.innerHTML = '<aside id="notice" role="status"></aside>';
    const host = document.getElementById('notice')!;

    renderCraftRewardNotification(host, [
      { itemId: 'guild-token', quantity: 1 },
      { itemId: 'worn-draco-claw', quantity: 2 },
    ], [{ itemId: 'worn-draco-hide', quantity: 1 }]);

    expect(host.getAttribute('aria-label')).toBe('Recompensas do boss final');
    expect(host.textContent).toContain('Token da Guilda');
    expect(host.textContent).toContain('Garra de Draco Desgastada');
    expect(host.textContent).toContain('x2');
    expect(host.textContent).toContain('Cofre da Guilda');
    expect(host.querySelectorAll('img')).toHaveLength(3);
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/items/craft/token-guild.png');
  });

  it('populates the material inspector with visual rarity, craft copy, and a focusable close action', () => {
    document.body.innerHTML = `
      <section id="inspector" role="dialog" aria-modal="true">
        <button type="button" data-close-craft-inspector>Fechar</button>
        <img data-craft-inspector-image alt="">
        <p data-craft-inspector-rarity></p>
        <h3 data-craft-inspector-name></h3>
        <p data-craft-inspector-copy></p>
        <output data-craft-inspector-quantity></output>
      </section>`;
    const item = getInventoryItem('worn-draco-claw')!;
    const inspector = document.getElementById('inspector')!;

    populateCraftInspector(inspector, item, 3);

    expect(inspector.dataset.rarity).toBe('common');
    expect(inspector.querySelector('[data-craft-inspector-name]')?.textContent)
      .toBe('Garra de Draco Desgastada');
    expect(inspector.querySelector('[data-craft-inspector-rarity]')?.textContent)
      .toBe('Comum');
    expect(inspector.querySelector('[data-craft-inspector-copy]')?.textContent)
      .toBe('Material de craft');
    expect(inspector.querySelector('[data-craft-inspector-quantity]')?.textContent)
      .toBe('x3');
    expect(inspector.querySelector<HTMLImageElement>('img')?.src)
      .toContain('/items/craft/common/1.webp');
  });
});

describe('item label tier rendering', () => {
  it('renders the bracketed tier smaller and brighter than the item name', async () => {
    const { renderItemLabel } = await import('./CraftRewardsPresentation');

    expect(renderItemLabel('Dragonic Helmet [Common]'))
      .toBe('Dragonic Helmet<span class="item-label__tier">[Common]</span>');
    // Items without a tier stay untouched, and markup in a name is escaped.
    expect(renderItemLabel('Sword Novice')).toBe('Sword Novice');
    expect(renderItemLabel('Adaga <Comum> [Rare]'))
      .toBe('Adaga &lt;Comum&gt;<span class="item-label__tier">[Rare]</span>');
  });
});
