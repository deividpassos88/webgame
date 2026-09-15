import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { readFileSync } from 'node:fs';

const hudSource = readFileSync(new URL('./HUD.ts', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

describe('initial equipment selection markup', () => {
  it('identifies the modal as initial equipment rather than a boss reward', () => {
    expect(indexHtml).toContain('EQUIPAMENTO INICIAL');
    expect(indexHtml).not.toContain('RECOMPENSA DO BOSS');
  });

  it('uses an empty dynamic host without generic icons or ratings', () => {
    expect(indexHtml).toContain('id="reward-options"');
    expect(indexHtml).not.toContain('🗡️');
    expect(indexHtml).not.toContain('🪓');
    expect(indexHtml).not.toContain('★');
  });

  it('renders project-native SVG symbols for weapon attributes', () => {
    expect(hudSource).toContain('class="reward-stat-icon"');
    expect(hudSource.match(/class="reward-stat-icon"/g)).toHaveLength(6);
    expect(styleSource).toContain('stroke: currentColor');
  });
});
