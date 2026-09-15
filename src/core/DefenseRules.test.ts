import { describe, expect, it } from 'vitest';
import { isAttackBlocked } from './DefenseRules';

describe('weapon defense rules', () => {
  it.each([
    ['regular', 'sword', 0.029, true],
    ['regular', 'sword', 0.03, false],
    ['regular', 'axe', 0.049, true],
    ['regular', 'axe', 0.05, false],
    ['mini-boss', 'axe', 0, false],
    ['boss', 'axe', 0, false],
  ] as const)('evaluates %s attack with %s at %s', (role, weapon, roll, expected) => {
    expect(isAttackBlocked(role, weapon, roll)).toBe(expected);
  });

  it('clamps rolls without expanding the approved chance', () => {
    expect(isAttackBlocked('regular', 'sword', -1)).toBe(true);
    expect(isAttackBlocked('regular', 'axe', 2)).toBe(false);
  });
});
