// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMON_CRAFT_MATERIAL_IDS } from '../crafting/BlacksmithWorkshop';
import { InventoryStore } from '../inventory/InventoryStore';
import { createDefaultPlayerProfile } from '../profile/PlayerProfile';
import { BlacksmithScreen } from './BlacksmithScreen';

function mountWorkshop(): HTMLElement {
  const host = document.createElement('section');
  document.body.replaceChildren(host);
  return host;
}

/** Picks a craft line in the dropdown the way the player does. */
function selectCraftLine(host: HTMLElement, line: 'attack' | 'defense'): void {
  const select = host.querySelector<HTMLSelectElement>('[data-craft-line-select]')!;
  select.value = line;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('BlacksmithScreen', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens a dedicated, locked workshop before the license is paid', () => {
    const profile = createDefaultPlayerProfile();
    const host = mountWorkshop();
    const screen = new BlacksmithScreen(host, profile, InventoryStore.fromProfile(profile), {
      onLicensePurchase: () => ({ message: 'São necessários 30 Token da Guilda na mochila para a licença.' }),
      onCraft: () => ({ message: 'A oficina está indisponível.' }),
      onBack: () => undefined,
    });

    screen.show();

    expect(host.querySelector('[data-blacksmith-screen]')).not.toBeNull();
    expect(host.querySelector('[data-workshop-recipes]')?.classList.contains('is-locked')).toBe(true);
    // The socket shows the picture only; the slot name reaches assistive tech
    // through the aria-label.
    const sockets = [...host.querySelectorAll<HTMLElement>('[data-workshop-equipment] [data-equipment-slot]')];
    expect(sockets).toHaveLength(7);
    expect(sockets.map((socket) => socket.getAttribute('aria-label')))
      .toContain('Primária: Vazio');
  });

  it('keeps equipment, inventory and craft content in one keyboard-reachable tabbed window', () => {
    const profile = createDefaultPlayerProfile();
    const host = mountWorkshop();
    const screen = new BlacksmithScreen(host, profile, InventoryStore.fromProfile(profile), {
      onLicensePurchase: () => ({ message: '' }),
      onCraft: () => ({ message: '' }),
      onBack: () => undefined,
    });

    screen.show();
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map(({ textContent }) => textContent)).toEqual(['Equipamento', 'Inventário', 'Itens de craft']);
    expect(tabs.every(({ tabIndex }) => tabIndex === 0)).toBe(true);
    expect(host.querySelector('#workshop-panel-equipment')?.hasAttribute('hidden')).toBe(false);

    host.querySelector<HTMLButtonElement>('[data-workshop-tab="inventory"]')?.click();
    expect(host.querySelector('[data-workshop-tab="inventory"]')?.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('#workshop-panel-equipment')?.hasAttribute('hidden')).toBe(true);
    expect(host.querySelector('#workshop-panel-inventory')?.hasAttribute('hidden')).toBe(false);

    host.querySelector<HTMLButtonElement>('[data-workshop-tab="craft"]')?.click();
    expect(host.querySelector('#workshop-panel-inventory')?.hasAttribute('hidden')).toBe(true);
    expect(host.querySelector('[data-workshop-recipes]')?.hasAttribute('hidden')).toBe(false);
  });

  it('reveals recipes after a persisted license purchase updates the shared profile', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack = [{ itemId: 'guild-token', quantity: 30 }];
    const host = mountWorkshop();
    const screen = new BlacksmithScreen(host, profile, InventoryStore.fromProfile(profile), {
      onLicensePurchase: () => {
        profile.blacksmith.availableUntil = Date.now() + 36 * 60 * 60 * 1000;
        return { message: 'Licença confirmada: a oficina está liberada por 36 horas.' };
      },
      onCraft: () => ({ message: 'A oficina está indisponível.' }),
      onBack: () => undefined,
    });
    screen.show();

    host.querySelector<HTMLButtonElement>('[data-open-blacksmith-negotiation]')?.click();
    host.querySelector<HTMLButtonElement>('[data-buy-blacksmith-license]')?.click();

    expect(host.querySelector('[data-workshop-recipes]')?.classList.contains('is-locked')).toBe(false);
    expect(host.querySelector('[data-craft-recipe="common-forged-helmet-atk:attack"]')).not.toBeNull();
  });

  it('shows available recipe materials in green and missing materials in red', () => {
    const profile = createDefaultPlayerProfile();
    profile.blacksmith.availableUntil = Date.now() + 36 * 60 * 60 * 1000;
    // Exactly the five materials of the Draconic helmet recipe, so the helmet
    // is ready while the gloves still miss two of theirs.
    profile.backpack = [
      { itemId: 'worn-draco-claw', quantity: 10 },
      { itemId: 'worn-draco-hide', quantity: 10 },
      { itemId: 'black-horn-fragment', quantity: 10 },
      { itemId: 'crimson-fang', quantity: 10 },
      { itemId: 'serrated-rubra-scale', quantity: 10 },
    ];
    const host = mountWorkshop();
    const screen = new BlacksmithScreen(host, profile, InventoryStore.fromProfile(profile), {
      onLicensePurchase: () => ({ message: '' }),
      onCraft: () => ({ message: '' }),
      onBack: () => undefined,
    });

    screen.show();
    selectCraftLine(host, 'defense');

    const helmet = host.querySelector<HTMLElement>('[data-craft-recipe="common-forged-helmet:defense"]')!.closest('.blacksmith-recipe')!;
    const gloves = host.querySelector<HTMLElement>('[data-craft-recipe="common-forged-gloves:defense"]')!.closest('.blacksmith-recipe')!;
    expect(helmet.classList.contains('is-ready')).toBe(true);
    expect(helmet.querySelectorAll('.blacksmith-ingredient.is-available')).toHaveLength(5);
    expect(gloves.classList.contains('is-incomplete')).toBe(true);
    expect(gloves.querySelector('.blacksmith-ingredient.is-missing small')?.textContent).toBe('0 / 10');
    // One flat list with the five Draconic recipes of the selected line.
    expect(host.querySelectorAll('[data-craft-recipe]')).toHaveLength(5);
    expect(host.querySelector('.blacksmith-set')).toBeNull();
  });

  it('swaps the recipe list when the player picks the other craft line', () => {
    const profile = createDefaultPlayerProfile();
    profile.blacksmith.availableUntil = Date.now() + 36 * 60 * 60 * 1000;
    profile.backpack = COMMON_CRAFT_MATERIAL_IDS.map((itemId) => ({ itemId, quantity: 15 }));
    const host = mountWorkshop();
    const screen = new BlacksmithScreen(host, profile, InventoryStore.fromProfile(profile), {
      onLicensePurchase: () => ({ message: '' }),
      onCraft: () => ({ message: '' }),
      onBack: () => undefined,
    });

    screen.show();
    expect(host.querySelectorAll('[data-craft-recipe]')).toHaveLength(5);
    expect(host.querySelector('[data-craft-recipe="common-forged-helmet-atk:attack"]')).not.toBeNull();
    // The offensive line charges 15 of each material...
    expect(host.querySelector('.blacksmith-ingredient small')?.textContent).toBe('15 / 15');
    expect(host.querySelector('.workshop-craft-line')?.getAttribute('data-craft-line')).toBe('attack');

    selectCraftLine(host, 'defense');

    expect(host.querySelector('[data-craft-recipe="common-forged-helmet:defense"]')).not.toBeNull();
    expect(host.querySelector('[data-craft-recipe="common-forged-helmet-atk:attack"]')).toBeNull();
    // ...and the defensive one charges 10.
    expect(host.querySelector('.blacksmith-ingredient small')?.textContent).toBe('15 / 10');
    expect(host.querySelector('.workshop-craft-line')?.getAttribute('data-craft-line')).toBe('defense');
  });

  it('keeps the line locked while the smith is hammering a piece', () => {
    vi.useFakeTimers();
    const profile = createDefaultPlayerProfile();
    profile.blacksmith.availableUntil = Date.now() + 36 * 60 * 60 * 1000;
    profile.backpack = COMMON_CRAFT_MATERIAL_IDS.map((itemId) => ({ itemId, quantity: 15 }));
    const host = mountWorkshop();
    const screen = new BlacksmithScreen(host, profile, InventoryStore.fromProfile(profile), {
      onLicensePurchase: () => ({ message: '' }),
      onCraft: () => ({ message: '' }),
      onBack: () => undefined,
    });

    screen.show();
    host.querySelector<HTMLButtonElement>('[data-craft-recipe="common-forged-helmet-atk:attack"]')?.click();
    expect(host.querySelector<HTMLSelectElement>('[data-craft-line-select]')?.disabled).toBe(true);

    selectCraftLine(host, 'defense');
    expect(host.querySelector('[data-craft-recipe="common-forged-helmet-atk:attack"]')).not.toBeNull();

    vi.advanceTimersByTime(20_000);
    expect(host.querySelector<HTMLSelectElement>('[data-craft-line-select]')?.disabled).toBe(false);
  });

  it('returns to the lobby through its explicit back callback', () => {
    const profile = createDefaultPlayerProfile();
    const host = mountWorkshop();
    let returned = 0;
    const screen = new BlacksmithScreen(host, profile, InventoryStore.fromProfile(profile), {
      onLicensePurchase: () => ({ message: '' }),
      onCraft: () => ({ message: '' }),
      onBack: () => { returned += 1; },
    });
    screen.show();

    host.querySelector<HTMLButtonElement>('[data-back-from-blacksmith]')?.click();

    expect(returned).toBe(1);
    expect(host.querySelector<HTMLElement>('[data-blacksmith-screen]')?.classList.contains('hidden')).toBe(true);
  });

  it('locks the recipe catalog again when the shared license expires during a visit', () => {
    const profile = createDefaultPlayerProfile();
    profile.blacksmith.availableUntil = Date.now() + 60_000;
    const host = mountWorkshop();
    const screen = new BlacksmithScreen(host, profile, InventoryStore.fromProfile(profile), {
      onLicensePurchase: () => ({ message: '' }),
      onCraft: () => ({ message: 'A licença da oficina expirou.' }),
      onBack: () => undefined,
    });
    screen.show();
    profile.blacksmith.availableUntil = 0;

    host.querySelector<HTMLButtonElement>('[data-craft-recipe="common-forged-helmet-atk:attack"]')?.click();

    expect(host.querySelector('[data-workshop-recipes]')?.classList.contains('is-locked')).toBe(true);
    expect(host.querySelector('[data-craft-recipe]')).toBeNull();
  });

  it('waits for the forge work and delivery before committing a crafted item', () => {
    vi.useFakeTimers();
    const profile = createDefaultPlayerProfile();
    profile.blacksmith.availableUntil = Date.now() + 36 * 60 * 60 * 1000;
    // Exactly the five materials of the Draconic helmet recipe, so the helmet
    // is ready while the gloves still miss two of theirs.
    profile.backpack = [
      { itemId: 'worn-draco-claw', quantity: 10 },
      { itemId: 'worn-draco-hide', quantity: 10 },
      { itemId: 'black-horn-fragment', quantity: 10 },
      { itemId: 'crimson-fang', quantity: 10 },
      { itemId: 'serrated-rubra-scale', quantity: 10 },
    ];
    const host = mountWorkshop();
    const onCraft = vi.fn(() => ({
      message: 'Capacete criado e guardado na mochila.',
      craftedRecipeId: 'common-forged-helmet:defense' as const,
    }));
    const screen = new BlacksmithScreen(host, profile, InventoryStore.fromProfile(profile), {
      onLicensePurchase: () => ({ message: '' }),
      onCraft,
      onBack: () => undefined,
    });

    screen.show();
    selectCraftLine(host, 'defense');
    host.querySelector<HTMLButtonElement>('[data-craft-recipe="common-forged-helmet:defense"]')?.click();
    expect(onCraft).not.toHaveBeenCalled();

    vi.advanceTimersByTime(15_000);
    expect(onCraft).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3_800);

    expect(onCraft).toHaveBeenCalledWith('common-forged-helmet:defense');
    const notification = host.querySelector('.workshop-craft-notification');
    expect(notification?.textContent).toContain('Criada Com Sucesso');
    expect(host.querySelector<HTMLImageElement>('.workshop-craft-notification__art')?.getAttribute('src'))
      .toBe('/items/equipment/common-forged/helmet.webp');
  });

  it('reveals a recipe description only while its card is hovered or pinned', () => {
    const profile = createDefaultPlayerProfile();
    profile.blacksmith.availableUntil = Date.now() + 36 * 60 * 60 * 1000;
    profile.backpack = [{ itemId: 'worn-draco-claw', quantity: 10 }];
    const host = mountWorkshop();
    const screen = new BlacksmithScreen(host, profile, InventoryStore.fromProfile(profile), {
      onLicensePurchase: () => ({ message: '' }),
      onCraft: () => ({ message: '' }),
      onBack: () => undefined,
    });

    screen.show();
    selectCraftLine(host, 'defense');
    // The list is rebuilt when the line changes, so the panel is queried after.
    const inspector = host.querySelector<HTMLElement>('[data-recipe-inspector]');
    expect(inspector?.hidden).toBe(true);

    const card = host.querySelector<HTMLElement>('[data-recipe-inspect="common-forged-helmet:defense"]');
    card?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(inspector?.hidden).toBe(false);
    expect(inspector?.textContent).toContain('Capacete comum criado na Forja de Cinzafogo');

    card?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    expect(inspector?.hidden).toBe(true);

    // Clicking pins the window so it survives the pointer leaving the card.
    card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(inspector?.hidden).toBe(false);
    card?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    expect(inspector?.hidden).toBe(false);

    card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    card?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    expect(inspector?.hidden).toBe(true);
  });
});
