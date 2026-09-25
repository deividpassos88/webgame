import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Game.ts', import.meta.url), 'utf8');

describe('Game portrait contract', () => {
  it('uses the supplied static portraits per class and avoids an extra render target', () => {
    expect(source).toContain("'/assets/ui/portrait/maga-portrait.webp'");
    expect(source).toContain("'/assets/ui/portrait/warrior-portrait.png'");
    expect(source).toContain('this.hud.setPlayerClass(characterId)');
    expect(source).not.toContain('capturePlayerPortrait');
    expect(source).not.toContain('new THREE.WebGLRenderTarget');
  });
});
