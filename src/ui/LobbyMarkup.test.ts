// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const pageMarkup = readFileSync(`${process.cwd()}/index.html`, 'utf8');
const lobbyMarkup = pageMarkup.slice(
  pageMarkup.indexOf('<section id="lobby-screen"'),
  pageMarkup.indexOf('<section id="blacksmith-screen"')
);

describe('Warrior lobby shell', () => {
  beforeEach(() => {
    document.body.innerHTML = lobbyMarkup;
  });

  it('presents the approved Cinzafogo hall identity and active hero section', () => {
    const brand = document.querySelector('.lobby-brand');
    expect(brand?.textContent).toContain('Fortaleza de Cinzafogo');
    expect(brand?.textContent).toContain('Salão do Guerreiro');
    expect(document.querySelector('[data-lobby-tab="hero"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-lobby-tab="inventory"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector<HTMLImageElement>('.lobby-settings-mark')?.src).toContain('/assets/ui/lobby/icon-settings.svg');
  });

  it('shows one compact equipment rail with status always present', () => {
    const equipment = document.querySelector('.lobby-equipment');
    expect(equipment?.querySelector('.section-label')?.textContent).toBe('Equipamento');
    expect(equipment?.querySelector('h2')?.textContent).toBe('Armadura e arma');
    expect(equipment?.querySelector('.lobby-equipment-tabs')).toBeNull();
    expect(equipment?.querySelector('#lobby-equipment-panel')?.hasAttribute('hidden')).toBe(false);
    expect(equipment?.querySelector('#lobby-status-panel')?.hasAttribute('hidden')).toBe(false);
  });

  it('labels the stage and stored-items panel exactly as the reference', () => {
    const rank = document.querySelector('.hero-rank');
    expect(rank?.querySelector('small')?.textContent).toBe('Classe selecionada');
    expect(rank?.querySelector('span')?.textContent).toBe('Vanguarda • corpo a corpo • força');
    expect(document.querySelector('#lobby-panel-inventory h2')?.textContent).toBe('Itens armazenados');
    expect(document.querySelector('.hero-stage-banner p')?.innerHTML.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim())
      .toBe('Mais que batalhas forjamos lendas');
  });

  it('places a dedicated crossed-swords mark before the start action label', () => {
    const start = document.querySelector('#start-game');
    expect(start?.firstElementChild?.classList.contains('lobby-start-icon')).toBe(true);
    expect(start?.querySelector<HTMLImageElement>('.lobby-start-icon')?.src)
      .toContain('/assets/ui/lobby/icon-crossed-swords.svg');
  });
});
