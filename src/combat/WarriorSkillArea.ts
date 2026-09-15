import * as THREE from 'three';
import type { WarriorSkillId } from './WarriorSkillCatalog';
import { WARRIOR_MAX_RANGE_METERS } from './DistanceDamage';

export type WarriorSkillAreaShape = 'circle' | 'arc' | 'impact';

export interface WarriorSkillAreaDefinition {
  readonly shape: WarriorSkillAreaShape;
  readonly radius: number;
  readonly angleDegrees?: number;
  readonly forwardOffset?: number;
}

const AREAS: Readonly<Record<WarriorSkillId, WarriorSkillAreaDefinition>> = Object.freeze({
  ataque_giratorio: Object.freeze({ shape: 'circle', radius: WARRIOR_MAX_RANGE_METERS }),
  ataque_giratorio_2: Object.freeze({ shape: 'circle', radius: WARRIOR_MAX_RANGE_METERS }),
  pulo_atacando: Object.freeze({
    shape: 'impact',
    radius: WARRIOR_MAX_RANGE_METERS - 1.8,
    forwardOffset: 1.8,
  }),
  triplo_ataque: Object.freeze({ shape: 'arc', radius: WARRIOR_MAX_RANGE_METERS, angleDegrees: 140 }),
  corte_duplo: Object.freeze({ shape: 'arc', radius: WARRIOR_MAX_RANGE_METERS, angleDegrees: 125 }),
});

const flatDelta = new THREE.Vector3();
const flatForward = new THREE.Vector3();
const center = new THREE.Vector3();

export function getWarriorSkillArea(id: WarriorSkillId): WarriorSkillAreaDefinition {
  return AREAS[id];
}

export function getWarriorSkillDamage(baseDamage: number): number {
  return (Number.isFinite(baseDamage) ? Math.max(0, baseDamage) : 0) + 1;
}

export function resolveWarriorSkillAreaCenter(
  origin: THREE.Vector3,
  forward: THREE.Vector3,
  definition: WarriorSkillAreaDefinition
): THREE.Vector3 {
  const resolvedForward = new THREE.Vector3(forward.x, 0, forward.z);
  if (resolvedForward.lengthSq() < 1e-8) resolvedForward.set(0, 0, 1);
  else resolvedForward.normalize();
  const resolvedCenter = origin.clone();
  if (definition.shape === 'impact') {
    resolvedCenter.addScaledVector(resolvedForward, definition.forwardOffset ?? 0);
  }
  return resolvedCenter;
}

export function isPointInWarriorSkillArea(
  origin: THREE.Vector3,
  forward: THREE.Vector3,
  point: THREE.Vector3,
  definition: WarriorSkillAreaDefinition
): boolean {
  flatForward.set(forward.x, 0, forward.z);
  if (flatForward.lengthSq() < 1e-8) flatForward.set(0, 0, 1);
  else flatForward.normalize();

  center.copy(resolveWarriorSkillAreaCenter(origin, flatForward, definition));

  flatDelta.set(point.x - center.x, 0, point.z - center.z);
  const distanceSq = flatDelta.lengthSq();
  if (distanceSq > definition.radius * definition.radius + 1e-8) return false;
  if (definition.shape !== 'arc' || distanceSq < 1e-8) return true;

  flatDelta.normalize();
  const halfAngle = THREE.MathUtils.degToRad((definition.angleDegrees ?? 360) / 2);
  return flatForward.dot(flatDelta) + 1e-8 >= Math.cos(halfAngle);
}
