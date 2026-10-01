import { describe, expect, it } from 'vitest';
import {
  COMBO_GREEN_WIDTHS,
  COMBO_END_MARGIN_SECONDS,
  COMBO_LINK_WINDOW_SECONDS,
  COMBO_MIN_GREEN_SECONDS,
  comboGaugeTiming,
  SkillComboController,
  comboGreenWidth,
} from './SkillComboController';

function controller(random = 0.5): SkillComboController {
  return new SkillComboController(() => random);
}

function sweepTo(combo: SkillComboController, fraction: number): void {
  const snapshot = combo.snapshot();
  expect(snapshot.phase).toBe('gauge');
  // Re-open timing is measured through update(); the sweep is linear.
  const total = 1.7;
  combo.update(total * fraction);
}

describe('SkillComboController', () => {
  it('does not open a gauge when no other skill can follow', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 0);
    expect(combo.snapshot().phase).toBe('idle');
    expect(combo.gaugeActive).toBe(false);
  });

  it('opens a red/green gauge after a skill when another one can follow', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 1);
    const snapshot = combo.snapshot();
    expect(snapshot.phase).toBe('gauge');
    expect(snapshot.greenEnd - snapshot.greenStart).toBeCloseTo(COMBO_GREEN_WIDTHS[0], 5);
    expect(snapshot.greenStart).toBeGreaterThan(0.2);
    expect(snapshot.greenEnd).toBeLessThan(1);
  });

  it('keeps the green zone inside the bar for any random roll', () => {
    for (const roll of [0, 0.999999]) {
      const combo = controller(roll);
      combo.registerCast('ataque_giratorio', 1);
      const { greenStart, greenEnd } = combo.snapshot();
      expect(greenStart).toBeGreaterThanOrEqual(0.25);
      expect(greenEnd).toBeLessThanOrEqual(1);
    }
  });

  it('links the combo when the click lands on green, and doubles that skill cooldown', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 1);
    const { greenStart, greenEnd } = combo.snapshot();
    sweepTo(combo, (greenStart + greenEnd) / 2);

    expect(combo.click()).toBe('hit');
    expect(combo.snapshot().phase).toBe('linked');
    expect(combo.snapshot().hits).toBe(1);
    expect(combo.consumeCooldownDoubles()).toEqual(['ataque_giratorio']);
    expect(combo.consumeCooldownDoubles()).toEqual([]);
  });

  it('ends the combo on a click over the red zone', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 1);
    sweepTo(combo, 0.05);

    expect(combo.click()).toBe('miss');
    expect(combo.snapshot().phase).toBe('idle');
    expect(combo.snapshot().lastResult).toBe('miss');
    expect(combo.consumeCooldownDoubles()).toEqual([]);
  });

  it('ends the combo when the cursor reaches the end of the bar', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 1);
    combo.update(2);
    expect(combo.snapshot().phase).toBe('idle');
    expect(combo.snapshot().lastResult).toBe('timeout');
    expect(combo.click()).toBe('none');
  });

  it('lets any other skill follow a hit, in any order, and doubles its cooldown too', () => {
    const combo = controller();
    combo.registerCast('triplo_ataque', 1);
    const { greenStart, greenEnd } = combo.snapshot();
    sweepTo(combo, (greenStart + greenEnd) / 2);
    combo.click();
    combo.consumeCooldownDoubles();

    expect(combo.canChain('triplo_ataque')).toBe(false);
    expect(combo.canChain('corte_duplo')).toBe(true);

    combo.registerCast('corte_duplo', 0);
    expect(combo.consumeCooldownDoubles()).toEqual(['corte_duplo']);
    expect(combo.snapshot().phase).toBe('idle');
    expect(combo.snapshot().chain).toEqual(['triplo_ataque', 'corte_duplo']);
  });

  it('makes the green zone smaller on each successive link', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 2);
    let { greenStart, greenEnd } = combo.snapshot();
    const first = greenEnd - greenStart;
    sweepTo(combo, (greenStart + greenEnd) / 2);
    combo.click();

    combo.registerCast('ataque_giratorio_2', 1);
    ({ greenStart, greenEnd } = combo.snapshot());
    const second = greenEnd - greenStart;
    expect(second).toBeLessThan(first);
    expect(comboGreenWidth(2)).toBeLessThan(comboGreenWidth(1));
    expect(comboGreenWidth(99)).toBe(COMBO_GREEN_WIDTHS[COMBO_GREEN_WIDTHS.length - 1]);
  });

  it('starts a fresh combo when a skill is cast without a link', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 1);
    sweepTo(combo, 0.05);
    combo.click();
    combo.registerCast('pulo_atacando', 1);

    expect(combo.snapshot().chain).toEqual(['pulo_atacando']);
    expect(combo.snapshot().hits).toBe(0);
    expect(combo.consumeCooldownDoubles()).toEqual([]);
  });

  it('closes the link window when the next skill takes too long', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 1);
    const { greenStart, greenEnd } = combo.snapshot();
    sweepTo(combo, (greenStart + greenEnd) / 2);
    combo.click();

    combo.update(COMBO_LINK_WINDOW_SECONDS - 0.1);
    expect(combo.canChain('ataque_giratorio_2')).toBe(true);
    combo.update(0.2);
    expect(combo.canChain('ataque_giratorio_2')).toBe(false);
  });

  it('reset clears everything', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 1);
    combo.reset();
    expect(combo.active).toBe(false);
    expect(combo.snapshot().chain).toEqual([]);
  });

  it('resolves the gauge before the skill animation ends', () => {
    const combo = controller();
    combo.registerCast('triplo_ataque', 1, { durationSeconds: 1.8, lastHitSeconds: 1.2 });
    combo.update(1.8 - COMBO_END_MARGIN_SECONDS - 0.01);
    expect(combo.snapshot().phase).toBe('gauge');
    combo.update(0.02);
    expect(combo.snapshot().phase).toBe('idle');
    expect(combo.snapshot().lastResult).toBe('timeout');
  });

  it('keeps the green zone after the skill last damage', () => {
    for (const roll of [0, 0.5, 0.999]) {
      const combo = controller(roll);
      combo.registerCast('triplo_ataque', 1, { durationSeconds: 1.8, lastHitSeconds: 1.2 });
      const timing = comboGaugeTiming(0, { durationSeconds: 1.8, lastHitSeconds: 1.2 });
      const { greenStart, greenEnd } = combo.snapshot();
      expect(greenStart * timing.sweepSeconds).toBeGreaterThanOrEqual(1.2 - 1e-6);
      expect(greenEnd).toBeLessThanOrEqual(1);
    }
  });

  it('never makes the green zone shorter than a clickable time', () => {
    for (let hits = 0; hits < 6; hits += 1) {
      const timing = comboGaugeTiming(hits, { durationSeconds: 2, lastHitSeconds: 1 });
      expect(timing.greenWidth * timing.sweepSeconds).toBeGreaterThanOrEqual(COMBO_MIN_GREEN_SECONDS - 1e-9);
    }
  });
});
