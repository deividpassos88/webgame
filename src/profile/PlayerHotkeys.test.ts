import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAYER_HOTKEYS,
  registerPlayerHotkey,
} from './PlayerHotkeys';

describe('player combat hotkeys', () => {
  it('keeps keyboard bindings only for the five Warrior skills', () => {
    expect(DEFAULT_PLAYER_HOTKEYS).toEqual({
      ataque_giratorio: '1',
      ataque_giratorio_2: '2',
      pulo_atacando: '3',
      triplo_ataque: '4',
      corte_duplo: '5',
    });
  });

  it('updates a binding with a normalized keyboard key', () => {
    const result = registerPlayerHotkey(DEFAULT_PLAYER_HOTKEYS, 'ataque_giratorio', 'R');

    expect(result).toEqual({
      kind: 'updated',
      hotkeys: { ...DEFAULT_PLAYER_HOTKEYS, ataque_giratorio: 'r' },
    });
  });

  it('refuses duplicate and gameplay-reserved keys without changing the profile bindings', () => {
    expect(registerPlayerHotkey(DEFAULT_PLAYER_HOTKEYS, 'corte_duplo', '1')).toMatchObject({
      kind: 'conflict',
      hotkeys: DEFAULT_PLAYER_HOTKEYS,
    });
    expect(registerPlayerHotkey(DEFAULT_PLAYER_HOTKEYS, 'ataque_giratorio', 'w')).toMatchObject({
      kind: 'reserved',
      hotkeys: DEFAULT_PLAYER_HOTKEYS,
    });
  });
});
