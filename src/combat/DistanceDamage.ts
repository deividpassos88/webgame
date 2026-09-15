/**
 * Distance-based damage tuning shared by player skills and enemy attacks.
 *
 * Damage is intentionally kept as a pure calculation here so gameplay code
 * can apply the same falloff regardless of whether an attack came from an
 * animation, a skill area, or an enemy controller.
 */

export type DistanceFalloffProfile = 'warrior' | 'regular' | 'mini-boss';

export interface DistanceFalloffDefinition {
  readonly fullDamageDistance: number;
  readonly maxDistance: number;
  readonly minimumMultiplier: number;
}

export const WARRIOR_MAX_RANGE_METERS = 5;

const PROFILES: Readonly<Record<DistanceFalloffProfile, DistanceFalloffDefinition>> = Object.freeze({
  warrior: Object.freeze({
    fullDamageDistance: 2,
    maxDistance: WARRIOR_MAX_RANGE_METERS,
    minimumMultiplier: 0.3,
  }),
  regular: Object.freeze({
    fullDamageDistance: 1.25,
    maxDistance: 4,
    minimumMultiplier: 0.45,
  }),
  'mini-boss': Object.freeze({
    fullDamageDistance: 1.5,
    maxDistance: 5,
    minimumMultiplier: 0.3,
  }),
});

export function getDistanceFalloffProfile(
  profile: DistanceFalloffProfile
): DistanceFalloffDefinition {
  return PROFILES[profile];
}

/**
 * Returns a 0..1 damage multiplier for a distance in meters.
 *
 * The inner part of an attack keeps full power. From there to the maximum
 * range the multiplier falls linearly to the profile's minimum. At the
 * maximum boundary the minimum still applies; outside it the hit misses.
 */
export function getDistanceDamageMultiplier(
  distance: number,
  profile: DistanceFalloffProfile
): number {
  if (!Number.isFinite(distance)) return 0;

  const definition = getDistanceFalloffProfile(profile);
  const safeDistance = Math.max(0, distance);
  if (safeDistance <= definition.fullDamageDistance) return 1;
  if (safeDistance > definition.maxDistance) return 0;
  if (definition.maxDistance <= definition.fullDamageDistance) {
    return definition.minimumMultiplier;
  }

  const progress =
    (safeDistance - definition.fullDamageDistance) /
    (definition.maxDistance - definition.fullDamageDistance);
  return (
    1 + (definition.minimumMultiplier - 1) * Math.min(1, Math.max(0, progress))
  );
}

export function applyDistanceFalloff(
  baseDamage: number,
  distance: number,
  profile: DistanceFalloffProfile
): number {
  const safeDamage = Number.isFinite(baseDamage) ? Math.max(0, baseDamage) : 0;
  return safeDamage * getDistanceDamageMultiplier(distance, profile);
}

/** Converts center-to-center distance into distance to the target's hittable surface. */
export function getEffectiveTargetDistance(
  centerDistance: number,
  targetRadius = 0
): number {
  if (!Number.isFinite(centerDistance)) return Number.POSITIVE_INFINITY;
  const safeRadius = Number.isFinite(targetRadius) ? Math.max(0, targetRadius) : 0;
  return Math.max(0, centerDistance - safeRadius);
}
