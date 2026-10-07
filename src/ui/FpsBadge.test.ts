// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { FPS_BADGE_ID, FpsBadge, averageFps, formatFps } from './FpsBadge';

afterEach(() => {
  document.body.replaceChildren();
});

describe('averageFps', () => {
  it('measures the window from the first and last frame', () => {
    // 30 quadros em 500 ms -> 58 FPS.
    const frames = Array.from({ length: 30 }, (_, index) => index * (500 / 29));
    expect(averageFps(frames)).toBe(58);
  });

  it('returns zero when there is nothing to measure', () => {
    expect(averageFps([])).toBe(0);
    expect(averageFps([1000])).toBe(0);
    expect(averageFps([1000, 1000])).toBe(0);
  });

  it('formats the label in a single place', () => {
    expect(formatFps(59.6)).toBe('60 FPS');
    expect(formatFps(-3)).toBe('0 FPS');
  });
});

describe('FpsBadge', () => {
  it('mounts hidden and shows up when enabled', () => {
    const badge = FpsBadge.mount(document.body);
    const root = document.getElementById(FPS_BADGE_ID)!;

    expect(root.classList.contains('hidden')).toBe(true);
    badge.setVisible(true);
    expect(badge.isVisible()).toBe(true);
    expect(root.classList.contains('hidden')).toBe(false);
    badge.setVisible(false);
    expect(badge.isVisible()).toBe(false);
  });

  it('updates the text on a slow cadence and skips duplicated values', () => {
    const badge = FpsBadge.mount(document.body);
    const root = document.getElementById(FPS_BADGE_ID)!;
    badge.setVisible(true);

    for (let index = 0; index < 40; index++) badge.frame(index * 16.6);
    expect(root.textContent).toBe('60 FPS');

    // Um quadro novo antes do intervalo de atualização não reescreve o texto.
    const before = root.textContent;
    badge.frame(40 * 16.6);
    expect(root.textContent).toBe(before);
  });

  it('drops the old window when the counter is turned off and on again', () => {
    const badge = FpsBadge.mount(document.body);
    const root = document.getElementById(FPS_BADGE_ID)!;
    badge.setVisible(true);
    for (let index = 0; index < 30; index++) badge.frame(index * 100);
    expect(root.textContent).toBe('10 FPS');

    badge.setVisible(false);
    badge.setVisible(true);
    // 60 FPS (16,6 ms por quadro) bem depois da janela antiga: sem o reset os
    // quadros velhos entrariam na média.
    for (let index = 0; index < 30; index++) badge.frame(1_000_000 + index * 16.6);
    expect(root.textContent).toBe('60 FPS');
  });

  it('waits for a few frames before writing the first number', () => {
    const badge = FpsBadge.mount(document.body);
    const root = document.getElementById(FPS_BADGE_ID)!;
    badge.setVisible(true);
    badge.frame(0);
    badge.frame(16.6);
    expect(root.textContent).toBe('');
    for (let index = 2; index < 10; index++) badge.frame(index * 16.6);
    expect(root.textContent).toBe('60 FPS');
  });

  it('reuses an existing badge instead of stacking elements', () => {
    const first = FpsBadge.mount(document.body);
    const second = FpsBadge.mount(document.body);
    expect(document.querySelectorAll(`#${FPS_BADGE_ID}`).length).toBe(1);
    second.dispose();
    expect(first.isVisible()).toBe(false);
    expect(document.getElementById(FPS_BADGE_ID)).toBeNull();
  });
});
