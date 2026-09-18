import { describe, expect, it } from 'vitest';
import {
  BOSS_BASE_HP,
  FINAL_BOSS_HP_BARS,
  finalBossTotalHp,
  miniBossHpMultiplier,
  regularEnemyHpMultiplier,
} from './WaveDifficultyScaling';

describe('regularEnemyHpMultiplier', () => {
  it('sobe 3% por wave sem teto', () => {
    expect(regularEnemyHpMultiplier(1)).toBeCloseTo(1.03, 10);
    expect(regularEnemyHpMultiplier(2)).toBeCloseTo(1.06, 10);
    expect(regularEnemyHpMultiplier(6)).toBeCloseTo(1.18, 10);
    expect(regularEnemyHpMultiplier(9)).toBeCloseTo(1.27, 10);
  });

  it('trata waves invalidas como wave 1', () => {
    expect(regularEnemyHpMultiplier(0)).toBeCloseTo(1.03, 10);
    expect(regularEnemyHpMultiplier(Number.NaN)).toBeCloseTo(1.03, 10);
  });
});

describe('miniBossHpMultiplier', () => {
  it('sobe 5% por wave ate atingir 30% na wave 6', () => {
    expect(miniBossHpMultiplier(1)).toBeCloseTo(1.05, 10);
    expect(miniBossHpMultiplier(3)).toBeCloseTo(1.15, 10);
    expect(miniBossHpMultiplier(6)).toBeCloseTo(1.3, 10);
  });

  it('nao passa de 30% depois da wave 6', () => {
    expect(miniBossHpMultiplier(7)).toBeCloseTo(1.3, 10);
    expect(miniBossHpMultiplier(99)).toBeCloseTo(1.3, 10);
  });
});

describe('finalBossTotalHp', () => {
  it('vale 5 barras (base aumentada em 4x)', () => {
    expect(FINAL_BOSS_HP_BARS).toBe(5);
    expect(finalBossTotalHp()).toBe(BOSS_BASE_HP * 5);
    expect(finalBossTotalHp()).toBe(7000);
  });
});
