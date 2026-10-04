import { describe, expect, it } from 'vitest';
import {
  selectBasicAttackWaveTarget,
  type BasicAttackWaveCandidate,
} from './BasicAttackWaveTargets';

const FORWARD = { x: 0, z: -1 };
// Cone de ~24°: cosseno do meio-ângulo usado pelo leque do Guerreiro.
const CONE = Math.cos((24 * Math.PI) / 180);

function enemy(x: number, z: number, options: Partial<BasicAttackWaveCandidate> = {}): BasicAttackWaveCandidate {
  return { x, z, bodyRadius: 0.5, ...options };
}

function select(candidates: BasicAttackWaveCandidate[], maxDistance = 7) {
  return selectBasicAttackWaveTarget({
    origin: { x: 0, z: 0 },
    forward: FORWARD,
    maxDistance,
    coneCosine: CONE,
    candidates,
  });
}

describe('selectBasicAttackWaveTarget (leque para no primeiro corpo)', () => {
  it('pega o inimigo mais próximo dentro do cone', () => {
    const result = select([enemy(0, -5), enemy(0.4, -2.5)]);
    // Distância efetiva: a do centro (hypot(0,4; 2,5)) menos 0,5 m de corpo.
    expect(result?.index).toBe(1);
    expect(result?.distance).toBeCloseTo(Math.hypot(0.4, 2.5) - 0.5, 5);
    expect(result?.x).toBeCloseTo(0.4, 5);
  });

  it('ignora quem está fora do cone, mesmo colado', () => {
    const result = select([enemy(3, -0.5), enemy(0, -4)]);
    expect(result?.index).toBe(1);
  });

  it('usa o corpo para medir a distância do falloff', () => {
    const result = select([enemy(0, -0.3, { bodyRadius: 0.7 })]);
    // Colado: distância efetiva 0 -> dano cheio sem falloff.
    expect(result?.distance).toBe(0);
  });

  it('respeita o alcance do leque', () => {
    expect(select([enemy(0, -7.6)], 7)).toBeNull();
    expect(select([enemy(0, -6.9)], 7)?.index).toBe(0);
  });

  it('o alvo marcado ganha do mais próximo e tem 1 m de tolerância', () => {
    const result = select([enemy(0, -3), enemy(0, -7.8, { preferred: true })]);
    expect(result?.index).toBe(1);
  });

  it('sem candidato no cone, ninguém leva dano', () => {
    expect(select([])).toBeNull();
    expect(select([enemy(4, 4)])).toBeNull();
  });
});
