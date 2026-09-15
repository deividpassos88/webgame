export interface BossHealthSource {
  hp: number;
  maxHP: number;
  isDead: boolean;
}

export function getBossHealthHudValues(
  boss: BossHealthSource
): { hp: number; maxHP: number } {
  return {
    hp: boss.isDead ? 0 : boss.hp,
    maxHP: boss.maxHP,
  };
}
