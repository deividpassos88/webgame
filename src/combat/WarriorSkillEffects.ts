import type { WarriorSkillId } from './WarriorSkillCatalog';

/**
 * Efeito de controle que cada skill do Guerreiro deixa no monstro. O ataque
 * normal não entra aqui: monstros só reagem a impacto, nunca travados.
 */
export type WarriorSkillEffectKind = 'stun' | 'freeze' | 'slow' | 'knockdown' | 'blade-storm';

export interface WarriorSkillEffectDefinition {
  readonly kind: WarriorSkillEffectKind;
  readonly durationSeconds: number;
  /** Texto curto usado no HUD e nos testes. */
  readonly label: string;
}

export const WARRIOR_SKILL_EFFECTS: Record<WarriorSkillId, WarriorSkillEffectDefinition> = {
  ataque_giratorio: { kind: 'stun', durationSeconds: 1.2, label: 'Tonteia por 1,2s' },
  ataque_giratorio_2: { kind: 'freeze', durationSeconds: 1.2, label: 'Congela por 1,2s' },
  pulo_atacando: { kind: 'slow', durationSeconds: 1.5, label: 'Deixa lento por 1,5s' },
  triplo_ataque: { kind: 'knockdown', durationSeconds: 1.3, label: 'Derruba e prende por 1,3s' },
  corte_duplo: { kind: 'blade-storm', durationSeconds: 0, label: 'Solta arcos de lâmina em vertical' },
};

/** Cada arco do corte duplo é um acerto próprio. */
export const BLADE_STORM_ARC_COUNT = 4;
export const BLADE_STORM_INTERVAL_SECONDS = 0.17;
export const BLADE_STORM_RADIUS_METERS = 3.4;
export const BLADE_STORM_DAMAGE_RATIO = 0.42;
export const BLADE_STORM_TOTAL_DURATION_SECONDS =
  (BLADE_STORM_ARC_COUNT - 1) * BLADE_STORM_INTERVAL_SECONDS;

export function getWarriorSkillEffect(id: WarriorSkillId): WarriorSkillEffectDefinition {
  const effect = WARRIOR_SKILL_EFFECTS[id];
  if (!effect) throw new Error(`Efeito de skill desconhecido: ${id}`);
  return effect;
}

/** true quando o efeito prende o monstro (não anda e não ataca). */
export function warriorSkillEffectLocksTarget(kind: WarriorSkillEffectKind): boolean {
  return kind === 'stun' || kind === 'freeze' || kind === 'knockdown';
}

/** true quando o efeito apenas deixa o monstro mais lento. */
export function warriorSkillEffectSlowsTarget(kind: WarriorSkillEffectKind): boolean {
  return kind === 'slow';
}

export function warriorSkillEffectIsBladeStorm(kind: WarriorSkillEffectKind): boolean {
  return kind === 'blade-storm';
}
