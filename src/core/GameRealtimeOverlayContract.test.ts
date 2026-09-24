import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const gameSource = readFileSync(new URL('./Game.ts', import.meta.url), 'utf8');

describe('Game real-time overlay contract', () => {
  it('cancels player actions and delegates keyboard ownership to the open panel', () => {
    expect(gameSource).toContain('this.player.cancelMovement()');
    expect(gameSource).toContain('this.input.setGameplayInputBlocked(true)');
    expect(gameSource).toContain('this.input.setGameplayInputBlocked(false)');
  });

  it('does not gate the game loop or skill cooldowns on a presentation pause', () => {
    expect(gameSource).not.toContain('this.flow.isSimulationPaused');
    expect(gameSource).toContain('this.warriorSkills.update(delta, false,');
  });

  it('dismisses an open panel before either terminal combat state takes over', () => {
    const terminalTransitions = gameSource.match(/this\.dismissRpgOverlay\(\);/g) ?? [];

    expect(terminalTransitions).toHaveLength(2);
  });
});
