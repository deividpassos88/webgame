import { describe, expect, it } from 'vitest';
import { HIT_COUNTER_TIMEOUT_SECONDS, HitCounter } from './HitCounter';

describe('HitCounter', () => {
  it('counts every hit and renews the timer', () => {
    const counter = new HitCounter();
    counter.registerHit();
    counter.update(2);
    counter.registerHit();

    const snapshot = counter.snapshot();
    expect(snapshot.count).toBe(2);
    expect(snapshot.remaining).toBe(HIT_COUNTER_TIMEOUT_SECONDS);
    expect(snapshot.serial).toBe(2);
  });

  it('resets after a pause without hits', () => {
    const counter = new HitCounter();
    counter.registerHit();
    counter.update(HIT_COUNTER_TIMEOUT_SECONDS - 0.1);
    expect(counter.snapshot().count).toBe(1);
    counter.update(0.2);
    expect(counter.snapshot().count).toBe(0);
  });

  it('reset clears the streak', () => {
    const counter = new HitCounter();
    counter.registerHit();
    counter.reset();
    expect(counter.snapshot().count).toBe(0);
  });
});
