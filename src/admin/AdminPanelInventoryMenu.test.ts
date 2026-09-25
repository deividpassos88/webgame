// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { INVENTORY_ITEMS } from '../inventory/InventoryCatalog';
import type { AdminCommand } from './AdminCommandGate';
import { AdminPanel, adminItemGroup, renderAdminInventoryItemOptions } from './AdminPanel';

const MAGA_ITEM_IDS = [
  'starter-staff',
  ...['helmet', 'chest', 'pants', 'gloves', 'boots'].flatMap((slot) => [
    `maga-forged-${slot}`,
    `maga-forged-${slot}-atk`,
  ]),
] as const;

function mountPanel(): { host: HTMLElement; commands: AdminCommand[] } {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const commands: AdminCommand[] = [];
  AdminPanel.mount(host, true, (command) => {
    commands.push(command);
    return { ok: true };
  });
  return { host, commands };
}

describe('ADM inventory menu classes', () => {
  it('shows every Maga item in its own labeled group next to the Guerreiro one', () => {
    const { host } = mountPanel();
    const select = host.querySelector<HTMLSelectElement>('[data-admin-inventory-item]')!;
    const options = [...select.querySelectorAll<HTMLOptionElement>('option')];

    // Every catalog entry is offered, not just the Guerreiro ones.
    expect([...options.map((option) => option.value)].sort())
      .toEqual([...Object.keys(INVENTORY_ITEMS)].sort());

    const groups = [...select.querySelectorAll<HTMLOptGroupElement>('optgroup')]
      .map((group) => group.label);
    expect(groups).toEqual(['Guerreiro', 'Maga', 'Materiais', 'Consumíveis']);

    const magaOptions = [...select.querySelectorAll<HTMLOptionElement>('optgroup[label="Maga"] option')];
    expect([...magaOptions.map((option) => option.value)].sort()).toEqual([...MAGA_ITEM_IDS].sort());
    for (const option of magaOptions) {
      expect(option.textContent).toContain('· Maga');
    }

    const warriorOptions = [...select.querySelectorAll<HTMLOptionElement>('optgroup[label="Guerreiro"] option')];
    expect(warriorOptions.map((option) => option.value)).toContain('starter-sword');
    expect(warriorOptions.map((option) => option.value)).toContain('common-forged-helmet');
    for (const option of warriorOptions) {
      expect(option.textContent).toContain('· Guerreiro');
    }
  });

  it('adds the picked Maga item to the inventory through the admin command', () => {
    const { host, commands } = mountPanel();
    const select = host.querySelector<HTMLSelectElement>('[data-admin-inventory-item]')!;
    select.value = 'maga-forged-boots';
    const quantity = host.querySelector<HTMLInputElement>('[data-admin-inventory-quantity]')!;
    quantity.value = '1';
    host.querySelector<HTMLButtonElement>('[data-admin-command="add-inventory-item"]')!.click();

    expect(commands).toEqual([
      { type: 'add-inventory-item', itemId: 'maga-forged-boots', quantity: 1 },
    ]);
    expect(host.querySelector('[data-admin-inventory-message]')?.textContent)
      .toBe('Item adicionado à mochila.');
  });

  it('keeps the shared forged labels distinguishable by their class tag', () => {
    const magaHelmet = INVENTORY_ITEMS['maga-forged-helmet'];
    const warriorHelmet = INVENTORY_ITEMS['common-forged-helmet'];
    expect(magaHelmet.label).toBe(warriorHelmet.label);
    expect(adminItemGroup(magaHelmet)).toBe('Maga');
    expect(adminItemGroup(warriorHelmet)).toBe('Guerreiro');

    const markup = renderAdminInventoryItemOptions();
    expect(markup).toContain('maga-forged-helmet');
    expect(markup).toContain('Dragonic Helmet [DEF] · Maga');
    expect(markup).toContain('Dragonic Helmet [DEF] · Guerreiro');
  });
});
