import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FinalBossRewardCoordinator,
  type FinalBossRewardChestPort,
} from './FinalBossRewardCoordinator';

class TestChest implements FinalBossRewardChestPort {
  public readonly root = new THREE.Group();
  public openingComplete = false;
  public removable = false;
  public claimed = false;
  public disposed = false;

  public beginOpening(): boolean {
    return true;
  }

  public claim(): void {
    this.claimed = true;
  }

  public update(delta: number): void {
    if (!this.openingComplete && delta >= 0.7) this.openingComplete = true;
    if (this.claimed && delta >= 0.45) this.removable = true;
  }

  public dispose(): void {
    this.disposed = true;
    this.root.removeFromParent();
  }
}

describe('FinalBossRewardCoordinator', () => {
  it('opens and collapses the final chest before settling rewards and releasing victory UI', () => {
    const scene = new THREE.Scene();
    const chest = new TestChest();
    const events: string[] = [];
    const coordinator = new FinalBossRewardCoordinator({
      scene,
      createChest: () => chest,
      onSettle: () => events.push('settle'),
      onFinished: () => events.push('finished'),
    });

    expect(coordinator.start(new THREE.Vector3(4, 0, -12))).toBe(chest.root);
    expect(chest.root.parent).toBe(scene);
    expect(chest.root.position.toArray()).toEqual([4, 0, -12]);

    coordinator.update(0.7);
    expect(chest.claimed).toBe(true);
    expect(events).toEqual([]);

    coordinator.update(0.45);
    expect(chest.disposed).toBe(true);
    expect(events).toEqual(['settle', 'finished']);
    expect(coordinator.state).toBe('finished');
  });

  it('settles exactly once without a model so a failed chest asset cannot lose a boss reward', () => {
    const events: string[] = [];
    const coordinator = new FinalBossRewardCoordinator({
      scene: new THREE.Scene(),
      createChest: () => null,
      onSettle: () => events.push('settle'),
      onFinished: () => events.push('finished'),
    });

    expect(coordinator.start(new THREE.Vector3())).toBeNull();
    coordinator.update(10);

    expect(events).toEqual(['settle', 'finished']);
    expect(coordinator.state).toBe('finished');
  });
});
