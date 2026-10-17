import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Game } from './Game';
import { MageWardVFX } from '../vfx/MageWardVFX';

describe('Mage ward integrated collision', () => {
  it('prevents regular enemies and bosses from entering four metres during the ward', () => {
    const game = Object.create(Game.prototype) as Game & Record<string, unknown>;
    const ward = new MageWardVFX();
    const regular = new THREE.Object3D();
    regular.position.set(1, 0, 0);
    const boss = new THREE.Object3D();
    boss.position.set(3.9, 0, 0);
    const records = [
      { enemy: { root: regular, collisionRadius: 0.45, isDead: false } },
      { enemy: { root: boss, collisionRadius: 1.05, isDead: false } },
    ];
    const roots = [regular, boss];
    Object.assign(game, {
      mageWard: ward,
      profile: { selectedClass: 'mage' },
      player: { root: { position: new THREE.Vector3() } },
      combatRegistry: {
        activeRoots: () => roots,
        findByRoot: (root: THREE.Object3D) =>
          records.find((r) => r.enemy.root === root) ?? null,
      },
    });
    const constrain = (game as unknown as { updateMageWardBarrier(): void }).updateMageWardBarrier.bind(game);
    try {
      ward.activate(new THREE.Vector3());
      constrain();
      expect(regular.position.x).toBeCloseTo(4.45, 4);
      expect(boss.position.x).toBeCloseTo(5.05, 4);
      ward.update(3, new THREE.Vector3());
      regular.position.set(1, 0, 0);
      constrain();
      expect(regular.position.x).toBe(1);
      ward.activate(new THREE.Vector3());
      (game as unknown as { profile: { selectedClass: string } }).profile.selectedClass = 'paladin';
      constrain();
      expect(regular.position.x).toBe(1);
    } finally {
      ward.dispose();
    }
  });
});
