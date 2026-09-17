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
    expect(host.querySelector('[data-workshop-equipment]')?.textContent).toContain('Primária');
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
    expect(host.querySelector('[data-craft-recipe="predator-forged-helmet"]')).not.toBeNull();
  });

  it('shows available recipe materials in green and missing materials in red', () => {
    const profile = createDefaultPlayerProfile();
    profile.blacksmith.availableUntil = Date.now() + 36 * 60 * 60 * 1000;
    profile.backpack = [
      { itemId: 'crimson-fang', quantity: 10 },
      { itemId: 'crimson-draco-talon', quantity: 10 },
      { itemId: 'worn-draco-claw', quantity: 10 },
      { itemId: 'black-horn-fragment', quantity: 10 },
      { itemId: 'volatile-draconic-essence', quantity: 10 },
    ];
    const host = mountWorkshop();
    const screen = new BlacksmithScreen(host, profile, InventoryStore.fromProfile(profile), {
      onLicensePurchase: () => ({ message: '' }),
      onCraft: () => ({ message: '' }),
      onBack: () => undefined,
    });

    screen.show();

    const helmet = host.querySelector<HTMLElement>('[data-craft-recipe="predator-forged-helmet"]')!.closest('.blacksmith-recipe')!;
    const chest = host.querySelector<HTMLElement>('[data-craft-recipe="predator-forged-gloves"]')!.closest('.blacksmith-recipe')!;
    expect(helmet.classList.contains('is-ready')).toBe(true);
    expect(helmet.querySelectorAll('.blacksmith-ingredient.is-available')).toHaveLength(5);
    expect(chest.classList.contains('is-incomplete')).toBe(true);
    expect(chest.querySelector('.blacksmith-ingredient.is-missing small')?.textContent).toBe('0 / 10');
    // Recipes are grouped per set, so the missing piece still sits under the
    // Predador block instead of a flat list.
    expect(helmet.closest('.blacksmith-set')?.querySelector('h3')?.textContent).toBe('Conjunto do Predador');
  });

  it('shows both forged lines with their five-piece bonus and flags a complete set', () => {
    const profile = createDefaultPlayerProfile();
    profile.blacksmith.availableUntil = Date.now() + 36 * 60 * 60 * 1000;
    Object.assign(profile.equipment, {
      helmet: 'predator-forged-helmet',
      chest: 'predator-forged-chest',
      pants: 'predator-forged-pants',
      gloves: 'predator-forged-gloves',
      boots: 'predator-forged-boots',
    });
    const host = mountWorkshop();
    const screen = new BlacksmithScreen(host, profile, InventoryStore.fromProfile(profile), {
      onLicensePurchase: () => ({ message: '' }),
      onCraft: () => ({ message: '' }),
      onBack: () => undefined,
    });

    screen.show();

    const predator = [...host.querySelectorAll<HTMLElement>('.blacksmith-set')]
      .find((block) => block.querySelector('h3')?.textContent === 'Conjunto do Predador')!;
    const bulwark = [...host.querySelectorAll<HTMLElement>('.blacksmith-set')]
      .find((block) => block.querySelector('h3')?.textContent === 'Conjunto da Muralha')!;
    expect(predator.classList.contains('is-complete')).toBe(true);
    expect(predator.textContent).toContain('Conjunto completo equipado');
    expect(predator.querySelectorAll('[data-craft-recipe]')).toHaveLength(5);
    expect(predator.querySelector('.blacksmith-set__bonus')?.textContent).toContain('Ataque +6');
    expect(bulwark.classList.contains('is-complete')).toBe(false);
    expect(bulwark.querySelector('h3')?.textContent).toBe('Conjunto da Muralha');
    expect(bulwark.querySelector('.blacksmith-set__bonus')?.textContent).toContain('Vitalidade +14');
  });

  it('warns when the retired common forged set is still worn', () => {
    const profile = createDefaultPlayerProfile();
    profile.blacksmith.availableUntil = Date.now() + 36 * 60 * 60 * 1000;
    profile.equipment.helmet = 'common-forged-helmet';
    const host = mountWorkshop();
    const screen = new BlacksmithScreen(host, profile, InventoryStore.fromProfile(profile), {
      onLicensePurchase: () => ({ message: '' }),
      onCraft: () => ({ message: '' }),
      onBack: () => undefined,
    });

    screen.show();

    const notice = host.querySelector('.blacksmith-legacy');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain('não dão mais bônus de conjunto');
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

    host.querySelector<HTMLButtonElement>('[data-craft-recipe="predator-forged-helmet"]')?.click();

    expect(host.querySelector('[data-workshop-recipes]')?.classList.contains('is-locked')).toBe(true);
    expect(host.querySelector('[data-craft-recipe]')).toBeNull();
  });

  it('waits for the forge work and delivery before committing a crafted item', () => {
    vi.useFakeTimers();
    const profile = createDefaultPlayerProfile();
    profile.blacksmith.availableUntil = Date.now() + 36 * 60 * 60 * 1000;
    profile.backpack = [
      { itemId: 'crimson-fang', quantity: 10 },
      { itemId: 'crimson-draco-talon', quantity: 10 },
      { itemId: 'worn-draco-claw', quantity: 10 },
      { itemId: 'black-horn-fragment', quantity: 10 },
      { itemId: 'volatile-draconic-essence', quantity: 10 },
    ];
    const host = mountWorkshop();
    const onCraft = vi.fn(() => ({
      message: 'Capacete criado e guardado na mochila.',
      craftedRecipeId: 'predator-forged-helmet' as const,
    }));
    const screen = new BlacksmithScreen(host, profile, InventoryStore.fromProfile(profile), {
      onLicensePurchase: () => ({ message: '' }),
      onCraft,
      onBack: () => undefined,
    });

    screen.show();
    host.querySelector<HTMLButtonElement>('[data-craft-recipe="predator-forged-helmet"]')?.click();
    expect(onCraft).not.toHaveBeenCalled();

    vi.advanceTimersByTime(15_000);
    expect(onCraft).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3_800);

    expect(onCraft).toHaveBeenCalledWith('predator-forged-helmet');
    expect(host.querySelector('.workshop-craft-notification')?.textContent).toContain('Item Craftado com Sucesso');
  });
});
