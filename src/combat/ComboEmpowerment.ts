/**
 * Recompensa do combo de skills.
 *
 * Assim que o PRIMEIRO link verde acerta, o combo fica "empoderado": cada
 * skill seguinte sai mais rápida (a animação acelera) e o dano de cada skill
 * dobra. O estado vale enquanto o combo estiver vivo; um erro no verde, o fim
 * do tempo ou o fim das skills encerra o bônus junto com o combo.
 */

/** Multiplicador de dano aplicado a cada skill lançada com o combo empoderado. */
export const COMBO_EMPOWER_DAMAGE_MULTIPLIER = 2;
/** Aceleração da animação de cada skill lançada com o combo empoderado. */
export const COMBO_EMPOWER_PLAYBACK_MULTIPLIER = 1.3;
/** Teto de segurança: nenhuma skill acelera além disso (evita clip quebrado). */
export const COMBO_EMPOWER_MAX_PLAYBACK_MULTIPLIER = 1.5;

/** Dano da skill: dobra depois do primeiro combo acertado. */
export function comboDamageMultiplier(empowered: boolean): number {
  return empowered ? COMBO_EMPOWER_DAMAGE_MULTIPLIER : 1;
}

/** Velocidade da animação da skill: aumenta depois do primeiro combo acertado. */
export function comboPlaybackMultiplier(empowered: boolean): number {
  if (!empowered) return 1;
  return Math.min(
    COMBO_EMPOWER_PLAYBACK_MULTIPLIER,
    COMBO_EMPOWER_MAX_PLAYBACK_MULTIPLIER
  );
}

/**
 * Normaliza uma escala de velocidade vinda de fora: nunca abaixo de 1 (o combo
 * só acelera) e nunca acima do teto de segurança.
 */
export function clampSkillPlaybackScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.min(
    COMBO_EMPOWER_MAX_PLAYBACK_MULTIPLIER,
    Math.max(1, scale)
  );
}
