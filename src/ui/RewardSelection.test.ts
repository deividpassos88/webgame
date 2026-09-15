import { describe, expect, it } from 'vitest';
import { parseEquipmentId, rewardOptionsForAvailability } from './RewardSelection';

describe('reward selection', () => {
  it('accepts only the two supported weapon ids', () => {
    expect(parseEquipmentId('sword')).toBe('sword');
    expect(parseEquipmentId('axe')).toBe('axe');
    expect(parseEquipmentId('armor')).toBeNull();
    expect(parseEquipmentId(undefined)).toBeNull();
  });

  it('marks an unavailable model as disabled without hiding the other reward', () => {
    expect(
      rewardOptionsForAvailability({ sword: true, axe: false }).map(
        ({ id, enabled }) => ({ id, enabled })
      )
    ).toEqual([
      { id: 'sword', enabled: true },
      { id: 'axe', enabled: false },
    ]);
  });

  it('builds exact card values from the equipment catalog', () => {
    const [sword, axe] = rewardOptionsForAvailability({ sword: true, axe: true });
    expect(sword).toMatchObject({
      id: 'sword', name: 'Espada Longa', damage: '8', range: '2,7 m',
      cooldown: '0,7 s', regularHeal: '3%', miniBossHeal: '6%', defense: '3%', enabled: true,
    });
    expect(axe).toMatchObject({
      id: 'axe', name: 'Machado de Guerra', damage: '10', range: '2,0 m',
      cooldown: '0,9 s', regularHeal: '3,1%', miniBossHeal: '6,2%', defense: '5%', enabled: true,
    });
  });
});
