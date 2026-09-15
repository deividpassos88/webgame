// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryStore } from '../inventory/InventoryStore';
import { createDefaultPlayerProfile } from '../profile/PlayerProfile';
import { BlacksmithScreen } from './BlacksmithScreen';

function mountWorkshop(): HTMLElement {
  const host = document.createElement('section');
  document.body.replaceChildren(host);
  return host;
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
    expect(host.querySelector('[data-workshop-equipment]')?.textContent).toContain('Arma primária');
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
    expect(host.querySelector('[data-craft-recipe="common-forged-helmet"]')).not.toBeNull();
  });

  it('shows available recipe materials in green and missing materials in red', () => {
    const profile = createDefaultPlayerProfile();
    profile.blacksmith.availableUntil = Date.now() + 36 * 60 * 60 * 1000;
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

    const helmet = host.querySelector<HTMLElement>('[data-craft-recipe="common-forged-helmet"]')!.closest('.blacksmith-recipe')!;
    const chest = host.querySelector<HTMLElement>('[data-craft-recipe="common-forged-chest"]')!.closest('.blacksmith-recipe')!;
    expect(helmet.classList.contains('is-ready')).toBe(true);
    expect(helmet.querySelectorAll('.blacksmith-ingredient.is-available')).toHaveLength(5);
    expect(chest.classList.contains('is-incomplete')).toBe(true);
    expect(chest.querySelector('.blacksmith-ingredient.is-missing small')?.textContent).toBe('0 / 10');
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

    host.querySelector<HTMLButtonElement>('[data-craft-recipe="common-forged-helmet"]')?.click();

    expect(host.querySelector('[data-workshop-recipes]')?.classList.contains('is-locked')).toBe(true);
    expect(host.querySelector('[data-craft-recipe]')).toBeNull();
  });

  it('waits for the forge work and delivery before committing a crafted item', () => {
    vi.useFakeTimers();
    const profile = createDefaultPlayerProfile();
    profile.blacksmith.availableUntil = Date.now() + 36 * 60 * 60 * 1000;
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
      craftedRecipeId: 'common-forged-helmet' as const,
    }));
    const screen = new BlacksmithScreen(host, profile, InventoryStore.fromProfile(profile), {
      onLicensePurchase: () => ({ message: '' }),
      onCraft,
      onBack: () => undefined,
    });

    screen.show();
    host.querySelector<HTMLButtonElement>('[data-craft-recipe="common-forged-helmet"]')?.click();
    expect(onCraft).not.toHaveBeenCalled();

    vi.advanceTimersByTime(15_000);
    expect(onCraft).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3_800);

    expect(onCraft).toHaveBeenCalledWith('common-forged-helmet');
    expect(host.querySelector('.workshop-craft-notification')?.textContent).toContain('Item Craftado com Sucesso');
  });
});
