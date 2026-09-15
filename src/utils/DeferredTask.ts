export interface DeferredTaskScheduler {
  set(task: () => void, delayMs: number): unknown;
  clear(id: unknown): void;
}

const browserScheduler: DeferredTaskScheduler = {
  set: (task, delayMs) => globalThis.setTimeout(task, delayMs),
  clear: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

export class DeferredTask {
  private pendingId: unknown = null;

  public constructor(
    private readonly task: () => void,
    private readonly delayMs: number,
    private readonly scheduler: DeferredTaskScheduler = browserScheduler
  ) {}

  public request(): void {
    if (this.pendingId !== null) return;
    this.pendingId = this.scheduler.set(() => {
      this.pendingId = null;
      this.task();
    }, this.delayMs);
  }

  public flush(): void {
    if (this.pendingId === null) return;
    this.scheduler.clear(this.pendingId);
    this.pendingId = null;
    this.task();
  }

  public cancel(): void {
    if (this.pendingId === null) return;
    this.scheduler.clear(this.pendingId);
    this.pendingId = null;
  }
}
