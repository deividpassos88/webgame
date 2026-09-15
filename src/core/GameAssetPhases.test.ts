import { describe, expect, it, vi } from 'vitest';
import { loadGameAssetsInPhases } from './GameAssetPhases';

describe('loadGameAssetsInPhases', () => {
  it('shows the lobby after the character is ready and defers gameplay assets until start', async () => {
    const order: string[] = [];
    let releaseLobby!: () => void;
    const lobbyClosed = new Promise<void>((resolve) => { releaseLobby = resolve; });

    const pending = loadGameAssetsInPhases({
      loadCharacter: async () => { order.push('character'); },
      showLobby: async () => { order.push('lobby'); await lobbyClosed; },
      loadGameplay: [
        async () => { order.push('rewards'); },
        async () => { order.push('enemies'); },
        async () => { order.push('boss'); },
      ],
    });

    await vi.waitFor(() => expect(order).toEqual(['character', 'lobby']));
    releaseLobby();
    await pending;
    expect(order.slice(2).sort()).toEqual(['boss', 'enemies', 'rewards']);
  });
});
