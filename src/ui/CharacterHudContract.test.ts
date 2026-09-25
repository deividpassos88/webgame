import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const game = readFileSync(new URL('../core/Game.ts', import.meta.url), 'utf8');

describe('character build HUD contract', () => {
  it('uses dedicated equipment, backpack, and status controls instead of a permanent side bag', () => {
    expect(html).toContain('id="player-portrait"');
    expect(html).toContain('id="gameplay-utility-dock"');
    expect(html).toContain('data-open-equipment');
    expect(html).toContain('data-open-backpack');
    expect(html).toContain('data-open-status');
    expect(html).toContain('/assets/ui/backpack-icon.png');
    expect(html).toContain('/assets/ui/status-icon.png');
    expect(html).not.toContain('id="hud-backpack"');
    expect(html).toContain('id="character-overlay"');
    expect(html).toContain('data-character-panel="equipment"');
    expect(html).toContain('data-character-panel="backpack"');
    expect(html).toContain('data-character-panel="status"');
    expect(html).toContain('id="status-attribute-points"');
    expect(html).toContain('id="player-xp-fill"');
    expect(html).toContain('id="player-xp-text"');
    expect(html.indexOf('id="gameplay-utility-dock"')).toBeLessThan(html.indexOf('id="bottom-hud"'));
    // Sem barra de abas compartilhada no topo: Mochila e Status são janelas
    // próprias. O Status usa abas de livro horizontais internas.
    expect(html).not.toContain('data-character-tab=');
    expect(html).toContain('data-status-tab="progress"');
    expect(html).toContain('data-status-tab="attributes"');
    expect(html).toContain('data-status-tab="combat"');
    expect(html).toContain('class="overlay-close"');
  });

  it('uses an automatic final reward chest rather than a click-to-move world-loot interaction', () => {
    expect(game).toContain('FinalBossRewardCoordinator');
    expect(game).toContain('finalBossRewards.start');
    expect(game).not.toContain('spawnWorldLootContainer()');
    expect(game).not.toContain('new WorldLootContainer');
    expect(game).not.toContain('openLoot()');
  });

  it('keeps the craft inspector as an explicitly modal, labelled keyboard dialog', () => {
    expect(html).toMatch(
      /id="craft-item-inspector"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="craft-item-inspector-name"/
    );
    expect(html).toContain('data-close-craft-inspector');
  });
});
