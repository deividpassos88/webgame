import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BossApproachJumpController } from './BossApproachJumpController';

describe('BossApproachJumpController', () => {
  it('does not jump while the player is within fifteen metres', () => {
    const controller = new BossApproachJumpController(() => 0);

    expect(controller.tryStart(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(15, 0, 0)
    )).toBeNull();
  });

  it('occasionally jumps close to a player farther than fifteen metres', () => {
    const controller = new BossApproachJumpController(() => 0.24);

    const target = controller.tryStart(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(20, 0, 0)
    );

    expect(target?.toArray()).toEqual([17.5, 0, 0]);
  });

  it('rejects the jump when the twenty-five-percent roll fails', () => {
    const controller = new BossApproachJumpController(() => 0.25);

    expect(controller.tryStart(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(20, 0, 0)
    )).toBeNull();
  });

  it('enforces twelve seconds between approach jumps', () => {
    const controller = new BossApproachJumpController(() => 0);
    const boss = new THREE.Vector3(0, 0, 0);
    const player = new THREE.Vector3(20, 0, 0);

    expect(controller.tryStart(boss, player)).not.toBeNull();
    expect(controller.tryStart(boss, player)).toBeNull();
    controller.update(11.99);
    expect(controller.tryStart(boss, player)).toBeNull();
    controller.update(0.01);
    expect(controller.tryStart(boss, player)).not.toBeNull();
  });
});
