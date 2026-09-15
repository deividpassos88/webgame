import { describe, expect, it } from 'vitest';
import { DeferredTask, type DeferredTaskScheduler } from './DeferredTask';

class FakeScheduler implements DeferredTaskScheduler {
  private nextId = 1;
  private tasks = new Map<number, () => void>();

  public set(task: () => void): number {
    const id = this.nextId++;
    this.tasks.set(id, task);
    return id;
  }

  public clear(id: unknown): void {
    this.tasks.delete(id as number);
  }

  public runAll(): void {
    const tasks = [...this.tasks.values()];
    this.tasks.clear();
    tasks.forEach((task) => task());
  }

  public get pendingCount(): number {
    return this.tasks.size;
  }
}

describe('DeferredTask', () => {
  it('coalesces repeated requests into one scheduled execution', () => {
    const scheduler = new FakeScheduler();
    let executions = 0;
    const deferred = new DeferredTask(() => executions++, 750, scheduler);

    for (let index = 0; index < 100; index++) deferred.request();

    expect(scheduler.pendingCount).toBe(1);
    scheduler.runAll();
    expect(executions).toBe(1);
  });

  it('flushes pending work immediately without executing it twice', () => {
    const scheduler = new FakeScheduler();
    let executions = 0;
    const deferred = new DeferredTask(() => executions++, 750, scheduler);

    deferred.request();
    deferred.flush();
    scheduler.runAll();

    expect(executions).toBe(1);
    expect(scheduler.pendingCount).toBe(0);
  });
});
