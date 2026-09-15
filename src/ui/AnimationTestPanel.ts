import type { CharacterAnimationState } from '../characters/CharacterCatalog';

export interface AnimationTestButton {
  state: CharacterAnimationState;
  label: string;
  clipName: string;
}

export const ANIMATION_TEST_BUTTONS: readonly AnimationTestButton[] = [
  { state: 'idle', label: 'Parado', clipName: 'caminhando (pose)' },
  { state: 'running', label: 'Correr', clipName: 'correndo' },
  { state: 'attacking', label: 'Atacar', clipName: 'ataque_basico' },
  { state: 'hit', label: 'Receber golpe', clipName: 'recebe_dano' },
  { state: 'dead', label: 'Morrer', clipName: 'morte' },
];

export function parseAnimationTestState(
  value: string | undefined
): CharacterAnimationState | null {
  return ANIMATION_TEST_BUTTONS.some((button) => button.state === value)
    ? (value as CharacterAnimationState)
    : null;
}
