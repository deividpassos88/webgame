// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const pageMarkup = readFileSync(`${process.cwd()}/index.html`, 'utf8');
const lobbyMarkup = pageMarkup.slice(
  pageMarkup.indexOf('<section id="lobby-screen"'),
  pageMarkup.indexOf('<section id="blacksmith-screen"')
);

describe('Arena lobby shell', () => {
  beforeEach(() => {
    document.body.innerHTML = lobbyMarkup;
  });

  it('presents the hall identity, the four nav buttons and a settings action', () => {
    const identity = document.querySelector('.arena-identity');
    expect(identity?.textContent).toContain('Masmorra de Guilda');
    expect(identity?.textContent).toContain('Masmorra de Heróis');

    const tabs = [...document.querySelectorAll<HTMLButtonElement>('.arena-nav [data-lobby-tab]')];
    expect(tabs.map((tab) => tab.dataset.lobbyTab))
      .toEqual(['hero', 'inventory', 'skills', 'blacksmith']);
    // Every nav button carries its own generated icon.
    expect(tabs.every((tab) => tab.querySelector('img')?.getAttribute('src')?.includes('/arena/icons/')))
      .toBe(true);

    expect(document.querySelector('[data-lobby-tab="hero"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-lobby-tab="inventory"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector<HTMLImageElement>('.lobby-settings-mark')?.src)
      .toContain('/assets/ui/lobby/arena/icons/settings.svg');
  });

  it('keeps the equipment rail tabbed between equipment and status', () => {
    const equipment = document.querySelector('.lobby-equipment');
    expect(equipment?.getAttribute('data-lobby-equipment-view')).toBe('equipment');

    const tabs = [...document.querySelectorAll<HTMLButtonElement>('.lobby-equipment-tabs [role="tab"]')];
    expect(tabs.map((tab) => tab.dataset.lobbyEquipmentView)).toEqual(['equipment', 'status']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');

    // Status starts hidden so the two panels share one frame.
    expect(equipment?.querySelector('#lobby-equipment-panel')?.hasAttribute('hidden')).toBe(false);
    expect(equipment?.querySelector('#lobby-status-panel')?.hasAttribute('hidden')).toBe(true);
  });

  it('keeps every DOM hook the lobby logic binds to', () => {
    for (const id of [
      'lobby-equipment-slots',
      'lobby-current-status',
      'lobby-capacity',
      'lobby-backpack',
      'lobby-backpack-actions',
      'lobby-skills',
      'lobby-hotkeys',
      'lobby-status',
      'lobby-inventory-search',
      'lobby-inventory-filter',
      'start-game',
    ]) {
      expect(document.getElementById(id), `#${id} must survive the rebuild`).not.toBeNull();
    }
    expect(document.querySelector('.lobby-hero-stage')).not.toBeNull();
    expect(document.querySelector('.lobby-detail-panel')?.getAttribute('data-lobby-view')).toBe('inventory');
  });

  it('gives the stage its class heading and a mouse-rotation affordance', () => {
    const stage = document.querySelector('.lobby-hero-stage');
    expect(stage?.getAttribute('tabindex')).toBe('0');
    expect(stage?.querySelector('.arena-stage__title strong')?.textContent).toBe('Guerreiro');
    expect(stage?.querySelector('.arena-stage__title small')?.textContent).toBe('Classe selecionada');
    expect(stage?.querySelector('.arena-stage__hint')?.textContent).toContain('girar');
  });

  it('builds the CTA with its own animated icon before the label', () => {
    const start = document.querySelector('#start-game');
    expect(start?.firstElementChild?.classList.contains('lobby-start-icon')).toBe(true);
    expect(start?.querySelector<HTMLImageElement>('.lobby-start-icon')?.src)
      .toContain('/assets/ui/lobby/arena/icons/play.svg');
    expect(start?.querySelector('.arena-cta__text strong')?.textContent).toBe('Iniciar partida');
  });
});
