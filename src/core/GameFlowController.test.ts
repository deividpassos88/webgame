import { describe, expect, it } from 'vitest';
import { GameFlowController } from './GameFlowController';

describe('GameFlowController', () => {
  it('routes a missing profile through class selection, lobby, and play', () => {
    const flow = new GameFlowController('class-select');

    expect(flow.transition({ type: 'class-confirmed' })).toBe('lobby');
    expect(flow.transition({ type: 'start-game' })).toBe('loading-game');
    expect(flow.transition({ type: 'game-ready' })).toBe('playing');
    expect(flow.acceptsGameplayInput).toBe(true);
  });

  it('keeps the simulation in play while the inventory is presented', () => {
    const flow = new GameFlowController('playing');

    expect(flow.transition({ type: 'open-inventory' })).toBe('playing');
    expect(flow.isSimulationPaused).toBe(false);
    expect(flow.acceptsGameplayInput).toBe(true);
    expect(flow.transition({ type: 'close-overlay' })).toBe('playing');
  });

  it('keeps the simulation in play while loot is presented', () => {
    const flow = new GameFlowController('playing');

    expect(flow.transition({ type: 'open-loot' })).toBe('playing');
    expect(flow.isSimulationPaused).toBe(false);
    expect(flow.transition({ type: 'close-overlay' })).toBe('playing');
  });

  it('rejects illegal transitions without changing state', () => {
    const flow = new GameFlowController('lobby');

    expect(flow.transition({ type: 'open-inventory' })).toBe('lobby');
    expect(flow.lastRejection).toEqual({
      state: 'lobby',
      event: 'open-inventory',
    });
  });

  it('routes terminal combat states only from active play', () => {
    const dead = new GameFlowController('playing');
    const victory = new GameFlowController('playing');

    expect(dead.transition({ type: 'player-died' })).toBe('dead');
    expect(victory.transition({ type: 'victory' })).toBe('victory');
  });

  it('lets death and victory take precedence over a presented panel', () => {
    const dead = new GameFlowController('playing');
    const victory = new GameFlowController('playing');

    dead.transition({ type: 'open-inventory' });
    victory.transition({ type: 'open-loot' });

    expect(dead.transition({ type: 'player-died' })).toBe('dead');
    expect(victory.transition({ type: 'victory' })).toBe('victory');
    expect(dead.transition({ type: 'close-overlay' })).toBe('dead');
    expect(victory.transition({ type: 'close-overlay' })).toBe('victory');
  });
});
