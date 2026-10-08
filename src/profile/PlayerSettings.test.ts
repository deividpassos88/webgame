import { describe, expect, it } from 'vitest';
import {
  CAMERA_SENSITIVITY_MAX,
  CAMERA_SENSITIVITY_MIN,
  clampCameraSensitivity,
  createDefaultPlayerSettings,
  graphicsQualityLabel,
  isPlayerSettings,
  normalizePlayerSettings,
  resolveGraphicsProfile,
  resolvePixelRatio,
} from './PlayerSettings';

describe('defaults', () => {
  it('starts on high quality, damage numbers on and the FPS counter off', () => {
    expect(createDefaultPlayerSettings()).toEqual({
      graphicsQuality: 'alta',
      showFps: false,
      showDamageNumbers: true,
      cameraSensitivity: 1,
    });
  });

  it('labels every quality in pt-BR', () => {
    expect(graphicsQualityLabel('alta')).toBe('Alta');
    expect(graphicsQualityLabel('media')).toBe('Média');
    expect(graphicsQualityLabel('baixa')).toBe('Baixa');
  });
});

describe('graphics profile', () => {
  it('caps the pixel ratio and turns shadows off on the lowest quality', () => {
    expect(resolveGraphicsProfile('alta')).toEqual({ pixelRatioCap: 2, shadows: true });
    expect(resolveGraphicsProfile('media')).toEqual({ pixelRatioCap: 1.5, shadows: true });
    expect(resolveGraphicsProfile('baixa')).toEqual({ pixelRatioCap: 1, shadows: false });
  });

  it('never exceeds the monitor ratio', () => {
    expect(resolvePixelRatio('alta', 3)).toBe(2);
    expect(resolvePixelRatio('media', 3)).toBe(1.5);
    expect(resolvePixelRatio('baixa', 3)).toBe(1);
    expect(resolvePixelRatio('alta', 1)).toBe(1);
    // Valor inválido (WebView antiga) cai em 1 em vez de quebrar o canvas.
    expect(resolvePixelRatio('alta', Number.NaN)).toBe(1);
    expect(resolvePixelRatio('alta', 0)).toBe(1);
  });
});

describe('camera sensitivity', () => {
  it('clamps and snaps to the slider steps', () => {
    expect(clampCameraSensitivity(0.1)).toBe(CAMERA_SENSITIVITY_MIN);
    expect(clampCameraSensitivity(99)).toBe(CAMERA_SENSITIVITY_MAX);
    expect(clampCameraSensitivity(1.1)).toBe(1);
    expect(clampCameraSensitivity(1.4)).toBe(1.5);
    expect(clampCameraSensitivity(Number.NaN)).toBe(1);
  });
});

describe('normalizePlayerSettings', () => {
  it('keeps valid values and repairs the broken ones', () => {
    expect(normalizePlayerSettings({
      graphicsQuality: 'baixa',
      showFps: true,
      showDamageNumbers: false,
      cameraSensitivity: 1.75,
    })).toEqual({
      graphicsQuality: 'baixa',
      showFps: true,
      showDamageNumbers: false,
      cameraSensitivity: 1.75,
    });

    expect(normalizePlayerSettings({
      graphicsQuality: 'ultra',
      showFps: 'sim',
      showDamageNumbers: null,
      cameraSensitivity: 10,
    })).toEqual({
      graphicsQuality: 'alta',
      showFps: false,
      showDamageNumbers: true,
      cameraSensitivity: CAMERA_SENSITIVITY_MAX,
    });
  });

  it('falls back to defaults for values that are not objects', () => {
    expect(normalizePlayerSettings(undefined)).toEqual(createDefaultPlayerSettings());
    expect(normalizePlayerSettings('alta')).toEqual(createDefaultPlayerSettings());
    expect(normalizePlayerSettings(['alta'])).toEqual(createDefaultPlayerSettings());
  });
});

describe('isPlayerSettings', () => {
  it('accepts only complete settings inside the slider range', () => {
    expect(isPlayerSettings(createDefaultPlayerSettings())).toBe(true);
    expect(isPlayerSettings({ ...createDefaultPlayerSettings(), cameraSensitivity: 3 })).toBe(false);
    expect(isPlayerSettings({ ...createDefaultPlayerSettings(), showFps: undefined })).toBe(false);
    expect(isPlayerSettings(null)).toBe(false);
  });
});
