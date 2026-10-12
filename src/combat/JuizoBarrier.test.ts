import { describe, expect, it } from 'vitest';
import { JUIZO_BARRIER_RADIUS_METERS } from './MageLightningTiming';
import { juizoBarrierMinDistance, pushOutOfJuizoBarrier } from './JuizoBarrier';

describe('barreira do Juízo do Trovão', () => {
  it('usa o raio da cúpula visual somado ao corpo do monstro', () => {
    expect(JUIZO_BARRIER_RADIUS_METERS).toBeCloseTo(3.15);
    expect(juizoBarrierMinDistance(0.5)).toBeCloseTo(3.65);
    expect(juizoBarrierMinDistance(-1)).toBeCloseTo(JUIZO_BARRIER_RADIUS_METERS);
  });

  it('não mexe em monstro que está fora da barreira', () => {
    expect(pushOutOfJuizoBarrier(0, 0, 5, 0, 3.6)).toBeNull();
  });

  it('empurra monstro que entrou na barreira para a borda, na mesma direção', () => {
    const pushed = pushOutOfJuizoBarrier(0, 0, 1, 0, 3.6);
    expect(pushed).not.toBeNull();
    expect(pushed!.x).toBeCloseTo(3.6);
    expect(pushed!.z).toBeCloseTo(0);

    const diagonal = pushOutOfJuizoBarrier(10, 10, 11, 11, 2);
    expect(diagonal!.x).toBeCloseTo(10 + Math.SQRT1_2 * 2);
    expect(diagonal!.z).toBeCloseTo(10 + Math.SQRT1_2 * 2);
  });

  it('resolve monstro exatamente no centro sem devolver NaN', () => {
    const pushed = pushOutOfJuizoBarrier(2, 3, 2, 3, 3.6);
    expect(pushed).toEqual({ x: 2 + 3.6, z: 3 });
  });
});
