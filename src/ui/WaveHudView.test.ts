import { describe, expect, it } from 'vitest';
import type { WaveSnapshot } from '../waves/WaveManager';
import { getWaveHudContent } from './WaveHudView';

function snapshot(overrides: Partial<WaveSnapshot>): WaveSnapshot {
  return {
    phase: 'waiting-for-weapon',
    phaseId: 1,
    wave: 0,
    spawned: 0,
    alive: 0,
    total: 0,
    countdownSeconds: 0,
    ...overrides,
  };
}

describe('getWaveHudContent', () => {
  it('hides the status while waiting for a weapon', () => {
    expect(getWaveHudContent(snapshot({}))).toEqual({
      visible: false,
      title: '',
      detail: '',
    });
  });

  it('shows the regular-wave countdown', () => {
    expect(getWaveHudContent(snapshot({
      phase: 'countdown',
      wave: 1,
      total: 25,
      countdownSeconds: 5,
    }))).toEqual({
      visible: true,
      title: 'Próxima onda em: 5',
      detail: '',
    });
  });

  it('shows the current regular wave and remaining enemies', () => {
    expect(getWaveHudContent(snapshot({
      phase: 'regular-wave',
      wave: 3,
      spawned: 25,
      alive: 8,
      total: 25,
    }))).toEqual({
      visible: true,
      title: 'Onda 3/6',
      detail: 'Restantes: 8/25',
    });
  });

  it('shows the final-battle countdown', () => {
    expect(getWaveHudContent(snapshot({
      phase: 'final-countdown',
      wave: 6,
      total: 5,
      countdownSeconds: 4,
    }))).toEqual({
      visible: true,
      title: 'Boss final em: 4',
      detail: '',
    });
  });

  it('shows final-battle progress', () => {
    expect(getWaveHudContent(snapshot({
      phase: 'final-battle',
      wave: 6,
      spawned: 5,
      alive: 5,
      total: 5,
    }))).toEqual({
      visible: true,
      title: 'BOSS FINAL',
      detail: 'Inimigos restantes: 5/5',
    });
  });

  it('hides the status after victory because the overlay owns the screen', () => {
    expect(getWaveHudContent(snapshot({
      phase: 'victory',
      wave: 6,
      spawned: 5,
      total: 5,
    }))).toEqual({
      visible: false,
      title: '',
      detail: '',
    });
  });
});
