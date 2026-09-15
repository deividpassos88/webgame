import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import indexHtml from '../../index.html?raw';

const stylesheet = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

describe('wave HUD top stack', () => {
  it('keeps the warning, wave status, and boss health in ordered static lanes', () => {
    const stackStart = indexHtml.indexOf('id="top-hud-stack"');
    const warning = indexHtml.indexOf('id="anim-warning-banner"');
    const wave = indexHtml.indexOf('id="wave-status"');
    const boss = indexHtml.indexOf('id="boss-health-container"');

    expect(stackStart).toBeGreaterThan(-1);
    expect(warning).toBeGreaterThan(stackStart);
    expect(wave).toBeGreaterThan(warning);
    expect(boss).toBeGreaterThan(wave);
    expect(stylesheet).toMatch(/#top-hud-stack\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/);
    expect(stylesheet).toMatch(/#wave-status\s*\{[\s\S]*position:\s*static;/);
    expect(stylesheet).toMatch(/#boss-health-container\s*\{[\s\S]*position:\s*static;/);
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*560px\)\s*\{[\s\S]*#top-hud-stack/);
  });
});
