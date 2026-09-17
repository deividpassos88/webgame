// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { InventoryStore } from '../inventory/InventoryStore';
import { createDefaultPlayerProfile } from '../profile/PlayerProfile';
import { createDefaultCharacterAttributes } from '../profile/CharacterAttributes';
import { InventoryOverlay } from './InventoryOverlay';
import * as InventoryOverlayModule from './InventoryOverlay';

function mountInventoryMarkup(): HTMLElement {
  document.body.innerHTML = `
    <button id="return-focus" type="button">Retorno</button>
    <section id="character-overlay" class="hidden" role="dialog">
      <header><p id="character-eyebrow"></p><h2 id="character-title"></h2><button type="button" data-close-overlay>Fechar</button></header>
      <section data-character-panel="equipment"><div id="inventory-equipment"></div></section>
      <section data-character-panel="backpack" class="hidden"><span id="inventory-capacity" tabindex="-1"></span><div id="inventory-backpack"></div></section>
      <section data-character-panel="status" class="hidden"><output id="status-level"></output><output id="status-experience"></output><output id="status-attribute-points"></output><div id="status-controls"></div><dl id="status-derived-stats"></dl><p id="status-gate-message"></p></section>
      <p id="inventory-message"></p>
      <section id="craft-item-inspector" class="hidden" role="dialog" aria-labelledby="craft-item-inspector-name">
        <button type="button" data-close-craft-inspector>Voltar</button>
        <img data-craft-inspector-image alt="">
        <p data-craft-inspector-rarity></p>
        <h3 id="craft-item-inspector-name" data-craft-inspector-name></h3>
        <p data-craft-inspector-copy></p>
        <output data-craft-inspector-quantity></output>
        <button type="button" data-equip-inventory-item hidden>Equipar</button>
      </section>
    </section>`;
  return document.getElementById('character-overlay')!;
}

describe('InventoryOverlay', () => {
  it('renders real Guild Token expansion controls without surfacing the Guild Vault', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack = [{ itemId: 'guild-token', quantity: 30 }];
    profile.guildVault = [{ itemId: 'runic-crystal', quantity: 2 }];
    const snapshot = InventoryStore.fromProfile(profile).snapshot();
    const renderBackpack = (InventoryOverlayModule as unknown as {
      renderInventoryBackpackContents?: (profile: unknown, inventory: unknown) => string;
    }).renderInventoryBackpackContents;

    if (typeof renderBackpack !== 'function') {
      expect(typeof renderBackpack).toBe('function');
      return;
    }

    const markup = renderBackpack(profile, snapshot);
    expect(markup).toContain('data-expand-backpack="guild-token"');
    expect(markup).toContain('+5 espaços');
    expect(markup).toContain('30 Token da Guilda');
    expect(markup).toContain('5 CM — indisponível');
    expect(markup).not.toContain('Proteção de recompensa');
    expect(markup).not.toContain('Cofre da Guilda');
  });

  it('keeps focus on the usable capacity status after spending exactly thirty Guild Tokens', () => {
    const root = mountInventoryMarkup();
    const profile = createDefaultPlayerProfile();
    profile.backpack = [{ itemId: 'guild-token', quantity: 30 }];
    const store = InventoryStore.fromProfile(profile);
    let purchaseAttempts = 0;
    const overlay = new InventoryOverlay(profile, store, {
      onClose: () => undefined,
      onInventoryChanged: () => undefined,
      onStatusChanged: () => undefined,
      onGuildTokenBackpackExpansion: () => {
        purchaseAttempts++;
        profile.backpackCapacity = 25;
        profile.backpack = [];
        store.commitProfile(profile);
        return 'Mochila expandida para 25 espaços.';
      },
    });

    overlay.show('backpack');
    const guildButton = root.querySelector<HTMLButtonElement>('[data-expand-backpack="guild-token"]');
    const cmButton = root.querySelector<HTMLButtonElement>('[data-expand-backpack="cm"]');
    expect(guildButton).not.toBeNull();
    if (!guildButton) return;
    expect(guildButton.disabled).toBe(false);
    expect(cmButton?.disabled).toBe(true);

    guildButton.click();

    expect(purchaseAttempts).toBe(1);
    expect(root.querySelector<HTMLButtonElement>('[data-expand-backpack="guild-token"]')?.disabled).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('inventory-capacity'));
    expect(document.getElementById('inventory-message')?.textContent).toBe(
      'Mochila expandida para 25 espaços.'
    );
  });

  it('opens a craft inspector from the backpack by click or Enter, then Escape restores item focus', () => {
    const root = mountInventoryMarkup();
    const profile = createDefaultPlayerProfile();
    const store = InventoryStore.fromProfile(profile);
    store.add({ itemId: 'worn-draco-claw', quantity: 2 });
    const returnFocus = document.getElementById('return-focus') as HTMLButtonElement;
    returnFocus.focus();
    const overlay = new InventoryOverlay(profile, store, {
      onClose: () => undefined,
      onInventoryChanged: () => undefined,
      onStatusChanged: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
    });

    overlay.show('backpack');
    const item = root.querySelector<HTMLButtonElement>('[data-item-tooltip-id="worn-draco-claw"]')!;
    item.click();

    const inspector = document.getElementById('craft-item-inspector')!;
    expect(root.dataset.characterMode).toBe('backpack');
    expect(inspector.classList.contains('hidden')).toBe(false);
    expect(inspector.textContent).toContain('Material de craft');
    expect(store.snapshot().equipment.primaryWeapon).toBeNull();
    expect(document.activeElement).toBe(inspector.querySelector('[data-close-craft-inspector]'));

    inspector.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(inspector.classList.contains('hidden')).toBe(true);
    expect(document.activeElement).toBe(item);

    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(inspector.classList.contains('hidden')).toBe(false);
  });

  it('requires confirming Equipar before moving a weapon from the backpack to primary weapon', () => {
    const root = mountInventoryMarkup();
    const profile = createDefaultPlayerProfile();
    const store = InventoryStore.fromProfile(profile);
    let inventoryChanges = 0;
    const overlay = new InventoryOverlay(profile, store, {
      onClose: () => undefined,
      onInventoryChanged: () => inventoryChanges++,
      onStatusChanged: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
    });

    overlay.show('backpack');
    root.querySelector<HTMLButtonElement>('[data-inventory-index="0"]')?.click();

    const inspector = document.getElementById('craft-item-inspector')!;
    const equip = inspector.querySelector<HTMLButtonElement>('[data-equip-inventory-item]')!;
    expect(store.snapshot().equipment.primaryWeapon).toBeNull();
    expect(inspector.classList.contains('hidden')).toBe(false);
    expect(equip.hidden).toBe(false);

    equip.click();

    expect(store.snapshot().equipment.primaryWeapon).toBe('starter-sword');
    expect(store.snapshot().backpack).toEqual([]);
    expect(inventoryChanges).toBe(1);
  });

  it('notifies the game while the panel owns and releases focus', () => {
    const root = mountInventoryMarkup();
    const profile = createDefaultPlayerProfile();
    const store = InventoryStore.fromProfile(profile);
    const returnFocus = document.getElementById('return-focus') as HTMLButtonElement;
    const lifecycle: string[] = [];
    returnFocus.focus();
    const overlay = new InventoryOverlay(profile, store, {
      onClose: () => undefined,
      onInventoryChanged: () => undefined,
      onStatusChanged: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
      onShown: () => lifecycle.push('shown'),
      onHidden: () => lifecycle.push('hidden'),
    });

    overlay.show();
    expect(lifecycle).toEqual(['shown']);
    expect(document.activeElement).toBe(root.querySelector('[data-close-overlay]'));

    overlay.hide();
    expect(lifecycle).toEqual(['shown', 'hidden']);
    expect(document.activeElement).toBe(returnFocus);
  });

  it('renders earned level points in the status mode without minus, clear, or confirmation controls', () => {
    const root = mountInventoryMarkup();
    const profile = {
      ...createDefaultPlayerProfile(),
      progression: { level: 2, experience: 100 },
      attributePointsRemaining: 5,
    };
    const store = InventoryStore.fromProfile(profile);
    let persisted = 0;
    const overlay = new InventoryOverlay(profile, store, {
      onClose: () => undefined,
      onInventoryChanged: () => undefined,
      onStatusChanged: () => persisted++,
      onGuildTokenBackpackExpansion: () => '',
    });

    overlay.show('status');
    expect(root.dataset.characterMode).toBe('status');
    expect(root.querySelector('[data-character-panel="status"]')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('status-level')?.textContent).toContain('2');
    expect(document.getElementById('status-experience')?.textContent).toBe('40 / 80 XP');
    expect(document.getElementById('status-attribute-points')?.textContent).toBe('5');
    expect(root.querySelector('[data-attribute-delta="-1"]')).toBeNull();
    expect(root.querySelector('[data-reset-allocation]')).toBeNull();
    expect(root.querySelector('#confirm-attributes')).toBeNull();

    root.querySelector<HTMLButtonElement>('[data-attribute="attack"][data-attribute-delta="5"]')?.click();
    expect(profile.attributes.attack).toBe(5);
    expect(profile.attributePointsRemaining).toBe(0);
    expect(persisted).toBe(1);
  });

  it('reads the current loadout in the Impacto atual panel instead of a fixed base', () => {
    const root = mountInventoryMarkup();
    const profile = createDefaultPlayerProfile();
    profile.attributes = { ...createDefaultCharacterAttributes(), vitality: 10, attack: 5 };
    const store = InventoryStore.fromProfile(profile);
    const overlay = new InventoryOverlay(profile, store, {
      onClose: () => undefined,
      onInventoryChanged: () => undefined,
      onStatusChanged: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
    });
    // dt/dd pairs concatenate without a separator in textContent.
    const panel = () => document.getElementById('status-derived-stats')?.textContent ?? '';

    overlay.show('status');
    expect(panel()).toContain('Vida máxima130.0');
    // Unarmed only the attribute bonus counts (0.2 damage per attack point).
    expect(panel()).toContain('Dano físico1.0');

    // Equips through the same inspector flow the player uses.
    overlay.show('backpack');
    root.querySelector<HTMLButtonElement>('[data-inventory-index="0"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-equip-inventory-item]')?.click();
    overlay.show('status');
    // The sword brings its own 8 damage into the same reading the fight uses.
    expect(panel()).toContain('Dano físico9.0');
    expect(root.dataset.characterMode).toBe('status');
  });
});
