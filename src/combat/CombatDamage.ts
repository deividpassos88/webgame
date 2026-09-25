/** Keeps physical-only scaling out of elemental attacks. */
export function getTypedAttackBaseDamage(
  baseDamage: number,
  physicalDamageMultiplier: number,
  elemental: boolean
): number {
  const safeBase = Number.isFinite(baseDamage) ? Math.max(0, baseDamage) : 0;
  if (elemental) return safeBase;
  const safeMultiplier = Number.isFinite(physicalDamageMultiplier)
    ? Math.max(0, physicalDamageMultiplier)
    : 1;
  return safeBase * safeMultiplier;
}

/** Quantizes the final delivered hit so health and floating text stay identical. */
export function quantizeCombatDamage(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.max(1, Math.round(amount));
}

/**
 * monster_arch (arqueiro) dava dano alto demais na Maga: as flechas dele agora
 * chegam com 40% a menos de dano contra a classe Maga. O Guerreiro segue
 * recebendo o dano integral, sem nenhuma mudança.
 */
export const ARCHER_DAMAGE_REDUCTION_VS_MAGE = 0.4;

export type DamageReceivingPlayerClass = 'warrior' | 'mage';

/**
 * Reduces ranged (monster_arch arrow) damage for the Maga only. Melee hits and
 * every warrior hit pass through untouched.
 */
export function applyArcherDamageVsPlayerClass(
  damage: number,
  isRangedAttack: boolean,
  playerClass: DamageReceivingPlayerClass
): number {
  const safeDamage = Number.isFinite(damage) ? Math.max(0, damage) : 0;
  if (!isRangedAttack || playerClass !== 'mage') return safeDamage;
  return safeDamage * (1 - ARCHER_DAMAGE_REDUCTION_VS_MAGE);
}
