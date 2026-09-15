import type { WarriorAttackId } from '../characters/CharacterCatalog';
import { getWarriorAttackTimeline } from './WarriorAttackTimeline';

export type WarriorAttackEvent =
  | { readonly type: 'trail-start'; readonly attackId: WarriorAttackId }
  | { readonly type: 'hit'; readonly attackId: WarriorAttackId; readonly hitIndex: number }
  | { readonly type: 'impact'; readonly attackId: WarriorAttackId }
  | { readonly type: 'trail-end'; readonly attackId: WarriorAttackId }
  | { readonly type: 'attack-ended'; readonly attackId: WarriorAttackId };

interface ScheduledAttackEvent {
  readonly normalizedTime: number;
  readonly order: number;
  readonly event: WarriorAttackEvent;
}

export class WarriorAttackController {
  private attackId: WarriorAttackId | null = null;
  private duration = 0;
  private elapsed = 0;
  private nextEventIndex = 0;
  private schedule: readonly ScheduledAttackEvent[] = [];

  public get active(): boolean {
    return this.attackId !== null;
  }

  public get activeAttackId(): WarriorAttackId | null {
    return this.attackId;
  }

  public start(attackId: WarriorAttackId, durationSeconds: number): boolean {
    if (this.active || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return false;
    }
    const timeline = getWarriorAttackTimeline(attackId);
    const schedule: ScheduledAttackEvent[] = [
      {
        normalizedTime: timeline.trailStart,
        order: 0,
        event: { type: 'trail-start', attackId },
      },
      ...timeline.hitTimes.map((normalizedTime, hitIndex) => ({
        normalizedTime,
        order: 10 + hitIndex * 2,
        event: { type: 'hit', attackId, hitIndex } as WarriorAttackEvent,
      })),
      ...(timeline.impactTime === undefined
        ? []
        : [{
            normalizedTime: timeline.impactTime,
            order: 11,
            event: { type: 'impact', attackId } as WarriorAttackEvent,
          }]),
      {
        normalizedTime: timeline.trailEnd,
        order: 90,
        event: { type: 'trail-end', attackId },
      },
      {
        normalizedTime: timeline.recoveryEnd,
        order: 100,
        event: { type: 'attack-ended', attackId },
      },
    ];
    this.schedule = schedule.sort(
      (left, right) =>
        left.normalizedTime - right.normalizedTime || left.order - right.order
    );
    this.attackId = attackId;
    this.duration = durationSeconds;
    this.elapsed = 0;
    this.nextEventIndex = 0;
    return true;
  }

  public update(delta: number): readonly WarriorAttackEvent[] {
    if (!this.attackId || !Number.isFinite(delta) || delta <= 0) return [];
    this.elapsed = Math.min(this.duration, this.elapsed + delta);
    const normalizedTime = this.elapsed / this.duration;
    const emitted: WarriorAttackEvent[] = [];

    while (
      this.nextEventIndex < this.schedule.length &&
      this.schedule[this.nextEventIndex].normalizedTime <= normalizedTime + 1e-9
    ) {
      emitted.push(this.schedule[this.nextEventIndex].event);
      this.nextEventIndex += 1;
    }

    if (emitted.some(({ type }) => type === 'attack-ended')) this.reset();
    return emitted;
  }

  public cancel(): void {
    this.reset();
  }

  private reset(): void {
    this.attackId = null;
    this.duration = 0;
    this.elapsed = 0;
    this.nextEventIndex = 0;
    this.schedule = [];
  }
}
