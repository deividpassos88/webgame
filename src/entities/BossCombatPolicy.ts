export type BossCombatMode = 'casting' | 'melee' | 'follow' | 'ranged';

export const BOSS_FOLLOW_DISTANCE = 15;
const MINIMUM_MELEE_RANGE = 0.1;

export function bossMeleeRange(playerAttackRange: number): number {
  return Math.max(MINIMUM_MELEE_RANGE, playerAttackRange - 1);
}

export function decideBossCombatMode(
  distanceToPlayer: number,
  playerAttackRange: number,
  casting: boolean
): BossCombatMode {
  if (casting) return 'casting';
  if (distanceToPlayer <= bossMeleeRange(playerAttackRange)) return 'melee';
  if (distanceToPlayer > BOSS_FOLLOW_DISTANCE) return 'follow';
  return 'ranged';
}
