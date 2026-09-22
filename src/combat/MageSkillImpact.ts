import type { MageSpellId } from '../vfx/VFXTypes';

/** Mage ice locks the hit monster completely, and only for this window. */
export const MAGE_ICE_FREEZE_SECONDS = 0.5;
/** Mage water stops the hit monster from running. Attacks in range still land. */
export const MAGE_WATER_ROOT_SECONDS = 1.5;
/** Shock lifts every living monster inside this radius of the impact. */
export const MAGE_SHOCK_LEVITATE_SECONDS = 1;
export const MAGE_SHOCK_RADIUS_METERS = 2;
export const MAGE_SHOCK_LIFT_METERS = 3.2;

export type MageSkillImpactEffect =
  | { readonly kind: 'freeze'; readonly seconds: number }
  | { readonly kind: 'root'; readonly seconds: number }
  | { readonly kind: 'shock'; readonly seconds: number; readonly radius: number };

/**
 * On-hit control for Mage skills. Ice, water and lightning are the three
 * requested effects. Lava and laser keep their hit damage only.
 */
export function mageSkillImpactEffect(spellId: MageSpellId): MageSkillImpactEffect | null {
  if (spellId === 'ice') {
    return { kind: 'freeze', seconds: MAGE_ICE_FREEZE_SECONDS };
  }
  if (spellId === 'water') {
    return { kind: 'root', seconds: MAGE_WATER_ROOT_SECONDS };
  }
  if (spellId === 'lightning') {
    return {
      kind: 'shock',
      seconds: MAGE_SHOCK_LEVITATE_SECONDS,
      radius: MAGE_SHOCK_RADIUS_METERS,
    };
  }
  return null;
}

/** Horizontal distance from the impact point. Height does not extend the radius. */
export function isInsideMageShockRadius(
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
