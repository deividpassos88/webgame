import * as THREE from 'three';
import {
  isInsideMageSkillRadius,
  MAGE_SKILL_AREA_RADIUS_METERS,
} from '../combat/MageSkillImpact';
import type { CombatRecord } from '../waves/CombatEntityRegistry';

/**
 * Alvos da explosão em área das skills 1 (água) e 2 (gelo) da Maga.
 *
 * Regras, na ordem em que o impacto resolve os alvos:
 * - só monstro VIVO (`isDead` fica fora);
 * - distância HORIZONTAL até o ponto de impacto: no máximo 3 m de RAIO (a
 *   altura não aumenta o alcance, igual ao resto do jogo);
 * - o alvo que levou o feitiço em cheio é excluído (`exclude`), porque já
 *   recebeu o dano — ninguém leva o mesmo feitiço duas vezes;
 * - registros que compartilham a mesma raiz entram uma vez só, e a ordem é a
 *   do registro (determinística), como no leque do Guerreiro.
 */
export function resolveMageSkillAreaTargets(
  records: readonly CombatRecord[],
  impact: THREE.Vector3,
  exclude?: THREE.Object3D | null,
  radius = MAGE_SKILL_AREA_RADIUS_METERS
): CombatRecord[] {
  const roots = new Set<THREE.Object3D>();
  const targets: CombatRecord[] = [];
  if (exclude) roots.add(exclude);
  for (const record of records) {
    const root = record.enemy.root;
    if (record.enemy.isDead || roots.has(root)) continue;
    if (!isInsideMageSkillRadius(impact.x, impact.z, root.position.x, root.position.z, radius)) continue;
    roots.add(root);
    targets.push(record);
  }
  return targets;
}
