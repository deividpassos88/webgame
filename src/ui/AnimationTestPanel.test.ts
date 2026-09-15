import { describe, expect, it } from 'vitest';
import {
  ANIMATION_TEST_BUTTONS,
  parseAnimationTestState,
} from './AnimationTestPanel';

describe('AnimationTestPanel', () => {
  it('provides one control for every player animation state', () => {
    expect(ANIMATION_TEST_BUTTONS).toEqual([
      { state: 'idle', label: 'Parado', clipName: 'caminhando (pose)' },
      { state: 'running', label: 'Correr', clipName: 'correndo' },
      { state: 'attacking', label: 'Atacar', clipName: 'ataque_basico' },
      { state: 'hit', label: 'Receber golpe', clipName: 'recebe_dano' },
      { state: 'dead', label: 'Morrer', clipName: 'morte' },
    ]);
  });

  it('accepts only states exposed by the animation test panel', () => {
    expect(parseAnimationTestState('attacking')).toBe('attacking');
    expect(parseAnimationTestState('unknown')).toBeNull();
    expect(parseAnimationTestState(undefined)).toBeNull();
  });
});
