import type { CharacterAnimationState } from '../characters/CharacterCatalog';

const ONE_SHOT_STATES: ReadonlySet<CharacterAnimationState> = new Set([
  'attacking',
  'hit',
  'dead',
]);

export class PlayerAnimationPreview {
  public activeState: CharacterAnimationState | null = null;

  public select(state: CharacterAnimationState): void {
    this.activeState = state;
  }

  public finish(state: CharacterAnimationState): CharacterAnimationState | null {
    if (state !== this.activeState || !ONE_SHOT_STATES.has(state)) return null;
    this.activeState = 'idle';
    return 'idle';
  }

  public clear(): void {
    this.activeState = null;
  }
}
