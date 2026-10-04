/**
 * Regra única do dano em área dos ataques básicos (Maga e Guerreiro).
 *
 * Pedido do usuário: o alvo do golpe leva o dano **normal da arma** (100%), e
 * os inimigos vizinhos levam **4× menos** (1/4) porque estão apenas pegando o
 * respingo do golpe. Exemplo dado por ele: arma com 5 de dano → o alvo leva 5 e
 * quem estiver perto leva 1.
 *
 * - A Maga respinga no impacto do tiro.
 * - O Guerreiro respinga no leque do corte.
 *
 * O alcance do respingo é o mesmo para os dois: 2 m ao redor do alvo.
 */
export const BASIC_ATTACK_AREA_RADIUS_METERS = 2;
/** 4× menos que o dano da arma (1/4 = 0,25). */
export const BASIC_ATTACK_AREA_DAMAGE_DIVISOR = 4;
export const BASIC_ATTACK_AREA_DAMAGE_MULTIPLIER = 1 / BASIC_ATTACK_AREA_DAMAGE_DIVISOR;

/** Dano do respingo a partir do dano cheio do golpe (arma + atributos). */
export function basicAttackAreaDamage(fullDamage: number): number {
  if (!Number.isFinite(fullDamage) || fullDamage <= 0) return 0;
  return fullDamage * BASIC_ATTACK_AREA_DAMAGE_MULTIPLIER;
}

/**
 * Teste de raio horizontal (mesmo critério das áreas da Maga): usado para achar
 * quem está dentro do respingo de 2 m do alvo.
 */
export function isInsideBasicAttackArea(
  areaX: number,
  areaZ: number,
  targetX: number,
  targetZ: number,
  radius: number = BASIC_ATTACK_AREA_RADIUS_METERS
): boolean {
  const dx = targetX - areaX;
  const dz = targetZ - areaZ;
  return dx * dx + dz * dz <= radius * radius;
}
