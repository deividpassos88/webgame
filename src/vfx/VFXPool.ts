export interface PoolableVFX {
  active: boolean;
  reset(): void;
  dispose?(): void;
}

export class VFXPool<T extends PoolableVFX> {
  private readonly inactive: T[] = [];
  private readonly allocated: T[] = [];

  public constructor(
    private readonly create: () => T,
    private readonly maxSize: number
  ) {}

  public acquire(): T | null {
    const item = this.inactive.pop() ?? this.allocate();
    if (!item) return null;
    item.active = true;
    return item;
  }

  public release(item: T): void {
    if (!item.active && this.inactive.includes(item)) return;
    item.reset();
    item.active = false;
    if (!this.inactive.includes(item)) this.inactive.push(item);
  }

  public clearActive(): void {
    for (const item of this.allocated) {
      if (item.active) this.release(item);
    }
  }

  public dispose(): void {
    for (const item of this.allocated) item.dispose?.();
    this.inactive.length = 0;
    this.allocated.length = 0;
  }

  public get inactiveCount(): number {
    return this.inactive.length;
  }

  public get activeCount(): number {
    return this.allocated.length - this.inactive.length;
  }

  private allocate(): T | null {
    if (this.allocated.length >= this.maxSize) return null;
    const item = this.create();
    item.active = false;
    this.allocated.push(item);
    return item;
  }
}
