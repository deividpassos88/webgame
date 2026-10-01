// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { SkillComboController } from '../combat/SkillComboController';
import { WARRIOR_SKILLS, type WarriorSkillId } from '../combat/WarriorSkillCatalog';
import { ComboGauge } from './ComboGauge';

const context = {
  unlocked: new Set<WarriorSkillId>(['ataque_giratorio', 'ataque_giratorio_2']),
};

describe('ComboGauge', () => {
  it('stays hidden until a combo gauge opens, then shows the green zone and cursor', () => {
    const host = document.createElement('div');
    const gauge = new ComboGauge(host);
    const combo = new SkillComboController(() => 0.5);

    gauge.render(combo.snapshot(), context, 1);
    expect(gauge.element.classList.contains('is-visible')).toBe(false);

    combo.registerCast('ataque_giratorio', 1);
    combo.update(0.85);
    gauge.render(combo.snapshot(), context, 1.1);

    expect(gauge.element.classList.contains('is-visible')).toBe(true);
    expect(gauge.element.dataset.phase).toBe('gauge');
    const zone = gauge.element.querySelector<HTMLElement>('[data-combo-zone]')!;
    const cursor = gauge.element.querySelector<HTMLElement>('[data-combo-cursor]')!;
    expect(parseFloat(zone.style.width)).toBeCloseTo(20, 1);
    expect(parseFloat(cursor.style.left)).toBeCloseTo(50, 1);
    expect(gauge.element.querySelectorAll('.combo-gauge__pip')).toHaveLength(WARRIOR_SKILLS.length);
  });

  it('shows the chain, a result flash and then hides again', () => {
    const gauge = new ComboGauge(document.createElement('div'));
    const combo = new SkillComboController(() => 0.5);
    combo.registerCast('ataque_giratorio', 1);
    const { greenStart, greenEnd } = combo.snapshot();
    combo.update(1.7 * ((greenStart + greenEnd) / 2));
    combo.click();

    gauge.render(combo.snapshot(), context, 2);
    const result = gauge.element.querySelector<HTMLElement>('[data-combo-result]')!;
    expect(result.textContent).toBe('ÓTIMO!');
    expect(gauge.element.querySelector('[data-skill="ataque_giratorio"]')!.getAttribute('data-state')).toBe('used');
    expect(gauge.element.querySelector('[data-skill="ataque_giratorio_2"]')!.getAttribute('data-state')).toBe('open');
    expect(gauge.element.querySelector('[data-skill="corte_duplo"]')!.getAttribute('data-state')).toBe('locked');
    expect(gauge.element.querySelector('[data-combo-count]')!.textContent).toBe('x1');

    combo.update(3);
    gauge.render(combo.snapshot(), context, 5);
    gauge.render(combo.snapshot(), context, 6);
    expect(gauge.element.classList.contains('is-visible')).toBe(false);
  });
});
