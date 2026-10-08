/**
 * Preferências do jogador que saem do menu de Configurações do lobby.
 *
 * Ficam dentro do perfil (mesmo save do `localStorage`) porque mudam como a
 * partida roda: qualidade gráfica, contador de FPS, números de dano e a
 * sensibilidade do arrasto da prévia 3D.
 */

export type GraphicsQuality = 'alta' | 'media' | 'baixa';

export interface PlayerSettings {
  graphicsQuality: GraphicsQuality;
  /** Contador de FPS no canto da tela (lobby e partida). */
  showFps: boolean;
  /** Texto flutuante de dano/cura sobre os personagens. */
  showDamageNumbers: boolean;
  /** Multiplicador do arrasto que gira a prévia 3D do herói. */
  cameraSensitivity: number;
}

/** Ajustes concretos que a qualidade gráfica aplica no renderer. */
export interface GraphicsProfile {
  /** Teto do `devicePixelRatio` usado pelo WebGL. */
  readonly pixelRatioCap: number;
  /** Sombras dinâmicas (luz do cenário e dos personagens). */
  readonly shadows: boolean;
}

export const GRAPHICS_QUALITIES: readonly GraphicsQuality[] = ['alta', 'media', 'baixa'];

export const GRAPHICS_PROFILES: Readonly<Record<GraphicsQuality, GraphicsProfile>> = Object.freeze({
  alta: Object.freeze({ pixelRatioCap: 2, shadows: true }),
  media: Object.freeze({ pixelRatioCap: 1.5, shadows: true }),
  baixa: Object.freeze({ pixelRatioCap: 1, shadows: false }),
});

export const CAMERA_SENSITIVITY_MIN = 0.5;
export const CAMERA_SENSITIVITY_MAX = 2;
export const CAMERA_SENSITIVITY_STEP = 0.25;
export const DEFAULT_CAMERA_SENSITIVITY = 1;

const GRAPHICS_LABELS: Readonly<Record<GraphicsQuality, string>> = Object.freeze({
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
});

export function createDefaultPlayerSettings(): PlayerSettings {
  return {
    graphicsQuality: 'alta',
    showFps: false,
    showDamageNumbers: true,
    cameraSensitivity: DEFAULT_CAMERA_SENSITIVITY,
  };
}

export function isGraphicsQuality(value: unknown): value is GraphicsQuality {
  return typeof value === 'string' && (GRAPHICS_QUALITIES as readonly string[]).includes(value);
}

export function graphicsQualityLabel(quality: GraphicsQuality): string {
  return GRAPHICS_LABELS[quality];
}

export function resolveGraphicsProfile(quality: GraphicsQuality): GraphicsProfile {
  return GRAPHICS_PROFILES[quality] ?? GRAPHICS_PROFILES.alta;
}

/**
 * Resolução efetiva do canvas: limita o `devicePixelRatio` do monitor ao teto
 * da qualidade escolhida (telas retina em "baixa" renderizam 1:1).
 */
export function resolvePixelRatio(quality: GraphicsQuality, devicePixelRatio: number): number {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;
  return Math.min(ratio, resolveGraphicsProfile(quality).pixelRatioCap);
}

export function clampCameraSensitivity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CAMERA_SENSITIVITY;
  const clamped = Math.min(CAMERA_SENSITIVITY_MAX, Math.max(CAMERA_SENSITIVITY_MIN, value));
  return Math.round(clamped / CAMERA_SENSITIVITY_STEP) * CAMERA_SENSITIVITY_STEP;
}

export function isPlayerSettings(value: unknown): value is PlayerSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return isGraphicsQuality(settings.graphicsQuality)
    && typeof settings.showFps === 'boolean'
    && typeof settings.showDamageNumbers === 'boolean'
    && typeof settings.cameraSensitivity === 'number'
    && Number.isFinite(settings.cameraSensitivity)
    && settings.cameraSensitivity >= CAMERA_SENSITIVITY_MIN
    && settings.cameraSensitivity <= CAMERA_SENSITIVITY_MAX;
}

/** Never throws: anything missing or invalid falls back to the default value. */
export function normalizePlayerSettings(value: unknown): PlayerSettings {
  const defaults = createDefaultPlayerSettings();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return defaults;
  const settings = value as Record<string, unknown>;
  return {
    graphicsQuality: isGraphicsQuality(settings.graphicsQuality)
      ? settings.graphicsQuality
      : defaults.graphicsQuality,
    showFps: typeof settings.showFps === 'boolean' ? settings.showFps : defaults.showFps,
    showDamageNumbers: typeof settings.showDamageNumbers === 'boolean'
      ? settings.showDamageNumbers
      : defaults.showDamageNumbers,
    cameraSensitivity: typeof settings.cameraSensitivity === 'number'
      ? clampCameraSensitivity(settings.cameraSensitivity)
      : defaults.cameraSensitivity,
  };
}
