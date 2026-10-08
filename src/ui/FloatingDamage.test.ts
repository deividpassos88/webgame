// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { HUD } from './HUD';

function bareHud(): { hud: HUD; log: HTMLElement } {
  const hud = Object.create(HUD.prototype) as HUD;
  const log = document.createElement('div');
  (hud as unknown as { damageLog: HTMLElement }).damageLog = log;
  return { hud, log };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('números flutuantes de combate', () => {
  it('mostra Critical/Magical sobre o número e não marca dano normal ou recebido', () => {
    vi.useFakeTimers();
    const { hud, log } = bareHud();

    hud.spawnFloatingDamage(100, 120, '-84', 'damage', 'physical');
    hud.spawnFloatingDamage(130, 120, '-126', 'damage', 'magical');
    hud.spawnFloatingDamage(160, 120, '-42');
    hud.spawnFloatingDamage(190, 120, '-18', 'taken', 'physical');
    hud.spawnFloatingDamage(220, 120, 'Esquivou!', 'dodge');

    const [physical, magical, normal, taken, dodge] = Array.from(log.children);
    expect(physical.classList.contains('critical-physical')).toBe(true);
    expect(physical.querySelector('.floating-damage__label')?.textContent).toBe('Critical');
    expect(physical.querySelector('.floating-damage__value')?.textContent).toBe('-84');
    expect(magical.classList.contains('critical-magical')).toBe(true);
    expect(magical.querySelector('.floating-damage__label')?.textContent).toBe('Magical');
    expect(magical.querySelector('.floating-damage__value')?.textContent).toBe('-126');
    expect(normal.classList.contains('critical')).toBe(false);
    expect(taken.classList.contains('taken')).toBe(true);
    expect(taken.classList.contains('critical')).toBe(false);
    expect(dodge.classList.contains('dodge')).toBe(true);
    expect(dodge.textContent).toBe('Esquivou!');

    vi.runOnlyPendingTimers();
  });
});
