import type { MageSpellId } from '../vfx/VFXTypes';

/** Mage ice fully paralyzes the hit monster for this window. */
export const MAGE_ICE_FREEZE_SECONDS = 3;
/** Mage water slows the hit monster to this speed fraction for this window. */
export const MAGE_WATER_SLOW_SECONDS = 3;
export const MAGE_WATER_SLOW_MULTIPLIER = 0.5;
/** Shock lifts every living monster inside this radius of the impact. */
export const MAGE_SHOCK_LEVITATE_SECONDS = 2.1;
export const MAGE_SHOCK_RADIUS_METERS = 2;
export const MAGE_SHOCK_LIFT_METERS = 3.2;
/** Mage fire burns every living monster inside this radius of the impact. */
export const MAGE_FIRE_BURN_SECONDS = 4;
export const MAGE_FIRE_BURN_DAMAGE_PER_SECOND = 2;
export const MAGE_FIRE_RADIUS_METERS = 2;

export type MageSkillImpactEffect =
  | { readonly kind: 'freeze'; readonly seconds: number }
  | { readonly kind: 'slow'; readonly seconds: number }
  | { readonly kind: 'shock'; readonly seconds: number; readonly radius: number }
  | {
      readonly kind: 'burn';
      readonly seconds: number;
      readonly damagePerSecond: number;
      readonly radius: number;
    };

/**
 * On-hit control for Mage skills. Ice paralyzes, water slows, lightning lifts
 * and lava burns. Laser keeps its hit damage plus the generic fire status.
 */
export function mageSkillImpactEffect(spellId: MageSpellId): MageSkillImpactEffect | null {
  if (spellId === 'ice') {
    return { kind: 'freeze', seconds: MAGE_ICE_FREEZE_SECONDS };
  }
  if (spellId === 'water') {
    return { kind: 'slow', seconds: MAGE_WATER_SLOW_SECONDS };
  }
  if (spellId === 'lightning') {
    return {
      kind: 'shock',
      seconds: MAGE_SHOCK_LEVITATE_SECONDS,
      radius: MAGE_SHOCK_RADIUS_METERS,
    };
  }
  if (spellId === 'lava') {
    return {
      kind: 'burn',
      seconds: MAGE_FIRE_BURN_SECONDS,
      damagePerSecond: MAGE_FIRE_BURN_DAMAGE_PER_SECOND,
      radius: MAGE_FIRE_RADIUS_METERS,
    };
  }
  return null;
}

/** Horizontal distance from the impact point. Height does not extend the radius. */
export function isInsideMageSkillRadius(
  impactX: number,
  impactZ: number,
  enemyX: number,
  enemyZ: number,
  radius = MAGE_SHOCK_RADIUS_METERS
): boolean {
  const dx = enemyX - impactX;
  const dz = enemyZ - impactZ;
  const limit = Math.max(0, radius);
  return dx * dx + dz * dz <= limit * limit + 1e-8;
}
