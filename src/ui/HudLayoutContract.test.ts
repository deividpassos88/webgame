import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

describe('bottom resource HUD layout contract', () => {
  it('centers the three resource bars on desktop without offsetting the mobile layout', () => {
    expect(stylesheet).toContain('left: 50%;\n  transform: translateX(-50%);\n  width: min(390px, calc(100vw - 36px));');
    expect(stylesheet).toContain('#bottom-hud { right: 8px; bottom: 8px; left: 8px; transform: none;');
  });
});
