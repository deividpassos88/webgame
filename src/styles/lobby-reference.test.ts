import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const lobbyStyles = readFileSync(new URL('./lobby-reference.css', import.meta.url), 'utf8');

describe('arena lobby composition', () => {
  it('lays the desktop shell out as a fixed three-column grid', () => {
    // Panel widths are variables so breakpoints can retune the whole shell.
    expect(lobbyStyles).toContain('--panel-left: 420px');
    expect(lobbyStyles).toContain('--panel-right: 404px');
    expect(lobbyStyles).toContain(
      'grid-template-columns: var(--panel-left) minmax(0, 1fr) var(--panel-right)'
    );
    expect(lobbyStyles).toMatch(/grid-template-areas:\s*\n?\s*'top\s+top\s+top'/);
    // The shell scales down to tablets instead of forcing a sideways scroll.
    // (matched as a declaration, so the note explaining its removal is fine)
    expect(lobbyStyles).not.toMatch(/^\s*min-width: 1180px;/m);
    for (const breakpoint of ['1439px', '1279px', '1100px', '900px']) {
      expect(lobbyStyles).toMatch(
        new RegExp(`@media \\(max-width: ${breakpoint}\\) \\{[\\s\\S]*?--panel-left:`)
      );
    }
    // Short landscape tablets get slimmer top and footer bands.
    expect(lobbyStyles).toMatch(
      /@media \(max-height: 800px\) \{[\s\S]*?grid-template-rows:/
    );
  });

  it('keeps the lobby topbar clickable above the WebGL canvas', () => {
    // #lobby-screen runs with pointer-events:none so the hall and the Warrior
    // stay clickable through to the canvas; the panels re-enable the events.
    // The topbar owns the nav (HEROI / INVENTARIO / SKILLS / OFICINA): without
    // its own pointer-events:auto every tab silently ignored the mouse.
    expect(lobbyStyles).toMatch(
      /#lobby-screen \.arena-topbar \{[^}]*pointer-events: auto;/
    );
  });

  it('captions every status metric with its combat effect', () => {
    // The caption is the second line of the cell, so it needs the full width.
    expect(lobbyStyles).toMatch(
      /#lobby-screen \.lobby-current-status-hint \{[^}]*flex-basis: 100%;/
    );
  });

  it('keeps the stage transparent so the WebGL Warrior shows through', () => {
    expect(lobbyStyles).toMatch(/\.arena-stage \{[\s\S]*?background: transparent;/);
    // A grab cursor is the only rotation affordance; no auto-spin is declared.
    expect(lobbyStyles).toMatch(/\.arena-stage \{[\s\S]*?cursor: grab;/);
    expect(lobbyStyles).not.toContain('animation: arena-stage-spin');
  });

  it('builds equipment sockets from the generated frame at one tunable size', () => {
    expect(lobbyStyles).toContain("--frame-slot: url('/assets/ui/lobby/arena/slot-frame-v2.webp')");
    // Sockets are fluid squares capped by viewport height, so a full set of
    // frames is visible without scrolling the rail.
    // Plates fill their column, capped only so four rows fit the panel height.
    expect(lobbyStyles).toMatch(/--equip-row: min\(100%, \(100% - 30px\) \/ 4\)/);
    expect(lobbyStyles).toMatch(/\.arena-equip-grid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    // Seven sockets: three pairs plus a lone centred one on the last row.
    expect(lobbyStyles).toMatch(/\.equipment-slot:last-child:nth-child\(odd\) \{[\s\S]*?grid-column: 1 \/ -1/);
    // Equipped art is contained, so any piece fits the socket at any size.
    expect(lobbyStyles).toMatch(/\.arena-equip-grid .equipment-slot__art img,[\s\S]*?object-fit: contain/);
  });

  it('styles equipment sockets like bag slots and lights them by rarity', () => {
    // The gothic plate is gone: sockets share the bag slot's flat panel.
    expect(lobbyStyles).not.toMatch(
      /\.arena-equip-grid \.equipment-slot[^{]*\{[^}]*background: var\(--frame-slot\)/
    );
    expect(lobbyStyles).toMatch(/aspect-ratio: 1 \/ 1/);

    // Equipped pieces carry a rarity-tinted light that travels the border.
    expect(lobbyStyles).toMatch(
      /\.equipment-slot\.is-equipped \{[\s\S]*?--rarity-glow: #ffffff/
    );
    expect(lobbyStyles).toMatch(
      /\.equipment-slot\.is-equipped\[data-rarity='rare'\] \{[\s\S]*?--rarity-glow: #7cc0ff/
    );
    expect(lobbyStyles).toMatch(
      /\[data-rarity='epic'\][\s\S]*?--rarity-glow: #ff9b2e/
    );
    // The sweep is masked to the border so it never washes over the item.
    // The wedge fades in at 215deg, giving a long streak, but keeps a short
    // hot head so the motion still reads.
    expect(lobbyStyles).toMatch(
      /\.equipment-slot\.is-equipped::after \{[\s\S]*?transparent 215deg[\s\S]*?animation: arena-rarity-sweep/
    );
    // The socket caption is gone: picture only, name in the aria-label.
    expect(lobbyStyles).not.toContain('.equipment-slot__label');
    // An empty socket shows the gray placeholder, smaller than the item art
    // that replaces it once a piece is equipped.
    expect(lobbyStyles).toMatch(
      /#lobby-screen \.arena-equip-grid \.equipment-slot__icon,[\s\S]*?width: 56% !important;/
    );
  });

  it('lets the equipment rail fill its column so no dead space remains', () => {
    // Earlier the panel hugged its content, which left an empty band beneath
    // the sockets. It now stretches and the grid spreads across it.
    expect(lobbyStyles).toMatch(/\.arena-panel--left \{[\s\S]*?align-self: stretch/);
    // Rows start at the top: centring them let the last one clip at the foot.
    expect(lobbyStyles).toMatch(/\.arena-equip-grid \{[\s\S]*?align-content: start/);
    expect(lobbyStyles).toMatch(/\.arena-equip-grid \{[\s\S]*?height: 100%/);
    // Sized to fit, so the rail must never show a scrollbar.
    expect(lobbyStyles).toMatch(/#lobby-equipment-panel \{[\s\S]*?overflow: hidden/);
  });

  it('aligns the backpack as an exact square grid', () => {
    expect(lobbyStyles).toMatch(/\.arena-bag-grid \{[\s\S]*?grid-template-columns: repeat\(var\(--bag-cols\), minmax\(0, 1fr\)\)/);
    expect(lobbyStyles).toMatch(/\.arena-bag-grid .inventory-slot \{[\s\S]*?aspect-ratio: 1 \/ 1/);
  });

  it('animates the primary call to action and honours reduced motion', () => {
    expect(lobbyStyles).toContain('@keyframes arena-cta-pulse');
    expect(lobbyStyles).toMatch(/\.arena-cta__btn \{\s*animation: arena-cta-pulse/);
    expect(lobbyStyles).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*?animation: none/);
  });

  it('uses the black, gold and ruby palette tokens everywhere', () => {
    expect(lobbyStyles).toContain('--gold: #d4a94f');
    expect(lobbyStyles).toContain('--ruby: #b3122e');
    expect(lobbyStyles).toContain('--ink: #06080b');
  });

  it('floats the call to action under the hero instead of in the footer', () => {
    // Anchored near the boots (the camera puts them at ~88% of the stage)
    // and centred on the stage column between the two side panels.
    expect(lobbyStyles).toMatch(
      /\.arena-cta \{[\s\S]*?position: fixed;[\s\S]*?bottom: 12\.4vh/
    );
    // Centred on the stage column between the panels, so it tracks the hero.
    expect(lobbyStyles).toMatch(
      /\.arena-cta \{[\s\S]*?left: var\(--panel-left\);[\s\S]*?width: calc\(100% - var\(--panel-left\) - var\(--panel-right\)\)/
    );
    // The overlay must not swallow drags meant for the 3D stage.
    expect(lobbyStyles).toMatch(/\.arena-cta \{[\s\S]*?pointer-events: none/);
    expect(lobbyStyles).toMatch(/\.arena-cta__btn \{ pointer-events: auto/);
  });

  it('lets item tiles fill the bag slot edge to edge', () => {
    // The art files are finished square tiles with their own border, so the
    // slot must not inset them; it clips instead of padding.
    expect(lobbyStyles).toMatch(
      /\.arena-bag-grid \.inventory-slot \{[\s\S]*?overflow: hidden;[\s\S]*?padding: 0;/
    );
    expect(lobbyStyles).toMatch(
      /\.arena-bag-grid \.inventory-item-art \{[\s\S]*?width: 100%;[\s\S]*?height: 100%;[\s\S]*?object-fit: cover/
    );
  });

  it('keeps the viewport tooltip out of the shell grid', () => {
    // The stacking helper runs on id specificity, so it also matched the
    // tooltip that LobbyScreen appends inside the shell and overrode its
    // `position: fixed`. As a grid item the card auto-placed in an implicit
    // 4th row: the 1fr stage row was squeezed (601px -> 453px at 1386x761),
    // the card was painted below the pointer, and the shell kept ~300px of
    // script-scrollable overflow that scrolled the whole lobby up.
    expect(lobbyStyles).toContain(
      '#lobby-screen > *:not(.arena-vignette):not(.item-tooltip) { position: relative; z-index: 2; }'
    );
    expect(lobbyStyles).not.toMatch(/#lobby-screen > \*:not\(\.arena-vignette\) \{/);
    // And the card itself stays viewport-anchored in the shared stylesheet.
    const sharedStyles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(sharedStyles).toMatch(/\.item-tooltip \{\s*position: fixed;/);
  });
});