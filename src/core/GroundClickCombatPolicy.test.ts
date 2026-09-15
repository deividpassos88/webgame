import { describe, expect, it } from 'vitest';
import { resolveGroundClickCombatAction } from './GroundClickCombatPolicy';

describe('resolveGroundClickCombatAction', () => {
  it('turns every ground click into an attack, including a distant click', () => {
    expect(resolveGroundClickCombatAction(null)).toBe('attack-cursor');
    expect(resolveGroundClickCombatAction(9)).toBe('attack-cursor');
    expect(resolveGroundClickCombatAction(1.5)).toBe('attack-training-dummy');
  });
});
