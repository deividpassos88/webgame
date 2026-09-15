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

  it('locks the measured round-two desktop panel, banner and CTA geometry', () => {
    expect(lobbyStyles).toContain('grid-template-columns: 397px minmax(0, 1fr) 446px');
    expect(lobbyStyles).toMatch(/\.lobby-equipment \{[\s\S]*?margin: 30px 10px 12px 46px/);
    expect(lobbyStyles).toMatch(/\.hero-stage-banner \{[\s\S]*?width: 150px;[\s\S]*?height: 434px/);
    expect(lobbyStyles).toMatch(/\.lobby-start-action \.primary-action \{[\s\S]*?min-height: 136px/);
  });
});
