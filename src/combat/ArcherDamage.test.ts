import { describe, expect, it } from 'vitest';
import { ARCHER_DAMAGE_VS_MAGE_MULTIPLIER, archerDamageAgainstClass } from './ArcherDamage';

describe('archerDamageAgainstClass', () => {
  it('hits the Maga 30% harder and leaves the Guerreiro damage unchanged', () => {
    expect(ARCHER_DAMAGE_VS_MAGE_MULTIPLIER).toBe(1.3);

    expect(archerDamageAgainstClass(10, 'mage')).toBeCloseTo(13);
    expect(archerDamageAgainstClass(25, 'mage')).toBeCloseTo(32.5);

    expect(archerDamageAgainstClass(10, 'paladin')).toBe(10);
    expect(archerDamageAgainstClass(25, 'paladin')).toBe(25);
  });
});
