import { getEffectiveTargetDistance } from './DistanceDamage';

/**
 * Escolha do alvo do leque do ataque básico do Guerreiro.
 *
 * O leque de vento para no primeiro corpo: por isso o golpe tem **um** alvo, que
 * leva o dano cheio da arma. Quem estiver a até 2 m dele leva 1/4 (respingo,
 * ver `BasicAttackArea`) e o resto do cone não leva nada.
 *
 * A escolha é pura (sem Three.js) para dar para testar: o `Game` monta a lista
 * de candidatos (inimigos vivos e o boneco de treino) e recebe de volta o
 * índice do alvo.
 */

export interface BasicAttackWaveCandidate {
  readonly x: number;
  readonly z: number;
  /** Raio do corpo, em metros: desconta do centro e aproxima o alvo. */
  readonly bodyRadius: number;
  /**
   * Alvo marcado pelo jogador (ou pelo auto-ataque): ganha do mais próximo.
   * Aceita 1 m de tolerância de alcance, porque a mira é dele.
   */
  readonly preferred?: boolean;
}

export interface BasicAttackWaveSelection {
  /** Índice do alvo dentro da lista de candidatos. */
  readonly index: number;
  /** Distância efetiva (já descontado o corpo) usada no falloff do dano. */
  readonly distance: number;
  readonly x: number;
  readonly z: number;
}

export interface BasicAttackWaveInput {
  readonly origin: { readonly x: number; readonly z: number };
  /** Direção do golpe já normalizada no plano (x, z). */
  readonly forward: { readonly x: number; readonly z: number };
  readonly maxDistance: number;
  /** Cosseno do meio-ângulo do cone. */
  readonly coneCosine: number;
  readonly candidates: readonly BasicAttackWaveCandidate[];
}

/** A partir daqui o ângulo não importa mais: o corpo está praticamente em cima. */
const TOUCHING_DISTANCE = 0.6;
const MIN_BODY_RADIUS = 0.45;

export function selectBasicAttackWaveTarget(
  input: BasicAttackWaveInput
): BasicAttackWaveSelection | null {
  let best: BasicAttackWaveSelection | null = null;

  for (let index = 0; index < input.candidates.length; index += 1) {
    const candidate = input.candidates[index];
    const dx = candidate.x - input.origin.x;
    const dz = candidate.z - input.origin.z;
    const centerDistance = Math.hypot(dx, dz);
    if (centerDistance <= 1e-8) continue;

    const inCone = centerDistance <= TOUCHING_DISTANCE
      || (dx / centerDistance) * input.forward.x + (dz / centerDistance) * input.forward.z
        >= input.coneCosine;
    if (!inCone) continue;

    const bodyRadius = Math.max(candidate.bodyRadius, MIN_BODY_RADIUS);
    const distance = getEffectiveTargetDistance(centerDistance, bodyRadius);
    const limit = candidate.preferred ? input.maxDistance + 1 : input.maxDistance;
    if (distance > limit) continue;

    // O alvo marcado ganha de qualquer outro; entre iguais, o mais próximo.
    if (!best) {
      best = { index, distance, x: candidate.x, z: candidate.z };
      continue;
    }
    const bestIsPreferred = input.candidates[best.index].preferred === true;
    if (candidate.preferred === true && !bestIsPreferred) {
      best = { index, distance, x: candidate.x, z: candidate.z };
      continue;
    }
    if (bestIsPreferred && candidate.preferred !== true) continue;
    if (distance < best.distance) {
      best = { index, distance, x: candidate.x, z: candidate.z };
    }
  }

  return best;
}
