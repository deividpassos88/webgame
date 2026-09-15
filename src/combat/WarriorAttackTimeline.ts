import type { WarriorAttackId } from '../characters/CharacterCatalog';

export interface WarriorAttackTimeline {
  readonly trailStart: number;
  readonly trailEnd: number;
  readonly damageStart: number;
  readonly damageEnd: number;
  readonly hitTimes: readonly number[];
  readonly impactTime?: number;
  readonly recoveryEnd: number;
  readonly fadeSeconds: number;
}

const TIMELINES: Readonly<Record<WarriorAttackId, WarriorAttackTimeline>> = {
  ataque_basico: {
    trailStart: 0.25,
    trailEnd: 0.75,
    damageStart: 0.36,
    damageEnd: 0.68,
    hitTimes: [0.48],
    recoveryEnd: 1,
    fadeSeconds: 0.4,
  },
  ataque_giratorio: {
    trailStart: 0.18,
    trailEnd: 0.85,
    damageStart: 0.34,
    damageEnd: 0.7,
    hitTimes: [0.52],
    recoveryEnd: 1,
    fadeSeconds: 0.95,
  },
  ataque_giratorio_2: {
    trailStart: 0.12,
    trailEnd: 0.88,
    damageStart: 0.3,
    damageEnd: 0.72,
    hitTimes: [0.5],
    recoveryEnd: 1,
    fadeSeconds: 1.05,
  },
  pulo_atacando: {
    trailStart: 0.35,
    trailEnd: 0.78,
    damageStart: 0.6,
    damageEnd: 0.76,
    hitTimes: [0.68],
    impactTime: 0.68,
    recoveryEnd: 1,
    fadeSeconds: 1.2,
  },
  triplo_ataque: {
    trailStart: 0.15,
    trailEnd: 0.86,
    damageStart: 0.28,
    damageEnd: 0.83,
    hitTimes: [0.32, 0.55, 0.78],
    recoveryEnd: 1,
    fadeSeconds: 1.4,
  },
  corte_duplo: {
    trailStart: 0.2,
    trailEnd: 0.8,
    damageStart: 0.34,
    damageEnd: 0.76,
    hitTimes: [0.4, 0.7],
    recoveryEnd: 1,
    fadeSeconds: 1.15,
  },
};

export function getWarriorAttackTimeline(id: WarriorAttackId): WarriorAttackTimeline {
  return TIMELINES[id];
}
