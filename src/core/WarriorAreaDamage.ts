import * as THREE from 'three';
import type { WarriorSkillId } from '../combat/WarriorSkillCatalog';
import {
  isPointInWarriorSkillArea,
  type WarriorSkillAreaDefinition,
} from '../combat/WarriorSkillArea';
import type { CombatRecord } from '../waves/CombatEntityRegistry';

export interface WarriorAreaHitEvent {
  readonly attackId: WarriorSkillId;
  readonly hitIndex: number;
  readonly origin: THREE.Vector3;
  readonly forward: THREE.Vector3;
}

export function resolveWarriorAreaTargets(
  records: readonly CombatRecord[],
  event: WarriorAreaHitEvent,
  area: WarriorSkillAreaDefinition
): CombatRecord[] {
  const roots = new Set<THREE.Object3D>();
  const targets: CombatRecord[] = [];
  for (const record of records) {
    const root = record.enemy.root;
    if (record.enemy.isDead || roots.has(root)) continue;
    if (!isPointInWarriorSkillArea(event.origin, event.forward, root.position, area)) continue;
    roots.add(root);
    targets.push(record);
  }
  return targets;
}
