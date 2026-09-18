import { FINAL_BOSS_HP_BARS } from '../waves/WaveDifficultyScaling';

export interface BossHealthSource {
  hp: number;
  maxHP: number;
  isDead: boolean;
}

/**
 * Cores das 5 barras de vida do boss final, na ordem em que caem:
 * verde -> verde claro -> roxo -> vermelho escuro -> vermelho claro.
 */
export const BOSS_BAR_LAYER_COLORS = [
  '#16a34a',
  '#86efac',
  '#a855f7',
  '#7f1d1d',
  '#f87171',
] as const;

export interface BossBarLayer {
  /** Indice da barra atual (0 = primeira/verde). */
  index: number;
  color: string;
  /** Preenchimento (0..1) somente da barra atual. */
  fill: number;
  /** Quantas barras ainda restam (incluindo a atual). */
  barsRemaining: number;
  totalBars: number;
}

/**
 * Resolve qual das 5 barras esta visivel e quanto dela resta. A primeira
 * barra (verde) drena primeiro; quando zera, a seguinte aparece cheia com a
 * proxima cor — classico boss de varias vidas.
 */
export function resolveBossBarLayer(
  hp: number,
  maxHp: number,
  bars: number = FINAL_BOSS_HP_BARS
): BossBarLayer {
  const totalBars = Math.max(1, Math.floor(bars));
  const safeMax = Math.max(1, maxHp);
  const safeHp = Math.min(Math.max(0, hp), safeMax);
  const layerSize = safeMax / totalBars;
  const drained = (safeMax - safeHp) / layerSize;
  const index = Math.min(totalBars - 1, Math.floor(drained + 1e-9));
  const fill = Math.min(1, Math.max(0, 1 - (drained - index)));
  return {
    index,
    color: BOSS_BAR_LAYER_COLORS[index] ?? BOSS_BAR_LAYER_COLORS[0],
    fill: safeHp <= 0 ? 0 : fill,
    barsRemaining: safeHp <= 0 ? 0 : totalBars - index,
    totalBars,
  };
}

export function getBossHealthHudValues(
  boss: BossHealthSource
): { hp: number; maxHP: number } {
  return {
    hp: boss.isDead ? 0 : boss.hp,
    maxHP: boss.maxHP,
  };
}
