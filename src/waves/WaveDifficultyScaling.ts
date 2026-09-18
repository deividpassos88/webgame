/**
 * Regras de escala de dificuldade por wave pedidas pelo design:
 *
 * - Monstros regulares: +3% de HP por wave (wave 1 = +3%, sem teto).
 * - Mini-bosses: +5% de HP por wave, teto na wave 6 (= +30%).
 * - Boss final: 5 barras de vida (HP base aumentado em 4x, ou seja, 5x total);
 *   as cores das barras vivem em `ui/BossHealthView`.
 */
export const REGULAR_ENEMY_HP_PER_WAVE_PERCENT = 3;

export const MINI_BOSS_HP_PER_WAVE_PERCENT = 5;
export const MINI_BOSS_HP_SCALE_WAVE_CAP = 6;
export const MINI_BOSS_HP_MAX_BONUS_PERCENT =
  MINI_BOSS_HP_PER_WAVE_PERCENT * MINI_BOSS_HP_SCALE_WAVE_CAP;

/** Vida base do Dragon Overlord antes das 5 barras. */
export const BOSS_BASE_HP = 1400;
/** Total de barras de vida do boss final (HP = base * barras). */
export const FINAL_BOSS_HP_BARS = 5;

function safeWave(wave: number): number {
  return Number.isFinite(wave) ? Math.max(1, Math.floor(wave)) : 1;
}

/** +3% de HP por wave para monstros regulares. */
export function regularEnemyHpMultiplier(wave: number): number {
  return 1 + (REGULAR_ENEMY_HP_PER_WAVE_PERCENT * safeWave(wave)) / 100;
}

/** +5% de HP por wave para mini-bosses, limitado a +30% na wave 6. */
export function miniBossHpMultiplier(wave: number): number {
  const capped = Math.min(safeWave(wave), MINI_BOSS_HP_SCALE_WAVE_CAP);
  const bonus = Math.min(
    MINI_BOSS_HP_PER_WAVE_PERCENT * capped,
    MINI_BOSS_HP_MAX_BONUS_PERCENT
  );
  return 1 + bonus / 100;
}

/** HP total do boss final: a base 1400 mais 4x (5 barras cheias). */
export function finalBossTotalHp(): number {
  return BOSS_BASE_HP * FINAL_BOSS_HP_BARS;
}
