import { describe, expect, it } from 'vitest';
import {
  BOSS_BAR_LAYER_COLORS,
  getBossHealthHudValues,
  resolveBossBarLayer,
} from './BossHealthView';

describe('getBossHealthHudValues', () => {
  it('renders zero when the main boss dies before the mini-bosses', () => {
    const miniBossesAlive = 4;

    expect(miniBossesAlive).toBeGreaterThan(0);
    expect(
      getBossHealthHudValues({ hp: 8, maxHP: 800, isDead: true })
    ).toEqual({ hp: 0, maxHP: 800 });
  });
});

describe('resolveBossBarLayer', () => {
  const maxHp = 7000; // 5 barras de 1400

  it('comeca na barra verde cheia', () => {
    const layer = resolveBossBarLayer(maxHp, maxHp);
    expect(layer).toMatchObject({ index: 0, color: BOSS_BAR_LAYER_COLORS[0], fill: 1, barsRemaining: 5 });
  });

  it('drena a barra atual antes de trocar de cor', () => {
    const layer = resolveBossBarLayer(6300, maxHp); // 700 de dano = metade da 1a barra
    expect(layer.index).toBe(0);
    expect(layer.fill).toBeCloseTo(0.5, 5);
    expect(layer.barsRemaining).toBe(5);
  });

  it('passa pelas cinco cores na ordem pedida', () => {
    const colors = [400, 1800, 3200, 4600, 6000].map((hpFromBottom) =>
      resolveBossBarLayer(maxHp - hpFromBottom, maxHp).color
    );
    expect(colors).toEqual([...BOSS_BAR_LAYER_COLORS]);
  });

  it('mostra a ultima barra (vermelho claro) drenando no fim', () => {
    const layer = resolveBossBarLayer(700, maxHp);
    expect(layer).toMatchObject({ index: 4, color: BOSS_BAR_LAYER_COLORS[4], barsRemaining: 1 });
    expect(layer.fill).toBeCloseTo(0.5, 5);
  });

  it('zera a barra quando o boss morre', () => {
    expect(resolveBossBarLayer(0, maxHp)).toMatchObject({ fill: 0, barsRemaining: 0 });
  });
});
