import { describe, expect, it } from 'vitest';
import { CharacterSelectionState } from './CharacterSelectionState';

describe('CharacterSelectionState', () => {
  it('starts without a selected character and requires a valid choice', () => {
    const state = new CharacterSelectionState(['dragon-miner', 'paladin']);

    expect(state.selectedId).toBeNull();
    expect(state.confirm()).toBeNull();
    expect(state.select('paladin')).toBe(true);
    expect(state.confirm()).toBe('paladin');
  });

  it('ignores unavailable characters', () => {
    const state = new CharacterSelectionState(['dragon-miner']);

    expect(state.select('paladin')).toBe(false);
    expect(state.selectedId).toBeNull();
  });

  it('moves through available options and skips unavailable ones', () => {
    const state = new CharacterSelectionState(['paladin']);

    expect(state.move(1)).toBe('paladin');
    expect(state.move(-1)).toBe('paladin');
  });

  it('wraps keyboard navigation between both characters', () => {
    const state = new CharacterSelectionState(['dragon-miner', 'paladin']);

    expect(state.move(1)).toBe('dragon-miner');
    expect(state.move(1)).toBe('paladin');
    expect(state.move(1)).toBe('dragon-miner');
    expect(state.move(-1)).toBe('paladin');
  });
});
