import { describe, expect, it } from 'vitest';
import {
  COMBO_GREEN_WIDTHS,
  COMBO_SWEEP_SECONDS,
  COMBO_END_MARGIN_SECONDS,
  COMBO_FALLBACK_PASSES,
  COMBO_LINK_WINDOW_SECONDS,
  COMBO_MIN_GREEN_SECONDS,
  comboCursorPosition,
  comboCursorDirection,
  comboGaugeTiming,
  comboSweepSeconds,
  SkillComboController,
  comboGreenWidth,
} from './SkillComboController';
import {
  COMBO_EMPOWER_DAMAGE_MULTIPLIER,
  COMBO_EMPOWER_PLAYBACK_MULTIPLIER,
} from './ComboEmpowerment';

function controller(random = 0.5): SkillComboController {
  return new SkillComboController(() => random);
}

/** Avança o cursor (ida) até a posição pedida: 0 = esquerda, 1 = direita. */
function sweepTo(combo: SkillComboController, cursorTarget: number): void {
  const snapshot = combo.snapshot();
  expect(snapshot.phase).toBe('gauge');
  combo.update(cursorTarget * snapshot.sweepSeconds);
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

  it('is much faster and tighter than the old single sweep', () => {
    // Uma passada do cursor cabia em 1.7 s; agora a ida inteira é bem mais curta.
    expect(COMBO_SWEEP_SECONDS[0]).toBeLessThan(0.6);
    expect(COMBO_SWEEP_SECONDS.every((seconds) => seconds < 1)).toBe(true);
    // E a zona verde encolheu em cada link (era 0.20/0.15/0.11/0.08).
    expect(COMBO_GREEN_WIDTHS[0]).toBeLessThan(0.2);
    for (let hits = 1; hits < COMBO_GREEN_WIDTHS.length; hits += 1) {
      expect(comboGreenWidth(hits)).toBeLessThan(comboGreenWidth(hits - 1));
    }
  });

  it('sends the cursor back and forth inside the bar (ida e volta)', () => {
    expect(comboCursorPosition(0, 0.5)).toBeCloseTo(0, 5);
    expect(comboCursorPosition(0.25, 0.5)).toBeCloseTo(0.5, 5);
    expect(comboCursorPosition(0.5, 0.5)).toBeCloseTo(1, 5);
    // Volta: 0.75 s = metade do retorno.
    expect(comboCursorPosition(0.75, 0.5)).toBeCloseTo(0.5, 5);
    expect(comboCursorPosition(1, 0.5)).toBeCloseTo(0, 5);
    expect(comboCursorPosition(1.25, 0.5)).toBeCloseTo(0.5, 5);

    expect(comboCursorDirection(0.1, 0.5)).toBe(1);
    expect(comboCursorDirection(0.6, 0.5)).toBe(-1);
    expect(comboCursorDirection(1.1, 0.5)).toBe(1);
  });

  it('reports the travelling direction in the snapshot', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 1);
    const { sweepSeconds } = combo.snapshot();
    expect(combo.snapshot().cursorDirection).toBe(1);
    combo.update(sweepSeconds * 1.25);
    const returning = combo.snapshot();
    expect(returning.cursorDirection).toBe(-1);
    expect(returning.cursor).toBeCloseTo(0.75, 5);
  });

  it('keeps the gauge open for more than one pass, then times out', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 1);
    const { sweepSeconds, windowSeconds } = combo.snapshot();
    expect(windowSeconds).toBeCloseTo(sweepSeconds * COMBO_FALLBACK_PASSES, 5);

    combo.update(sweepSeconds * 1.5);
    expect(combo.snapshot().phase).toBe('gauge');
    combo.update(windowSeconds);
    expect(combo.snapshot().phase).toBe('idle');
    expect(combo.snapshot().lastResult).toBe('timeout');
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

  it('also links when the green is caught on the way back', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 1);
    const { greenStart, greenEnd, sweepSeconds } = combo.snapshot();
    const target = (greenStart + greenEnd) / 2;
    // Passa direto na ida e pega o verde na volta.
    combo.update(sweepSeconds * (2 - target));

    expect(combo.snapshot().cursorDirection).toBe(-1);
    expect(combo.click()).toBe('hit');
  });

  it('empowers the combo from the first green hit: faster skills and double damage', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 1);
    expect(combo.empowered).toBe(false);
    expect(combo.damageMultiplier).toBe(1);
    expect(combo.playbackMultiplier).toBe(1);

    const { greenStart, greenEnd } = combo.snapshot();
    sweepTo(combo, (greenStart + greenEnd) / 2);
    combo.click();

    expect(combo.empowered).toBe(true);
    expect(combo.damageMultiplier).toBe(COMBO_EMPOWER_DAMAGE_MULTIPLIER);
    expect(combo.playbackMultiplier).toBe(COMBO_EMPOWER_PLAYBACK_MULTIPLIER);
    expect(combo.snapshot().empowered).toBe(true);

    // Segue empoderado enquanto a próxima skill do combo varre a gauge.
    combo.registerCast('ataque_giratorio_2', 1);
    expect(combo.empowered).toBe(true);
    expect(combo.damageMultiplier).toBe(2);

    // Um erro encerra o bônus junto com o combo.
    combo.update(0.01);
    combo.click();
    expect(combo.snapshot().lastResult).toBe('miss');
    expect(combo.empowered).toBe(false);
    expect(combo.damageMultiplier).toBe(1);
    expect(combo.playbackMultiplier).toBe(1);
  });

  it('ends the combo on a click over the red zone', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 1);
    sweepTo(combo, 0.02);

    expect(combo.click()).toBe('miss');
    expect(combo.snapshot().phase).toBe('idle');
    expect(combo.snapshot().lastResult).toBe('miss');
    expect(combo.consumeCooldownDoubles()).toEqual([]);
  });

  it('ends the combo when the gauge window closes', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 1);
    combo.update(combo.snapshot().windowSeconds + 0.1);
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
    expect(combo.snapshot().lastResult).toBe('finished');
  });

  it('makes the green zone smaller and the cursor faster on each successive link', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 2);
    let snapshot = combo.snapshot();
    const firstWidth = snapshot.greenEnd - snapshot.greenStart;
    const firstPass = snapshot.sweepSeconds;
    sweepTo(combo, (snapshot.greenStart + snapshot.greenEnd) / 2);
    combo.click();

    combo.registerCast('ataque_giratorio_2', 1);
    snapshot = combo.snapshot();
    expect(snapshot.greenEnd - snapshot.greenStart).toBeLessThan(firstWidth);
    expect(snapshot.sweepSeconds).toBeLessThan(firstPass);
    expect(comboGreenWidth(2)).toBeLessThan(comboGreenWidth(1));
    expect(comboGreenWidth(99)).toBe(COMBO_GREEN_WIDTHS[COMBO_GREEN_WIDTHS.length - 1]);
    expect(comboSweepSeconds(99)).toBe(COMBO_SWEEP_SECONDS[COMBO_SWEEP_SECONDS.length - 1]);
  });

  it('starts a fresh combo when a skill is cast without a link', () => {
    const combo = controller();
    combo.registerCast('ataque_giratorio', 1);
    sweepTo(combo, 0.02);
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
    expect(combo.empowered).toBe(false);
  });

  it('resolves the gauge before the skill animation ends', () => {
    const combo = controller();
    combo.registerCast('triplo_ataque', 1, { durationSeconds: 1.8, lastHitSeconds: 1.2 });
    const { windowSeconds } = combo.snapshot();
    expect(windowSeconds).toBeCloseTo(1.8 - COMBO_END_MARGIN_SECONDS, 5);
    combo.update(windowSeconds - 0.01);
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
      expect(greenStart * timing.windowSeconds).toBeGreaterThanOrEqual(1.2 - 1e-6);
      expect(greenEnd).toBeLessThanOrEqual(1);
    }
  });

  it('never makes the green zone shorter than a clickable time', () => {
    for (let hits = 0; hits < 6; hits += 1) {
      const timing = comboGaugeTiming(hits, { durationSeconds: 2, lastHitSeconds: 1 });
      expect(timing.greenWidth * timing.sweepSeconds)
        .toBeGreaterThanOrEqual(COMBO_MIN_GREEN_SECONDS - 1e-9);
      expect(timing.windowSeconds).toBeGreaterThan(timing.sweepSeconds);
    }
  });

  it('keeps the green zone reachable even in a very short skill animation', () => {
    for (const duration of [0.5, 0.7, 0.9, 1.1]) {
      for (let hits = 0; hits < 5; hits += 1) {
        const timing = comboGaugeTiming(hits, {
          durationSeconds: duration,
          lastHitSeconds: duration * 0.85,
        });
        // O cursor precisa alcançar o fim do verde antes da gauge fechar.
        expect((timing.zoneMin + timing.greenWidth) * timing.sweepSeconds)
          .toBeLessThanOrEqual(timing.windowSeconds);
        expect(timing.zoneMin).toBeGreaterThanOrEqual(0.28);
        expect(timing.zoneMin + timing.greenWidth).toBeLessThanOrEqual(1);
      }
    }
  });
});
