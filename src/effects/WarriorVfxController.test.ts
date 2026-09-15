import { describe, expect, it } from 'vitest';
import type { WarriorAttackId } from '../characters/CharacterCatalog';
import { WarriorVfxController, type WarriorVfxPort } from './WarriorVfxController';

class FakeVfxPort implements WarriorVfxPort {
  public active = false;
  public fadeSeconds = 0;
  public attackId: WarriorAttackId | null = null;
  public bursts = 0;
  public updates: number[] = [];

  setAttack(id: WarriorAttackId): void { this.attackId = id; }
  setActive(active: boolean): void { this.active = active; }
  beginFade(seconds: number): void { this.active = false; this.fadeSeconds = seconds; }
  burst(): void { this.bursts += 1; }
  update(delta: number): void { this.updates.push(delta); }
  clear(): void { this.active = false; this.fadeSeconds = 0; }
}

describe('WarriorVfxController', () => {
  it('keeps the effect alive through the configured fade after the trail closes', () => {
    const port = new FakeVfxPort();
    const controller = new WarriorVfxController(port);

    controller.prepare('ataque_giratorio');
    controller.openTrail();
    controller.burst();
    controller.closeTrail();

    expect(port.attackId).toBe('ataque_giratorio');
    expect(port.bursts).toBe(1);
    expect(port.fadeSeconds).toBe(0.95);
    expect(controller.activeEffectCount).toBe(1);

    controller.update(0.5);
    expect(controller.activeEffectCount).toBe(1);

    controller.update(0.46);
    expect(controller.activeEffectCount).toBe(0);
  });

  it('clears immediately when combat is cancelled', () => {
    const port = new FakeVfxPort();
    const controller = new WarriorVfxController(port);
    controller.prepare('triplo_ataque');
    controller.openTrail();

    controller.clear();

    expect(controller.activeEffectCount).toBe(0);
    expect(port.active).toBe(false);
  });
});
