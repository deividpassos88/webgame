import { getEffectiveTargetDistance } from '../combat/DistanceDamage';

export interface AutoAttackSituation {
  hasTarget: boolean;
  targetAlive: boolean;
  distance: number;
  attackRange: number;
  isSwinging: boolean;
  /** Auto-attack remains opt-in; target focus alone is passive. */
  automaticAttackEnabled?: boolean;
}

const DEFAULT_ENEMY_BODY_RADIUS = 0.6;

/** Keeps focused-target checks aligned with click attacks and distance falloff. */
export function getMarkedTargetSurfaceDistance(
  centerDistance: number,
  enemyBodyScale = 1
): number {
  const safeScale = Number.isFinite(enemyBodyScale) && enemyBodyScale > 0
    ? enemyBodyScale
    : 1;
  return getEffectiveTargetDistance(
    centerDistance,
    DEFAULT_ENEMY_BODY_RADIUS * safeScale
  );
}

export function isMarkedTargetInRange(
  situation: Pick<
    AutoAttackSituation,
    'hasTarget' | 'targetAlive' | 'distance' | 'attackRange'
  >
): boolean {
  return (
    situation.hasTarget &&
    situation.targetAlive &&
    situation.distance <= situation.attackRange
  );
}

/** Resolves the focused enemy used by one explicit ATK command. */
export function resolveManualAttackTarget<T>(
  target: T | null,
  situation: Pick<
    AutoAttackSituation,
    'hasTarget' | 'targetAlive' | 'distance' | 'attackRange'
  > | null
): T | null {
  return target !== null && situation !== null && isMarkedTargetInRange(situation)
    ? target
    : null;
}

export function shouldStartAutoAttack(situation: AutoAttackSituation): boolean {
  return (
    situation.automaticAttackEnabled === true &&
    isMarkedTargetInRange(situation) &&
    !situation.isSwinging
  );
}
