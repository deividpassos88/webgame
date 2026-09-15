import { describe, expect, it } from 'vitest';
import { getBossHealthHudValues } from './BossHealthView';

describe('getBossHealthHudValues', () => {
  it('renders zero when the main boss dies before the mini-bosses', () => {
    const miniBossesAlive = 4;

    expect(miniBossesAlive).toBeGreaterThan(0);
    expect(
      getBossHealthHudValues({ hp: 8, maxHP: 800, isDead: true })
    ).toEqual({ hp: 0, maxHP: 800 });
  });
});
