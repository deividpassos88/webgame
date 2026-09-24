import type { PlayableCharacterId } from '../characters/CharacterCatalog';

/**
 * Monstro_arch arrows hit the Maga 30% harder. The Guerreiro takes the
 * projectile damage unchanged.
 */
export const ARCHER_DAMAGE_VS_MAGE_MULTIPLIER = 1.3;

/** Applies the Maga-only Monstro_arch damage bonus to an incoming arrow hit. */
export function archerDamageAgainstClass(
  damage: number,
  classId: PlayableCharacterId
): number {
  return classId === 'mage' ? damage * ARCHER_DAMAGE_VS_MAGE_MULTIPLIER : damage;
}
