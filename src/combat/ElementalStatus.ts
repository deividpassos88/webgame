export type ElementalType = 'fire' | 'ice';

export interface ElementalStatusState {
  readonly element: ElementalType;
  readonly remainingSeconds: number;
  readonly damagePerSecond: number;
  readonly pendingDamage: number;
}

export interface ElementalStatusTick {
  readonly status: ElementalStatusState | null;
  readonly damage: number;
}

export const ELEMENTAL_STATUS_DURATION_SECONDS = 3;
export const ICE_SLOW_MULTIPLIER = 0.8;

const TIME_EPSILON = 1e-8;

/**
 * Starts (or refreshes) one elemental status. There is one status slot per
 * target: applying a new element replaces the old one instead of stacking
 * another damage source. Reapplying the same element refreshes its timer.
 */
export function applyElementalStatus(
  current: ElementalStatusState | null,
  element: ElementalType,
  damagePerSecond: number
): ElementalStatusState {
  const safeDamagePerSecond = Number.isFinite(damagePerSecond)
    ? Math.max(0, damagePerSecond)
    : 0;
  return Object.freeze({
    element,
    remainingSeconds: ELEMENTAL_STATUS_DURATION_SECONDS,
    damagePerSecond: safeDamagePerSecond,
    pendingDamage:
      current?.element === element && Number.isFinite(current.pendingDamage)
        ? Math.max(0, current.pendingDamage)
        : 0,
  });
}

/**
 * Advances a status and returns only the damage earned during this frame.
 * A long frame is clamped to the status' remaining time, so the three-second
 * duration can never produce an accidental extra tick.
 */
export function tickElementalStatus(
  status: ElementalStatusState | null,
  deltaSeconds: number
): ElementalStatusTick {
  if (!status || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return { status, damage: 0 };
  }

  const remaining = Math.max(0, status.remainingSeconds);
  const elapsed = Math.min(remaining, deltaSeconds);
  const accrued = Math.max(0, status.pendingDamage) +
    Math.max(0, status.damagePerSecond) * elapsed;
  const nextRemaining = remaining - elapsed;
  const wholeDamage = Math.floor(accrued + TIME_EPSILON);
  const remainder = Math.max(0, accrued - wholeDamage);
  const expires = nextRemaining <= TIME_EPSILON;
  const damage = wholeDamage + (expires ? Math.round(remainder) : 0);

  return {
    status:
      expires
        ? null
        : Object.freeze({
            element: status.element,
            remainingSeconds: nextRemaining,
            damagePerSecond: Math.max(0, status.damagePerSecond),
            pendingDamage: remainder,
          }),
    damage,
  };
}

export function getElementalSlowMultiplier(
  status: ElementalStatusState | null
): number {
  return status?.element === 'ice' ? ICE_SLOW_MULTIPLIER : 1;
}
