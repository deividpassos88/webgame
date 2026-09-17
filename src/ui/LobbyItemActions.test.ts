import { describe, expect, it } from 'vitest';
import { resolveLobbyItemActionState } from './LobbyItemActions';

describe('lobby item action policy', () => {
  it('offers equip and upgrade for gear in the backpack, plus destruction', () => {
    expect(resolveLobbyItemActionState('equipment', 'backpack')).toEqual({
      equipVisible: true,
      equipLabel: 'Equipar',
      upgradeVisible: true,
      destroyVisible: true,
      destroyDisabled: false,
    });
  });

  it('swaps equip for unequip on worn gear and blocks destruction', () => {
    const state = resolveLobbyItemActionState('equipment', 'equipment');

    expect(state.equipVisible).toBe(true);
    expect(state.equipLabel).toBe('Desequipar');
    expect(state.upgradeVisible).toBe(true);
    expect(state.destroyVisible).toBe(true);
    // Gear must come off before it can be destroyed.
    expect(state.destroyDisabled).toBe(true);
  });

  it('offers destruction only for materials and consumables', () => {
    for (const kind of ['material', 'consumable'] as const) {
      const state = resolveLobbyItemActionState(kind, 'backpack');

      expect(state.equipVisible, kind).toBe(false);
      expect(state.equipLabel, kind).toBeNull();
      expect(state.upgradeVisible, kind).toBe(false);
      expect(state.destroyVisible, kind).toBe(true);
      expect(state.destroyDisabled, kind).toBe(false);
    }
  });

  it('keeps unequip available for a worn stack whose catalog entry lost its kind', () => {
    // Profiles loaded from storage may carry ids that no longer resolve.
    const state = resolveLobbyItemActionState(undefined, 'equipment');

    expect(state.equipVisible).toBe(true);
    expect(state.equipLabel).toBe('Desequipar');
    expect(state.upgradeVisible).toBe(true);
  });

  it('hides equip and upgrade for an item id that resolves to no catalog entry', () => {
    const state = resolveLobbyItemActionState(undefined, 'backpack');

    expect(state.equipVisible).toBe(false);
    expect(state.equipLabel).toBeNull();
    expect(state.upgradeVisible).toBe(false);
    expect(state.destroyVisible).toBe(true);
  });
});
