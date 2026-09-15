import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Game } from './Game';

describe('Game mini-boss skill damage', () => {
  it('uses the mini-boss normal attack as the skill damage basis without distance falloff', () => {
    const miniBossRoot = new THREE.Object3D();
    miniBossRoot.position.set(0, 0, 0);

    const controller = {
      update: vi.fn(() => ({ events: [], damage: 20 })),
    };
    const onEnemyHitPlayer = vi.fn();
    const game = Object.create(Game.prototype) as Game & Record<string, unknown>;

    Object.assign(game, {
      combatRegistry: {
        activeRoots: () => [miniBossRoot],
        findByRoot: () => ({
          id: 'mini-1',
          role: 'mini-boss',
          enemy: { damage: 24 },
        }),
      },
      miniBossSkillControllers: new Map([['mini-1', controller]]),
      miniBossEffects: {
        handle: vi.fn(),
        clear: vi.fn(),
        update: vi.fn(),
      },
      player: {
        root: { position: new THREE.Vector3(3, 25, 4) },
      },
      onMiniBossSkillHitPlayer: onEnemyHitPlayer,
    });

    (game as unknown as { updateMiniBossSkills(delta: number): void })
      .updateMiniBossSkills(1 / 60);

    expect(controller.update).toHaveBeenCalledWith(
      1 / 60,
      miniBossRoot.position,
      new THREE.Vector3(3, 25, 4),
      24
    );
    expect(onEnemyHitPlayer).toHaveBeenCalledWith(20);
  });
});
