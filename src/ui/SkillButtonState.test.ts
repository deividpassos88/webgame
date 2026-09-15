import { describe, expect, it } from 'vitest';
import { getLockedSkillButtonState, getSkillButtonState } from './SkillButtonState';

const ready = { cooldown: 3, cooldownRemaining: 0, energyCost: 12, available: true };

describe('getSkillButtonState', () => {
  it('explains each combat lock to assistive technology and the player', () => {
    expect(getSkillButtonState('Corte', ready, 'busy')).toMatchObject({
      disabled: true,
      status: 'Executando outro ataque',
    });
    expect(getSkillButtonState('Corte', ready, 'paused').status).toBe('Jogo pausado');
    expect(getSkillButtonState('Corte', ready, 'dead').status).toBe('Personagem derrotado');
    expect(getSkillButtonState('Corte', ready, 'fatigue-exhausted')).toMatchObject({
      disabled: true,
      status: 'Fadiga esgotada: recupere 7% para usar skills',
    });
  });

  it('prioritizes cooldown and energy explanations when combat is unlocked', () => {
    expect(getSkillButtonState('Corte', { ...ready, cooldownRemaining: 1.24, available: false }, null)).toMatchObject({
      disabled: true,
      status: 'Recarga: 1.2s',
    });
    expect(getSkillButtonState('Corte', { ...ready, available: false }, null).status).toBe('Energia insuficiente: precisa de 12');
  });

  it('marks a ready skill as available', () => {
    expect(getSkillButtonState('Corte', ready, null)).toEqual({
      disabled: false,
      status: 'Disponível · 12 energia',
      ariaLabel: 'Corte. Disponível · 12 energia',
    });
  });

  it('keeps a locked skill visible but prevents activation until its level', () => {
    expect(getLockedSkillButtonState('Giro Glacial', 3)).toEqual({
      disabled: true,
      status: 'Bloqueada · libera no nível 3',
      ariaLabel: 'Giro Glacial. Bloqueada · libera no nível 3',
    });
  });
});
