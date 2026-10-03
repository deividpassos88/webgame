import { describe, expect, it } from 'vitest';
import {
  COMBO_IMMUNITY_COMPLETE_TAIL_SECONDS,
  COMBO_IMMUNITY_FAIL_SECONDS,
  ComboImmunityController,
} from './ComboImmunity';
import {
  SkillComboController,
  type ComboSnapshot,
} from './SkillComboController';

function snapshotOf(combo: SkillComboController): ComboSnapshot {
  return combo.snapshot();
}

/** Combo já com um link verde acertado e a gauge da próxima skill aberta. */
function linkedCombo(): SkillComboController {
  const combo = new SkillComboController(() => 0.5);
  combo.registerCast('ataque_giratorio', 2, { durationSeconds: 1.5, lastHitSeconds: 1 });
  const { greenStart, greenEnd, sweepSeconds } = combo.snapshot();
  combo.update(sweepSeconds * ((greenStart + greenEnd) / 2));
  expect(combo.click()).toBe('hit');
  combo.registerCast('ataque_giratorio_2', 1, { durationSeconds: 1.5, lastHitSeconds: 1 });
  return combo;
}

describe('ComboImmunityController', () => {
  it('grants nothing before a combo opens', () => {
    const immunity = new ComboImmunityController();
    const combo = new SkillComboController(() => 0.5);
    combo.registerCast('ataque_giratorio', 0);

    immunity.onSkillCast(1.4, combo.active);
    expect(immunity.update({ delta: 0.016, snapshot: snapshotOf(combo), skillRemainingSeconds: 1.4 }))
      .toBe(0);
    expect(immunity.active).toBe(false);
  });

  it('starts the immunity on the first skill and keeps it for the whole animation', () => {
    const immunity = new ComboImmunityController();
    const combo = new SkillComboController(() => 0.5);
    combo.registerCast('ataque_giratorio', 2, { durationSeconds: 1.5, lastHitSeconds: 1 });

    immunity.onSkillCast(1.5, combo.active);
    expect(immunity.secondsRemaining).toBeCloseTo(1.5, 5);

    // Enquanto a gauge varre, a imunidade acompanha a skill em execução.
    expect(immunity.update({
      delta: 0.5,
      snapshot: snapshotOf(combo),
      skillRemainingSeconds: 1,
    })).toBeCloseTo(1, 5);
    expect(immunity.update({
      delta: 0.4,
      snapshot: snapshotOf(combo),
      skillRemainingSeconds: 0.6,
    })).toBeCloseTo(0.6, 5);
  });

  it('keeps only 0.2 s of immunity when the combo fails', () => {
    const immunity = new ComboImmunityController();
    const combo = new SkillComboController(() => 0.5);
    combo.registerCast('ataque_giratorio', 2, { durationSeconds: 1.5, lastHitSeconds: 1 });
    immunity.onSkillCast(1.5, combo.active);
    immunity.update({ delta: 0.1, snapshot: snapshotOf(combo), skillRemainingSeconds: 1.4 });

    // Clicou fora do verde.
    combo.update(0.01);
    expect(combo.click()).toBe('miss');
    const granted = immunity.update({
      delta: 0.016,
      snapshot: snapshotOf(combo),
      skillRemainingSeconds: 1.3,
    });
    expect(granted).toBeLessThanOrEqual(COMBO_IMMUNITY_FAIL_SECONDS);
    expect(granted).toBeCloseTo(COMBO_IMMUNITY_FAIL_SECONDS - 0.016, 5);

    immunity.update({ delta: 0.3, snapshot: snapshotOf(combo), skillRemainingSeconds: 1 });
    expect(immunity.secondsRemaining).toBe(0);
  });

  it('keeps only 0.2 s of immunity when the gauge window closes', () => {
    const immunity = new ComboImmunityController();
    const combo = new SkillComboController(() => 0.5);
    combo.registerCast('ataque_giratorio', 2, { durationSeconds: 1.5, lastHitSeconds: 1 });
    immunity.onSkillCast(1.5, combo.active);

    combo.update(combo.snapshot().windowSeconds + 0.01);
    expect(combo.snapshot().lastResult).toBe('timeout');
    const granted = immunity.update({
      delta: 0.016,
      snapshot: snapshotOf(combo),
      skillRemainingSeconds: 0.4,
    });
    expect(granted).toBeCloseTo(COMBO_IMMUNITY_FAIL_SECONDS - 0.016, 5);
  });

  it('holds the immunity through the whole chain while links keep landing', () => {
    const immunity = new ComboImmunityController();
    const combo = linkedCombo();
    immunity.onSkillCast(1.5, combo.active);

    const granted = immunity.update({
      delta: 0.2,
      snapshot: snapshotOf(combo),
      skillRemainingSeconds: 1.3,
    });
    expect(granted).toBeCloseTo(1.3, 5);
    expect(granted).toBeGreaterThan(COMBO_IMMUNITY_FAIL_SECONDS);
  });

  it('covers the end of the last skill plus 0.8 s when every combo lands', () => {
    const immunity = new ComboImmunityController();
    const combo = new SkillComboController(() => 0.5);
    combo.registerCast('triplo_ataque', 1, { durationSeconds: 1.8, lastHitSeconds: 1.2 });
    const { greenStart, greenEnd, sweepSeconds } = combo.snapshot();
    combo.update(sweepSeconds * ((greenStart + greenEnd) / 2));
    expect(combo.click()).toBe('hit');
    immunity.onSkillCast(0.6, combo.active);

    // Última skill do combo: nenhuma outra pode seguir -> 'finished'.
    combo.registerCast('corte_duplo', 0, { durationSeconds: 2, lastHitSeconds: 1.4 });
    expect(combo.snapshot().lastResult).toBe('finished');

    const granted = immunity.update({
      delta: 0.016,
      snapshot: snapshotOf(combo),
      skillRemainingSeconds: 2,
    });
    expect(granted).toBeCloseTo(
      2 + COMBO_IMMUNITY_COMPLETE_TAIL_SECONDS - 0.016,
      5
    );

    // Depois do término da animação ainda restam os 0.8 s pedidos.
    immunity.update({ delta: 2, snapshot: snapshotOf(combo), skillRemainingSeconds: 0 });
    expect(immunity.secondsRemaining).toBeCloseTo(
      COMBO_IMMUNITY_COMPLETE_TAIL_SECONDS - 0.016,
      5
    );
    immunity.update({ delta: 1, snapshot: snapshotOf(combo), skillRemainingSeconds: 0 });
    expect(immunity.secondsRemaining).toBe(0);
  });

  it('reset drops the immunity at once', () => {
    const immunity = new ComboImmunityController();
    const combo = linkedCombo();
    immunity.onSkillCast(1.5, combo.active);
    expect(immunity.active).toBe(true);
    immunity.reset();
    expect(immunity.secondsRemaining).toBe(0);
    expect(immunity.active).toBe(false);
  });

  it('ignores invalid deltas and negative skill times', () => {
    const immunity = new ComboImmunityController();
    const combo = new SkillComboController(() => 0.5);
    combo.registerCast('ataque_giratorio', 2, { durationSeconds: 1.5, lastHitSeconds: 1 });

    immunity.onSkillCast(Number.NaN, combo.active);
    expect(immunity.secondsRemaining).toBe(0);
    immunity.onSkillCast(-3, combo.active);
    expect(immunity.secondsRemaining).toBe(0);
    expect(
      immunity.update({ delta: Number.NaN, snapshot: snapshotOf(combo), skillRemainingSeconds: -1 })
    ).toBe(0);
  });
});
