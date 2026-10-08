import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const gameSource = readFileSync(new URL('../core/Game.ts', import.meta.url), 'utf8');
const lobbySource = readFileSync(new URL('./LobbyScreen.ts', import.meta.url), 'utf8');

describe('settings menu wiring contract', () => {
  it('exposes the gear in the lobby and a button in the HUD dock', () => {
    const triggers = indexHtml.match(/data-open-settings/g) ?? [];
    expect(triggers).toHaveLength(2);
    expect(indexHtml).toContain('class="arena-settings" data-open-settings');
    expect(indexHtml).toContain('data-open-settings aria-label="Abrir configurações"');
  });

  it('loads the panel stylesheet with the other reference styles', () => {
    expect(indexHtml).toContain('<link rel="stylesheet" href="/src/styles/settings-panel.css" />');
  });

  it('mounts one panel and one FPS badge and binds every trigger', () => {
    expect(gameSource).toContain('this.setupPlayerSettings();');
    expect(gameSource).toContain('SettingsPanel.mount(');
    expect(gameSource).toContain('FpsBadge.mount(document.body)');
    expect(gameSource).toContain("querySelectorAll<HTMLElement>('[data-open-settings]')");
    expect(gameSource).toContain('this.settingsPanel?.show()');
  });

  it('persists and applies the settings on the shared renderer', () => {
    expect(gameSource).toContain('this.profile.settings = settings;');
    expect(gameSource).toContain('this.persistProfileState();');
    expect(gameSource).toContain('resolveGraphicsProfile(settings.graphicsQuality)');
    expect(gameSource).toContain('resolvePixelRatio(settings.graphicsQuality, window.devicePixelRatio)');
    expect(gameSource).toContain('this.fpsBadge?.setVisible(settings.showFps);');
    // O contador de HITS é regra de jogo: desligar o texto não pode parar o combo.
    expect(gameSource).toContain('if (!this.damageNumbersEnabled()) return;');
    expect(gameSource.indexOf('this.hitCounter.registerHit()'))
      .toBeLessThan(gameSource.indexOf('if (!this.damageNumbersEnabled()) return;'));
  });

  it('feeds the FPS badge from both loops and honours the drag sensitivity', () => {
    expect(gameSource).toContain('this.fpsBadge?.frame(performance.now());');
    expect(gameSource).toContain('onFrameSample: (nowMs) => this.fpsBadge?.frame(nowMs),');
    expect(lobbySource).toContain('this.frameSample?.(performance.now());');
    expect(lobbySource).toContain('delta * 0.008 * this.dragSensitivity()');
  });
});
