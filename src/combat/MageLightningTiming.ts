/**
 * Juízo do Trovão (Maga): tempos únicos da conjuração.
 *
 * Os valores de linha do tempo estão em segundos LÓGICOS (o desenho original).
 * A skill roda JUIZO_SPEED vezes mais rápido: o MageVFX avança o relógio do VFX
 * por JUIZO_SPEED, então a barreira, o raio e a fumaça (já removida) andam juntos.
 */

/** Velocidade da skill (3x). */
export const JUIZO_SPEED = 3;

/** Duração lógica da conjuração: a barreira some nesse instante. */
export const JUIZO_TOTAL_SECONDS = 3.2;

/** Quando o raio atinge o inimigo, em segundos lógicos. Dano e área não mudam; só o atraso. */
export const JUIZO_LIGHTNING_SECONDS = 1.9;

/** Duração real (relógio de parede) da conjuração: usada pela trava de movimento da Maga. */
export const JUIZO_REAL_TOTAL_SECONDS = JUIZO_TOTAL_SECONDS / JUIZO_SPEED;

/** Raio da barreira do Juízo (metros). Cúpula visual e bloqueio de monstros usam o mesmo valor. */
export const JUIZO_BARRIER_RADIUS_METERS = 2.1 * 1.5;
