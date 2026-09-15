import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Game.ts', import.meta.url), 'utf8');

describe('Game portrait contract', () => {
  it('uses the supplied static portrait and avoids an extra render target', () => {
    expect(source).toContain("this.hud.setPlayerPortrait('/assets/ui/portrait/warrior-portrait.png')");
    expect(source).not.toContain('capturePlayerPortrait');
    expect(source).not.toContain('new THREE.WebGLRenderTarget');
  });
});
