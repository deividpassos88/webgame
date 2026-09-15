import type { BossCombatMode } from './BossCombatPolicy';

export function shouldUpdateBossSkills(mode: BossCombatMode): boolean {
  return mode !== 'follow';
}

export function shouldClearBossTelegraph(
  mode: BossCombatMode,
  activeCast: boolean
): boolean {
  return mode === 'follow' && !activeCast;
}
