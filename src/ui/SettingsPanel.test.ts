// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_PANEL_ID, SettingsPanel } from './SettingsPanel';
import { createDefaultPlayerSettings, type PlayerSettings } from '../profile/PlayerSettings';

function mountPanel(settings: PlayerSettings = createDefaultPlayerSettings()) {
  const changes: PlayerSettings[] = [];
  const panel = SettingsPanel.mount(document.body, settings, (next) => changes.push(next));
  return { panel, changes, root: document.getElementById(SETTINGS_PANEL_ID)! };
}

function qualityInput(root: HTMLElement, quality: string): HTMLInputElement {
  return root.querySelector<HTMLInputElement>(`input[value="${quality}"]`)!;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('SettingsPanel', () => {
  it('mounts hidden with the current values selected', () => {
    const { panel, root } = mountPanel({
      graphicsQuality: 'baixa',
      showFps: true,
      showDamageNumbers: false,
      cameraSensitivity: 1.25,
    });

    expect(panel.isOpen()).toBe(false);
    expect(root.classList.contains('hidden')).toBe(true);
    expect(qualityInput(root, 'baixa').checked).toBe(true);
    expect(qualityInput(root, 'alta').checked).toBe(false);
    expect(root.querySelector<HTMLInputElement>('[data-settings-fps]')!.checked).toBe(true);
    expect(root.querySelector<HTMLInputElement>('[data-settings-damage-numbers]')!.checked).toBe(false);
    expect(root.querySelector<HTMLInputElement>('[data-settings-sensitivity]')!.value).toBe('1.25');
    expect(root.querySelector('[data-settings-sensitivity-value]')!.textContent).toBe('1,25x');
  });

  it('opens and closes from the header, the backdrop and the done button', () => {
    const { panel, root } = mountPanel();
    panel.show();
    expect(panel.isOpen()).toBe(true);
    expect(root.classList.contains('hidden')).toBe(false);

    root.querySelector<HTMLElement>('.settings-panel__close')!.click();
    expect(panel.isOpen()).toBe(false);

    panel.show();
    root.querySelector<HTMLElement>('.settings-panel__backdrop')!.click();
    expect(panel.isOpen()).toBe(false);

    panel.show();
    root.querySelector<HTMLElement>('[data-settings-done]')?.click();
    root.querySelector<HTMLElement>('.settings-panel__done')!.click();
    expect(panel.isOpen()).toBe(false);
  });

  it('closes on Escape only while open', () => {
    const { panel } = mountPanel();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel.isOpen()).toBe(false);

    panel.show();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel.isOpen()).toBe(false);
  });

  it('emits the whole settings object when the quality changes', () => {
    const { changes, root } = mountPanel();
    const media = qualityInput(root, 'media');
    media.checked = true;
    media.dispatchEvent(new Event('change', { bubbles: true }));

    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ ...createDefaultPlayerSettings(), graphicsQuality: 'media' });
  });

  it('toggles the FPS counter and the damage numbers', () => {
    const { changes, root } = mountPanel();
    const fps = root.querySelector<HTMLInputElement>('[data-settings-fps]')!;
    fps.checked = true;
    fps.dispatchEvent(new Event('change', { bubbles: true }));

    const damage = root.querySelector<HTMLInputElement>('[data-settings-damage-numbers]')!;
    damage.checked = false;
    damage.dispatchEvent(new Event('change', { bubbles: true }));

    expect(changes[0].showFps).toBe(true);
    expect(changes[1].showDamageNumbers).toBe(false);
  });

  it('updates the sensitivity label while dragging and clamps what it emits', () => {
    const { changes, root } = mountPanel();
    const slider = root.querySelector<HTMLInputElement>('[data-settings-sensitivity]')!;
    const output = root.querySelector<HTMLElement>('[data-settings-sensitivity-value]')!;

    slider.value = '1.75';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(output.textContent).toBe('1,75x');
    expect(changes[changes.length - 1]?.cameraSensitivity).toBe(1.75);

    slider.value = '9';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(changes[changes.length - 1]?.cameraSensitivity).toBe(2);
  });

  it('restores the defaults and repaints every control', () => {
    const { changes, root } = mountPanel({
      graphicsQuality: 'baixa',
      showFps: true,
      showDamageNumbers: false,
      cameraSensitivity: 2,
    });
    root.querySelector<HTMLElement>('[data-settings-restore]')!.click();

    expect(changes[changes.length - 1]).toEqual(createDefaultPlayerSettings());
    expect(qualityInput(root, 'alta').checked).toBe(true);
    expect(root.querySelector<HTMLInputElement>('[data-settings-fps]')!.checked).toBe(false);
    expect(root.querySelector<HTMLInputElement>('[data-settings-damage-numbers]')!.checked).toBe(true);
    expect(root.querySelector('[data-settings-sensitivity-value]')!.textContent).toBe('1,00x');
  });

  it('does not emit when the same value is picked again', () => {
    const { changes, root } = mountPanel();
    const alta = qualityInput(root, 'alta');
    alta.checked = true;
    alta.dispatchEvent(new Event('change', { bubbles: true }));
    expect(changes).toHaveLength(0);
  });

  it('accepts external updates through setSettings', () => {
    const { panel, root } = mountPanel();
    panel.setSettings({
      graphicsQuality: 'media',
      showFps: true,
      showDamageNumbers: false,
      cameraSensitivity: 0.75,
    });

    expect(qualityInput(root, 'media').checked).toBe(true);
    expect(root.querySelector<HTMLInputElement>('[data-settings-fps]')!.checked).toBe(true);
    expect(root.querySelector('[data-settings-sensitivity-value]')!.textContent).toBe('0,75x');
  });
});
