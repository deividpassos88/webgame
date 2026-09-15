import { describe, expect, it } from 'vitest';
import { CharacterAssetStore } from '../characters/CharacterAssetStore';
import { Player } from './Player';

describe('Player ADM immortality', () => {
  it('ignores damage only while immortality is enabled', () => {
    const player = new Player('paladin', new CharacterAssetStore());

    player.setImmortal(true);
    player.takeDamage(9999);
    expect(player.hp).toBe(100);
    expect(player.isDead).toBe(false);

    player.setImmortal(false);
    player.takeDamage(10);
    expect(player.hp).toBe(90);
  });
});
