// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getInventoryItem } from '../inventory/InventoryCatalog';
import {
  renderInventorySlotContent,
  populateCraftInspector,
  renderCraftRewardNotification,
} from './CraftRewardsPresentation';

describe('craft reward presentation', () => {
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
