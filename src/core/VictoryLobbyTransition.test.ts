import { describe, expect, it, vi } from 'vitest';
import { VictoryLobbyTransition } from './VictoryLobbyTransition';

describe('VictoryLobbyTransition', () => {
  it('returns to the lobby once after five visible seconds', () => {
    const onReturn = vi.fn();
    const transition = new VictoryLobbyTransition(5, onReturn);

    transition.start();
    transition.update(4.99);
    expect(onReturn).not.toHaveBeenCalled();
    transition.update(0.01);
    transition.update(100);

    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending return when the run resets', () => {
    const onReturn = vi.fn();
    const transition = new VictoryLobbyTransition(5, onReturn);

    transition.start();
    transition.update(2);
    transition.reset();
    transition.update(10);

    expect(onReturn).not.toHaveBeenCalled();
  });

  it('allows the victory acknowledgement to complete only the scheduled lobby return', () => {
    const onReturn = vi.fn();
    const transition = new VictoryLobbyTransition(5, onReturn);

    transition.start();
    transition.completeNow();
    transition.update(100);

    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it('ignores acknowledgement when no victory return is scheduled or after reset', () => {
    const onReturn = vi.fn();
    const transition = new VictoryLobbyTransition(5, onReturn);

    transition.completeNow();
    transition.start();
    transition.reset();
    transition.completeNow();

    expect(onReturn).not.toHaveBeenCalled();
  });

  it('can be rearmed after an interrupted return so a later acknowledgement retries it', () => {
    const onReturn = vi.fn();
    const transition = new VictoryLobbyTransition(5, onReturn);

    transition.start();
    transition.completeNow();
    transition.start();
    transition.completeNow();

    expect(onReturn).toHaveBeenCalledTimes(2);
  });
});
