import type { PlayerEquipment } from '../profile/PlayerProfile';

/**
 * Regras de escala de dificuldade por wave pedidas pelo design:
 *
 * - Monstros regulares: Wave 1 = 1.00 (+0%), Wave 2 = 1.30 (+30%), Wave 3 = 1.40 (+40%), Wave 4 = 1.45 (+45%), Wave 5+ = 1.50 (+50%).
 * - Mini-bosses: Wave 1 = 1.00 (+0%), Wave 2 = 1.35 (+35%), Wave 3 = 1.40 (+40%), Wave 4 = 1.45 (+45%), Wave 5+ = 1.50 (+50%).
 * - Escala por equipamento (armadura):
 *   - 0 peças (apenas espada/desarmado): HP normal (+0%, mult 1.00)
 *   - 1 peça equipada: +10% HP monstros e mini-boss (mult 1.10)
 *   - 2 peças equipadas: +15% HP monstros e mini-boss (mult 1.15)
 *   - 3 peças equipadas: +20% HP monstros e mini-boss (mult 1.20)
 *   - 4 peças equipadas: +24% HP monstros e mini-boss (mult 1.24)
 *   - 5 peças equipadas: +30% HP monstros e mini-boss (mult 1.30)
 * - Boss final (Dragonic Overlord): 5 barras de vida (HP base aumentado em 4x, ou seja, 5x total);
 *   as cores das barras vivem em `ui/BossHealthView`.
 */
export const ARMOR_SLOT_KEYS = ['helmet', 'chest', 'gloves', 'pants', 'boots'] as const;

/** Retorna quantas peças de armadura (0 a 5) estão equipadas (a espada/arma não conta). */
export function countEquippedArmorPieces(equipment: PlayerEquipment | null | undefined): number {
  if (!equipment) return 0;
  let count = 0;
  for (const slot of ARMOR_SLOT_KEYS) {
    if (equipment[slot] !== null && equipment[slot] !== undefined) {
      count++;
    }
  }
  return count;
}

/**
 * Multiplicador de vida de monstros e mini-bosses com base na quantidade de peças de armadura equipadas:
 * - 0 itens: 1.00 (+0%)
 * - 1 item: 1.10 (+10%)
 * - 2 itens: 1.15 (+15%)
 * - 3 itens: 1.20 (+20%)
 * - 4 itens: 1.24 (+24%)
 * - 5 itens: 1.30 (+30%)
 */
export function equipmentHpMultiplier(armorPiecesCount: number): number {
  const count = Math.max(0, Math.floor(armorPiecesCount || 0));
  switch (count) {
    case 0:
      return 1.0;
    case 1:
      return 1.1;
    case 2:
      return 1.15;
    case 3:
      return 1.2;
    case 4:
      return 1.24;
    case 5:
    default:
      return 1.3;
  }
}

/** Vida base do Dragonic Overlord antes das 5 barras. */
export const BOSS_BASE_HP = 1400;
/** Total de barras de vida do boss final (HP = base * barras). */
export const FINAL_BOSS_HP_BARS = 5;

/** Atributos base do Dragonic Overlord. */
export const BASE_BOSS_DAMAGE = 11;
export const BASE_BOSS_SPEED = 0.8;
export const BASE_BOSS_SCALE = 3.2;

export interface BossEnrageStats {
  readonly barsRemaining: number;
  readonly damageMultiplier: number;
  readonly speedMultiplier: number;
  readonly skillCooldownSeconds: number;
  readonly attackCooldownMultiplier: number;
}

export type BossPhaseMinionType = 'normal' | 'archer' | 'guardian';

export interface BossMinionComposition {
  readonly barsRemaining: number;
  readonly tier: 1 | 2 | 3;
  readonly normalCount: number;
  readonly archerCount: number;
  readonly guardianCount: number;
  readonly totalCount: number;
  readonly roster: readonly BossPhaseMinionType[];
}

function safeWave(wave: number): number {
  return Number.isFinite(wave) ? Math.max(1, Math.floor(wave)) : 1;
}

/**
 * Escala de HP para monstros regulares por wave:
 * Wave 1: 1.00 (+0%)
 * Wave 2: 1.30 (+30%)
 * Wave 3: 1.40 (+40%)
 * Wave 4: 1.45 (+45%)
 * Wave 5+: 1.50 (+50%)
 */
export function regularEnemyHpMultiplier(wave: number): number {
  const safe = safeWave(wave);
  if (safe <= 1) return 1.0;
  if (safe === 2) return 1.3;
  if (safe === 3) return 1.4;
  if (safe === 4) return 1.45;
  return 1.5;
}

/**
 * Escala de HP para mini-bosses por wave:
 * Wave 1: 1.00 (+0%)
 * Wave 2: 1.35 (+35%)
 * Wave 3: 1.40 (+40%)
 * Wave 4: 1.45 (+45%)
 * Wave 5+: 1.50 (+50%)
 */
export function miniBossHpMultiplier(wave: number): number {
  const safe = safeWave(wave);
  if (safe <= 1) return 1.0;
  if (safe === 2) return 1.35;
  if (safe === 3) return 1.4;
  if (safe === 4) return 1.45;
  return 1.5;
}

/** HP total do boss final: a base 1400 mais 4x (5 barras cheias = 7000 HP). */
export function finalBossTotalHp(): number {
  return BOSS_BASE_HP * FINAL_BOSS_HP_BARS;
}

/**
 * A cada barra de vida perdida, o Dragonic Overlord fica mais nervoso e dá mais dano:
 * - 5x: 1.00x dano (normal), 1.00x velocidade, 5.0s cooldown de skills
 * - 4x: 1.20x dano, 1.10x velocidade, 4.4s cooldown de skills
 * - 3x: 1.45x dano (dano aumentado), 1.25x velocidade, 3.7s cooldown de skills
 * - 2x: 1.70x dano, 1.40x velocidade, 3.0s cooldown de skills
 * - 1x: 2.00x dano (dano aumenta mais um pouco / modo fúria), 1.60x velocidade, 2.2s cooldown de skills
 */
export function getBossEnrageStats(barsRemaining: number): BossEnrageStats {
  const safeBars = Math.max(1, Math.min(FINAL_BOSS_HP_BARS, Math.floor(barsRemaining || 1)));
  switch (safeBars) {
    case 5:
      return Object.freeze({
        barsRemaining: 5,
        damageMultiplier: 1.0,
        speedMultiplier: 1.0,
        skillCooldownSeconds: 5.0,
        attackCooldownMultiplier: 1.0,
      });
    case 4:
      return Object.freeze({
        barsRemaining: 4,
        damageMultiplier: 1.2,
        speedMultiplier: 1.1,
        skillCooldownSeconds: 4.4,
        attackCooldownMultiplier: 0.9,
      });
    case 3:
      return Object.freeze({
        barsRemaining: 3,
        damageMultiplier: 1.45,
        speedMultiplier: 1.25,
        skillCooldownSeconds: 3.7,
        attackCooldownMultiplier: 0.8,
      });
    case 2:
      return Object.freeze({
        barsRemaining: 2,
        damageMultiplier: 1.7,
        speedMultiplier: 1.4,
        skillCooldownSeconds: 3.0,
        attackCooldownMultiplier: 0.7,
      });
    case 1:
    default:
      return Object.freeze({
        barsRemaining: 1,
        damageMultiplier: 2.0,
        speedMultiplier: 1.6,
        skillCooldownSeconds: 2.2,
        attackCooldownMultiplier: 0.6,
      });
  }
}

/**
 * Define o tier e a composição dos monstros que acompanham o Boss por barra de vida:
 * - Vida em 5x: 5 monstros normais
 * - Vida em 4x e 3x: 5 monstros arqueiros (arch)
 * - Vida em 2x e 1x: 5 monstros arqueiros (arch) + 5 monstros guardião (5 de cada = 10 total)
 */
export function getBossMinionComposition(barsRemaining: number): BossMinionComposition {
  const safeBars = Math.max(1, Math.min(FINAL_BOSS_HP_BARS, Math.floor(barsRemaining || 1)));
  if (safeBars >= 5) {
    return Object.freeze({
      barsRemaining: 5,
      tier: 1 as const,
      normalCount: 5,
      archerCount: 0,
      guardianCount: 0,
      totalCount: 5,
      roster: Object.freeze(['normal', 'normal', 'normal', 'normal', 'normal'] as const),
    });
  }
  if (safeBars >= 3) {
    return Object.freeze({
      barsRemaining: safeBars,
      tier: 2 as const,
      normalCount: 0,
      archerCount: 5,
      guardianCount: 0,
      totalCount: 5,
      roster: Object.freeze(['archer', 'archer', 'archer', 'archer', 'archer'] as const),
    });
  }
  return Object.freeze({
    barsRemaining: safeBars,
    tier: 3 as const,
    normalCount: 0,
    archerCount: 5,
    guardianCount: 5,
    totalCount: 10,
    roster: Object.freeze([
      'archer', 'archer', 'archer', 'archer', 'archer',
      'guardian', 'guardian', 'guardian', 'guardian', 'guardian',
    ] as const),
  });
}

export function getBossMinionTier(barsRemaining: number): 1 | 2 | 3 {
  return getBossMinionComposition(barsRemaining).tier;
}
