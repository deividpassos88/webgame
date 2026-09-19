import { describe, expect, it } from 'vitest';
import {
  canAcceptPlayerInput,
  cappedMovementStep,
  resolveDamageReaction,
  resolveLocomotionState,
} from './PlayerLocomotion';

const still = {
  keyboardMoving: false,
  hasMoveTarget: false,
  hasAttackTarget: false,
  isSwinging: false,
  isDead: false,
};

describe('resolveLocomotionState', () => {
  it('keeps running while keyboard movement is active', () => {
    expect(resolveLocomotionState({ ...still, keyboardMoving: true })).toBe(
      'running'
    );
  });

  it('returns to idle after keyboard movement stops', () => {
    expect(resolveLocomotionState(still)).toBe('idle');
  });

  it('keeps running toward a clicked destination', () => {
    expect(resolveLocomotionState({ ...still, hasMoveTarget: true })).toBe(
      'running'
    );
  });

  it('does not override attack or death states', () => {
    expect(resolveLocomotionState({ ...still, isSwinging: true })).toBeNull();
    expect(resolveLocomotionState({ ...still, isDead: true })).toBeNull();
  });

  it('keeps running while moving with keyboard even when an attack target exists', () => {
    expect(
      resolveLocomotionState({ ...still, hasAttackTarget: true, keyboardMoving: true })
    ).toBe('running');
    expect(
      resolveLocomotionState({ ...still, hasAttackTarget: true, keyboardMoving: false })
    ).toBe('idle');
  });
});

describe('cappedMovementStep', () => {
  it('never steps past the remaining distance', () => {
    expect(cappedMovementStep(0.2, 4.5, 0.1)).toBe(0.2);
    expect(cappedMovementStep(2, 4.5, 0.1)).toBe(0.45);
  });
});

describe('canAcceptPlayerInput', () => {
  it('blocks movement and attack while hit reaction owns the animation', () => {
    expect(
      canAcceptPlayerInput({ isDead: false, isSwinging: false, isHitReacting: true, inputLocked: false })
    ).toBe(false);
    expect(
      canAcceptPlayerInput({ isDead: false, isSwinging: false, isHitReacting: false, inputLocked: false })
    ).toBe(true);
  });

  it('blocks movement and attack while reward selection owns input', () => {
    expect(
      canAcceptPlayerInput({ isDead: false, isSwinging: false, isHitReacting: false, inputLocked: true })
    ).toBe(false);
  });
});

describe('resolveDamageReaction', () => {
  it('keeps an active attack progressing when non-fatal damage arrives', () => {
    expect(resolveDamageReaction({ remainingHp: 50, isSwinging: true })).toBe(
      'continue-attack'
    );
  });

  it('plays hit reaction while idle and death when health reaches zero', () => {
    expect(resolveDamageReaction({ remainingHp: 50, isSwinging: false })).toBe(
      'hit'
    );
    expect(resolveDamageReaction({ remainingHp: 0, isSwinging: true })).toBe(
      'dead'
    );
  });
});
