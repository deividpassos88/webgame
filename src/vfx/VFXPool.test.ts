import { describe, expect, it } from 'vitest';
import { VFXPool, type PoolableVFX } from './VFXPool';

class FakeEffect implements PoolableVFX {
  public active = false;
  public resets = 0;
  public reset(): void { this.resets += 1; }
}

describe('VFXPool', () => {
  it('reuses released effects and enforces the configured maximum', () => {
    const pool = new VFXPool(() => new FakeEffect(), 2);
    const first = pool.acquire();
    const second = pool.acquire();
    const third = pool.acquire();

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(third).toBeNull();
    expect(pool.activeCount).toBe(2);

    pool.release(first!);
    expect(first!.active).toBe(false);
    expect(first!.resets).toBe(1);
    expect(pool.inactiveCount).toBe(1);

    const reused = pool.acquire();
    expect(reused).toBe(first);
    expect(reused!.active).toBe(true);
  });
});
