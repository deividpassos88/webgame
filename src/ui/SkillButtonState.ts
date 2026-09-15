import type { SkillStateSnapshot } from '../combat/WarriorSkillController';

export type CombatLockReason = 'busy' | 'paused' | 'dead' | 'unavailable' | 'fatigue-exhausted' | null;

export interface SkillButtonViewState {
  readonly disabled: boolean;
  readonly status: string;
  readonly ariaLabel: string;
}

export function getSkillButtonState(
  label: string,
  state: SkillStateSnapshot,
  lock: CombatLockReason
): SkillButtonViewState {
  let status: string;
  if (lock === 'dead') status = 'Personagem derrotado';
  else if (lock === 'paused') status = 'Jogo pausado';
  else if (lock === 'busy') status = 'Executando outro ataque';
  else if (lock === 'fatigue-exhausted') status = 'Fadiga esgotada: recupere 7% para usar skills';
  else if (lock === 'unavailable') status = 'Ação indisponível';
  else if (state.cooldownRemaining > 0) status = `Recarga: ${state.cooldownRemaining.toFixed(1)}s`;
  else if (!state.available) status = `Energia insuficiente: precisa de ${state.energyCost}`;
  else status = `Disponível · ${state.energyCost} energia`;

  return {
    disabled: lock !== null || !state.available,
    status,
    ariaLabel: `${label}. ${status}`,
  };
}

export function getLockedSkillButtonState(
  label: string,
  unlockLevel: number
): SkillButtonViewState {
  const status = `Bloqueada · libera no nível ${unlockLevel}`;
  return {
    disabled: true,
    status,
    ariaLabel: `${label}. ${status}`,
  };
}
