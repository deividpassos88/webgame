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
