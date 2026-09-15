import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const lobbyStyles = readFileSync(new URL('./lobby-reference.css', import.meta.url), 'utf8');

describe('lobby reference composition', () => {
  it('keeps equipment in compact square engraved slots instead of portrait cards', () => {
    expect(lobbyStyles).toContain('--reference-slot-frame: url(\'/assets/ui/lobby/reference-match/equipment-slot-frame.svg\')');
    expect(lobbyStyles).toMatch(/\.lobby-equipment \.equipment-slot \{[\s\S]*?aspect-ratio: 1;/);
    expect(lobbyStyles).toMatch(/\.equipment-slot:last-child \{[\s\S]*?grid-column: 1 \/ -1;/);
    expect(lobbyStyles).not.toContain('--lobby-equipment-card');
    expect(lobbyStyles).not.toContain('/assets/ui/lobby/helmet.webp');
  });

  it('uses the supplied large beveled start plaque as the stage and footer bridge', () => {
    expect(lobbyStyles).toContain("background-image: url('/assets/ui/lobby/reference-match/start-game-frame.svg')");
    expect(lobbyStyles).toMatch(/\.lobby-start-action \.primary-action \{[\s\S]*?min-height: 9\dpx/);
    expect(lobbyStyles).not.toContain('animation: lobby-start-border-orbit');
  });

  it('locks the exact-reference desktop grid measured against lobby.png', () => {
    // The approved desktop composition is proportional, not fixed-pixel, so the
    // three columns track the reference artwork at any desktop width.
    expect(lobbyStyles).toContain('grid-template-columns: 23.026% 50% 26.974%');
    expect(lobbyStyles).toContain('grid-template-rows: 8.82% 80.23% 10.95%');
    // The CTA is the baked plaque positioned over the stage bottom.
    expect(lobbyStyles).toMatch(/\.lobby-start-action \{[\s\S]*?top: 83\.53% !important/);
    expect(lobbyStyles).toContain("url('/assets/ui/lobby/user-pack/start-button.png')");
  });

  it('dresses the header gear and the CTA swords mark added in the reference review', () => {
    expect(lobbyStyles).toMatch(/\.lobby-settings-mark \{[\s\S]*?object-fit: contain/);
    expect(lobbyStyles).toMatch(/\.lobby-start-icon \{[\s\S]*?object-fit: contain/);
    // The desktop plaque already contains swords, so the DOM mark is hidden there.
    expect(lobbyStyles).toMatch(/#start-game \.lobby-start-icon \{\s*display: none !important;/);
  });
});
