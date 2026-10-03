import { describe, expect, it } from 'vitest';
import {
  COMBO_BENEFITS,
  COMBO_HELP_LABEL,
  COMBO_SUMMARY,
  COMBO_TRADE_OFF,
  comboCanOpen,
  comboToggleState,
} from './ComboBenefits';
import { COMBO_EMPOWER_DAMAGE_MULTIPLIER } from './ComboEmpowerment';

describe('ComboBenefits', () => {
  it('lists every reward of the combo, including the damage multiplier', () => {
    const titles = COMBO_BENEFITS.map((benefit) => benefit.title).join(' | ');

    expect(COMBO_BENEFITS.length).toBeGreaterThanOrEqual(4);
    expect(titles).toContain(`Dano x${COMBO_EMPOWER_DAMAGE_MULTIPLIER}`);
    expect(titles).toContain('mais rápidas');
    expect(titles).toContain('Imunidade');
    expect(COMBO_BENEFITS.every((benefit) => benefit.detail.length > 20)).toBe(true);
  });

  it('quotes the real numbers instead of hand-written copies', () => {
    const immunity = COMBO_BENEFITS.find((benefit) => benefit.title === 'Imunidade durante o combo');

    expect(immunity?.detail).toContain('0.8s');
    expect(immunity?.detail).toContain('0.2s');
  });

  it('states the trade-off of using the combo', () => {
    expect(COMBO_TRADE_OFF).toContain('recarregam');
    expect(COMBO_SUMMARY).toContain('zona verde');
  });

  it('describes both toggle states with a distinct hint', () => {
    const on = comboToggleState(true);
    const off = comboToggleState(false);

    expect(on.label).toBe('Ligado');
    expect(off.label).toBe('Desligado');
    expect(on.hint).not.toBe(off.hint);
  });

  it('offers a help label for the info button', () => {
    expect(COMBO_HELP_LABEL.toLowerCase()).toContain('benefícios');
  });
});

describe('comboCanOpen', () => {
  it('requires the player to have opted in', () => {
    expect(comboCanOpen(false, 3)).toBe(false);
  });

  it('needs at least one skill left to chain', () => {
    expect(comboCanOpen(true, 0)).toBe(false);
    expect(comboCanOpen(true, Number.NaN)).toBe(false);
    expect(comboCanOpen(true, 1)).toBe(true);
  });
});
