// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { HUD, isPrimaryMouseClick, renderCombatActionMarkup } from './HUD';
import { WARRIOR_SKILLS } from '../combat/WarriorSkillCatalog';
import type { WarriorSkillsSnapshot } from '../combat/WarriorSkillController';

const hudElementIds = [
  'player-health-fill', 'player-health-text', 'player-mana-fill', 'player-mana-text',
  'player-xp-fill', 'player-xp-text', 'player-fatigue-fill', 'player-fatigue-text',
  'boss-health-container', 'boss-health-fill', 'boss-health-label',
  'mini-boss-health-container', 'mini-boss-health-fill',
  'death-screen', 'loading-screen',
  'loading-bar-fill', 'loading-text', 'loading-error', 'reload-btn', 'damage-log',
  'anim-warning-banner', 'anim-warning-text', 'animation-test-panel',
  'animation-test-status', 'animation-test-controls', 'reward-selection',
  'reward-selection-status', 'reward-options', 'reward-continue', 'wave-status',
  'wave-title', 'wave-detail', 'victory-screen', 'play-again-btn', 'combat-actions',
  'craft-reward-notification',
  'debug-log-fab', 'debug-log-panel',
];

function createHud(): HUD {
  document.body.innerHTML = hudElementIds.map((id) => `<div id="${id}"></div>`).join('');
  return new HUD();
}

function readySkillsSnapshot(): WarriorSkillsSnapshot {
  return {
    energy: 50,
    maxEnergy: 50,
    regenerationDelayRemaining: 0,
    skills: Object.fromEntries(WARRIOR_SKILLS.map((skill) => [skill.id, {
      cooldown: skill.cooldown,
      cooldownRemaining: 0,
      energyCost: skill.energyCost,
      available: true,
    }])) as WarriorSkillsSnapshot['skills'],
  };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('basic attack mouse input', () => {
  it('accepts only physical left-button clicks for the basic attack tile', () => {
    expect(isPrimaryMouseClick({ button: 0, detail: 1 })).toBe(true);
    expect(isPrimaryMouseClick({ button: 0, detail: 0 })).toBe(false);
    expect(isPrimaryMouseClick({ button: 1, detail: 1 })).toBe(false);
  });
});

describe('combat action cards', () => {
  it('renders a readable basic attack card and named skill cards with their combat metadata', () => {
    const markup = renderCombatActionMarkup();

    expect(markup).toContain('data-basic-attack');
    expect(markup).toContain('data-cycle-target');
    expect(markup).toContain('Target');
    expect(markup).toContain('Ataque básico');
    expect(markup).toContain('Clique esquerdo');
    expect(markup).toContain('data-warrior-skill');
    expect(markup).toContain('skill-card-name');
    expect(markup).toContain('skill-card-meta');
    expect(markup).toContain('energia');
    expect(markup).toContain('recarga');
  });

  it('removes the debug log controls for a normal player session', () => {
    const hud = createHud();

    hud.setDebugLogEnabled(false);

    expect(document.getElementById('debug-log-fab')).toBeNull();
    expect(document.getElementById('debug-log-panel')).toBeNull();
  });

  it('keeps unlocked card energy and cooldown metadata after a live skill update', () => {
    const hud = createHud();
    hud.updateWarriorSkills(readySkillsSnapshot(), null, 6);

    const meta = document.querySelector('[data-warrior-skill="ataque_giratorio"] .skill-card-meta');
    expect(meta?.textContent).toBe('8 energia · 4.0s recarga');
  });
});
