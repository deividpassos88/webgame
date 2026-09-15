import { describe, expect, it } from 'vitest';
import { SwordComboController } from './SwordComboController';

describe('SwordComboController', () => {
  it('opens one damage window and ends the first 0.33-second stage', () => {
    const combo = new SwordComboController();
    combo.request();

    expect(combo.update(0.10).map((event) => event.type)).not.toContain('damage-opened');
    expect(combo.update(0.02).map((event) => event.type)).toContain('damage-opened');
    expect(combo.update(0.21).map((event) => event.type)).toContain('combo-ended');
    expect(combo.activeStage).toBeNull();
  });

  it('buffers a second and third input only in their valid windows', () => {
    const combo = new SwordComboController();
    combo.request();

    combo.update(0.18);
    expect(combo.request()).toBe(true);
    expect(combo.update(0.15).some(
      (event) => event.type === 'stage-started' && event.stage === 1
    )).toBe(true);

    combo.update(0.18);
    expect(combo.request()).toBe(true);
    expect(combo.update(0.18).some(
      (event) => event.type === 'stage-started' && event.stage === 2
    )).toBe(true);
  });

  it('does not buffer an input until the stage buffer window opens', () => {
    const combo = new SwordComboController();
    combo.request();

    combo.update(0.15);
    expect(combo.request()).toBe(false);
    combo.update(0.01);
    expect(combo.request()).toBe(true);
  });

  it('does not skip damage-close or stage end when a long frame crosses thresholds', () => {
    const combo = new SwordComboController();
    combo.request();

    expect(combo.update(0.40).map((event) => event.type)).toEqual([
      'damage-opened', 'damage-closed', 'combo-ended',
    ]);
  });

  it('reuses the event array between updates', () => {
    const combo = new SwordComboController();
    combo.request();

    const first = combo.update(0.12);
    const second = combo.update(0.01);

    expect(second).toBe(first);
    expect(second).toEqual([]);
  });

  it('ignores negative and non-finite deltas without advancing the combo', () => {
    const combo = new SwordComboController();
    combo.request();

    expect(combo.update(-0.5)).toEqual([]);
    expect(combo.active).toBe(true);
    expect(combo.activeStage).toBe(0);
    expect(combo.update(Number.NaN)).toEqual([]);
    expect(combo.update(Number.POSITIVE_INFINITY)).toEqual([]);
    expect(combo.active).toBe(true);
    expect(combo.update(0.12).map((event) => event.type)).toContain('damage-opened');
  });

  it('cancels pending damage transitions and can be requested again from stage zero', () => {
    const combo = new SwordComboController();
    combo.request();
    combo.update(0.12);

    combo.cancel();
    expect(combo.active).toBe(false);
    expect(combo.activeStage).toBeNull();
    expect(combo.update(1)).toEqual([]);

    expect(combo.request()).toBe(true);
    expect(combo.update(0.12).map((event) => event.type)).toContain('damage-opened');
  });

  it('ends the third stage even if an input request arrives during its buffer window', () => {
    const combo = new SwordComboController();
    combo.request();
    combo.update(0.18);
    combo.request();
    combo.update(0.15);
    combo.update(0.18);
    combo.request();
    combo.update(0.18);

    expect(combo.activeStage).toBe(2);
    expect(combo.request()).toBe(false);
    expect(combo.update(0.40).map((event) => event.type)).toEqual([
      'damage-opened', 'damage-closed', 'combo-ended',
    ]);
    expect(combo.active).toBe(false);
  });

  it('hits the first stage pre-open, open, close and end boundaries exactly', () => {
    const combo = new SwordComboController();
    combo.request();

    expect(combo.update(0.1121).map((event) => event.type)).toEqual([]);
    expect(combo.update(0.0001)).toEqual([
      { type: 'damage-opened', stage: 0 },
    ]);
    expect(combo.update(0.099)).toEqual([
      { type: 'damage-closed', stage: 0 },
    ]);
    expect(combo.update(0.1188)).toEqual([
      { type: 'combo-ended' },
    ]);
  });

  it('hits the second stage pre-open, open, close and end boundaries exactly', () => {
    const combo = new SwordComboController();
    combo.request();
    combo.update(0.18);
    expect(combo.request()).toBe(true);
    combo.update(0.15);

    expect(combo.update(0.1079).map((event) => event.type)).not.toContain('damage-opened');
    expect(combo.update(0.0001)).toEqual([
      { type: 'damage-opened', stage: 1 },
    ]);
    expect(combo.update(0.1152)).toEqual([
      { type: 'damage-closed', stage: 1 },
    ]);
    expect(combo.update(0.1368)).toEqual([
      { type: 'combo-ended' },
    ]);
  });

  it('hits the third stage pre-open, open, close and end boundaries exactly', () => {
    const combo = new SwordComboController();
    combo.request();
    combo.update(0.18);
    expect(combo.request()).toBe(true);
    combo.update(0.15);
    combo.update(0.18);
    expect(combo.request()).toBe(true);
    combo.update(0.18);

    expect(combo.update(0.1119).map((event) => event.type)).not.toContain('damage-opened');
    expect(combo.update(0.0001)).toEqual([
      { type: 'damage-opened', stage: 2 },
    ]);
    expect(combo.update(0.144)).toEqual([
      { type: 'damage-closed', stage: 2 },
    ]);
    expect(combo.update(0.144)).toEqual([
      { type: 'combo-ended' },
    ]);
  });

  it('crosses a buffered first-stage close and end then carries remainder into stage one', () => {
    const combo = new SwordComboController();
    combo.request();
    combo.update(0.18);
    expect(combo.request()).toBe(true);

    const transition = combo.update(0.20);

    expect(transition.map((event) => event.type)).toEqual([
      'damage-closed', 'stage-started',
    ]);
    expect(transition[0]).toEqual({ type: 'damage-closed', stage: 0 });
    expect(transition[1]).toEqual({ type: 'stage-started', stage: 1 });
    expect(combo.activeStage).toBe(1);
    expect(combo.update(0.0581)).toEqual([
      { type: 'damage-opened', stage: 1 },
    ]);
  });

  it('does not duplicate threshold events or leak an end into later updates', () => {
    const combo = new SwordComboController();
    combo.request();

    expect(combo.update(0.1122).map((event) => event.type)).toEqual(['damage-opened']);
    expect(combo.update(0.01)).toEqual([]);
    expect(combo.update(0.089).map((event) => event.type)).toEqual(['damage-closed']);
    expect(combo.update(0.1188).map((event) => event.type)).toEqual(['combo-ended']);
    expect(combo.update(0.01)).toEqual([]);
    expect(combo.active).toBe(false);
  });

  it('freezes shared event objects while leaving the reusable event array mutable', () => {
    const combo = new SwordComboController();
    combo.request();
    const opened = combo.update(0.12)[0];
    const closed = combo.update(0.10)[0];
    const ended = combo.update(0.11)[0];

    const otherCombo = new SwordComboController();
    otherCombo.request();
    const otherOpened = otherCombo.update(0.12)[0];
    expect(otherOpened).toBe(opened);

    const continuation = new SwordComboController();
    continuation.request();
    continuation.update(0.18);
    continuation.request();
    const started = continuation.update(0.15).find(
      (event) => event.type === 'stage-started' && event.stage === 1
    );

    for (const event of [opened, closed, ended, started]) {
      expect(event).toBeDefined();
      expect(Object.isFrozen(event)).toBe(true);
    }

    const reusable = continuation.update(0);
    expect(Object.isFrozen(reusable)).toBe(false);
    expect(continuation.update(0)).toBe(reusable);
  });
});
