import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';

describe('provided craft artwork', () => {
  it('is copied into public craft paths used by the catalog', () => {
    for (const number of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(existsSync(new URL(`../../public/items/craft/common/${number}.webp`, import.meta.url))).toBe(true);
    }
    for (const number of [1, 2, 3, 4, 5]) {
      expect(existsSync(new URL(`../../public/items/craft/rare/${number}.png`, import.meta.url))).toBe(true);
    }
    expect(existsSync(new URL('../../public/items/craft/token-guild.png', import.meta.url))).toBe(true);
  });
});
