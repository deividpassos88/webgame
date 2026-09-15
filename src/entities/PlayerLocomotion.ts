export interface LocomotionInput {
  keyboardMoving: boolean;
  hasMoveTarget: boolean;
  hasAttackTarget: boolean;
  isSwinging: boolean;
  isDead: boolean;
}

export interface PlayerInputLock {
  isDead: boolean;
  isSwinging: boolean;
  isHitReacting: boolean;
  inputLocked: boolean;
}

export type DamageReaction = 'dead' | 'continue-attack' | 'hit';

export function resolveDamageReaction(input: {
  remainingHp: number;
  isSwinging: boolean;
}): DamageReaction {
  if (input.remainingHp <= 0) return 'dead';
  return input.isSwinging ? 'continue-attack' : 'hit';
}

export function canAcceptPlayerInput(input: PlayerInputLock): boolean {
  return (
    !input.isDead &&
    !input.isSwinging &&
    !input.isHitReacting &&
    !input.inputLocked
  );
}

export function cappedMovementStep(
  remainingDistance: number,
  speed: number,
  delta: number
): number {
  return Math.min(remainingDistance, Math.max(0, speed * delta));
}

export function resolveLocomotionState(
  input: LocomotionInput
): 'idle' | 'running' | null {
  if (input.isDead || input.isSwinging || input.hasAttackTarget) return null;
  return input.keyboardMoving || input.hasMoveTarget ? 'running' : 'idle';
}
