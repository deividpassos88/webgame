import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

function firstMobileWaveRule(css: string): string {
  const start = css.indexOf('@media (max-width: 560px)', css.indexOf('/* ---------- Wave progression ---------- */'));
  const end = css.indexOf('/* ---------- Aviso de animações faltando ---------- */', start);
  return css.slice(start, end);
}

function finalMobileRule(css: string): string {
  return css.slice(css.lastIndexOf('@media (max-width: 560px)'));
}

describe('narrow-screen HUD layout', () => {
  it('places the wave status below the animation controls at 390px wide', () => {
    const rule = firstMobileWaveRule(styles);
    const top = rule.match(/#top-hud-stack\s*\{[^}]*top:\s*(\d+)px;/)?.[1];

    // The mobile animation panel ends at 243px (top 10px + 233px); leave a 10px gap.
    expect(Number(top)).toBeGreaterThanOrEqual(253);
  });

  it('keeps the death title within the narrow overlay', () => {
    const rule = finalMobileRule(styles);

    expect(rule).toMatch(/#death-screen h1\s*\{[^}]*font-size:\s*clamp\(34px,\s*10vw,\s*42px\);[^}]*letter-spacing:\s*2px;[^}]*text-align:\s*center;/);
  });
});

describe('armory selector visual contract', () => {
  it('uses the approved palette, responsive stack, focus and reduced motion', () => {
    expect(styles).toContain('--armory-obsidian: #070a0d');
    expect(styles).toContain('--armory-steel: #151b22');
    expect(styles).toContain('--armory-brass: #c7923e');
    expect(styles).toContain('--armory-plasma: #69d7e8');
    expect(styles).toContain('@media (max-width: 680px)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('.reward-weapon-card:focus-visible');
  });
});

describe('ADM panel visual contract', () => {
  it('uses a compact centered industrial panel with keyboard focus and reduced motion', () => {
    expect(styles).toMatch(/#admin-panel\s*\{[^}]*top:\s*50%;[^}]*left:\s*50%;/s);
    expect(styles).toContain('#admin-panel.is-collapsed .admin-panel-body');
    expect(styles).toContain('.admin-control:focus-visible');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

describe('character build interface visual contract', () => {
  it('lays equipment out as a silhouette, uses compact utility launchers, and supports reduced motion', () => {
    expect(styles).toContain('/* ---------- Character build interface v2 ---------- */');
    expect(styles).toMatch(/\.equipment-silhouette\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(styles).toContain('.equipment-silhouette .equipment-slot:last-child');
    expect(styles).toContain('.hud-utility-actions');
    expect(styles).toContain('.hud-utility-button');
    expect(styles).toContain('.player-progression');
    expect(styles).toContain('.status-gate-message');
    expect(styles).toContain('@media (max-width: 760px)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

describe('compact battlefield HUD visual contract', () => {
  it('uses a left utility dock, glass popup, percent vitals, focus, and reduced motion', () => {
    expect(styles).toContain('/* ---------- Compact battlefield HUD v3 ---------- */');
    expect(styles).toContain('#gameplay-utility-dock');
    expect(styles).toContain('#character-overlay');
    expect(styles).toContain('.xp-bar-bg');
    expect(styles).toContain('.resource-bar');
    expect(styles).toMatch(/#gameplay-utility-dock \.player-portrait\s*\{[^}]*background:\s*[\s\S]*var\(--portrait-image\)/);
    expect(styles).toContain('#gameplay-utility-dock .hud-utility-button:focus-visible');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

describe('final boss craft reward visual contract', () => {
  it('uses the Cinzafogo palette, a framed item inspector, responsive layout and reduced-motion restraint', () => {
    expect(styles).toContain('--craft-obsidian: #080A0B');
    expect(styles).toContain('--craft-slate: #171B1F');
    expect(styles).toContain('--craft-gold: #C89536');
    expect(styles).toContain('--craft-teal: #18A89A');
    expect(styles).toContain('--craft-bone: #C9B89B');
    expect(styles).toContain('--craft-red: #9E3046');
    expect(styles).toContain('.craft-item-inspector');
    expect(styles).toContain('.craft-inspector-frame');
    expect(styles).toContain('.craft-reward-notification');
    expect(styles).toMatch(/\.craft-item-inspector\s*\{[^}]*animation:\s*craft-inspector-arrive\s+180ms/s);
    expect(styles).toMatch(/\.craft-reward-notification\s*\{[^}]*animation:\s*craft-notice-arrive\s+220ms/s);
    expect(styles).toContain('@media (max-width: 560px)');
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.craft-inspector-glint,[^}]*\.craft-item-inspector,[^}]*\.craft-reward-notification\s*\{\s*animation:\s*none;/s);
  });
});

describe('administrator debug-log placement', () => {
  it('keeps the administrator log above the gameplay skill cards', () => {
    expect(styles).toMatch(/#debug-log-fab\s*\{[^}]*bottom:\s*252px;/s);
    expect(styles).toMatch(/#debug-log-panel\s*\{[^}]*bottom:\s*304px;/s);
  });
});

describe('floating combat numbers', () => {
  it('styles the damage taken apart from the damage dealt and the heals', () => {
    // The number that reaches the health bar is printed over the player, so the
    // Defense reduction is readable during the fight.
    expect(styles).toMatch(/\.floating-damage\.taken\s*\{[^}]*color:\s*#ffa14a;/s);
    expect(styles).toMatch(/\.floating-damage\.heal\s*\{[^}]*color:\s*#4ade80;/s);
  });
});
