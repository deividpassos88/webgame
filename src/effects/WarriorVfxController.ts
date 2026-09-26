import type { WarriorAttackId } from '../characters/CharacterCatalog';
import { getWarriorAttackTimeline } from '../combat/WarriorAttackTimeline';

export interface WarriorVfxPort {
  setAttack(id: WarriorAttackId): void;
  setStageDirection?(stage: number): void;
  setActive(active: boolean): void;
  beginFade(seconds: number): void;
  burst(): void;
  update(delta: number): void;
  clear(): void;
}

/** Coordinates attack events with the pooled WebGL presentation layer. */
export class WarriorVfxController {
  private attackId: WarriorAttackId | null = null;
  private fadeRemaining = 0;

  public constructor(private readonly port: WarriorVfxPort) {}

  public get activeEffectCount(): number {
    return this.attackId === null ? 0 : 1;
  }

  public prepare(id: WarriorAttackId): void {
    this.attackId = id;
    this.fadeRemaining = 0;
    this.port.setAttack(id);
  }

  public setStageDirection(stage: number): void {
    this.port.setStageDirection?.(stage);
  }

  public openTrail(): void {
    if (!this.attackId) return;
    this.fadeRemaining = 0;
    this.port.setActive(true);
  }

  public burst(): void {
    if (!this.attackId) return;
    this.port.burst();
  }

  public closeTrail(): void {
    if (!this.attackId) return;
    this.fadeRemaining = getWarriorAttackTimeline(this.attackId).fadeSeconds;
    this.port.beginFade(this.fadeRemaining);
  }

  public update(delta: number): void {
    const elapsed = Number.isFinite(delta) && delta > 0 ? delta : 0;
    this.port.update(elapsed);
    if (this.fadeRemaining <= 0) return;
    this.fadeRemaining = Math.max(0, this.fadeRemaining - elapsed);
    if (this.fadeRemaining === 0) this.attackId = null;
  }

  public clear(): void {
    this.attackId = null;
    this.fadeRemaining = 0;
    this.port.clear();
  }
}
