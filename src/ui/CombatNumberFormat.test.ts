import { describe, expect, it } from 'vitest';
import { formatHealingAmount } from './CombatNumberFormat';

describe('formatHealingAmount', () => {
  it.each([
    [4.000005, '+4,0 HP'],
    [3.1, '+3,1 HP'],
    [6.25, '+6,3 HP'],
    [-2, '+0,0 HP'],
    [Number.NaN, '+0,0 HP'],
  ] as const)('formats %s as %s', (input, expected) => {
    expect(formatHealingAmount(input)).toBe(expected);
  });
});
