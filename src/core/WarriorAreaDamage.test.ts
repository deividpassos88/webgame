import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CombatRecord } from '../waves/CombatEntityRegistry';
import { getWarriorSkillArea } from '../combat/WarriorSkillArea';
import { resolveWarriorAreaTargets } from './WarriorAreaDamage';

function record(id: string, x: number, z: number, dead = false, root?: THREE.Object3D): CombatRecord {
  const enemyRoot = root ?? new THREE.Object3D();
  enemyRoot.position.set(x, 0, z);
  return {
    id,
    phaseId: 1,
    role: 'regular',
    deathReported: false,
    enemy: { root: enemyRoot, isDead: dead } as CombatRecord['enemy'],
  };
}

const event = {
  attackId: 'ataque_giratorio' as const,
  hitIndex: 0,
  origin: new THREE.Vector3(),
  forward: new THREE.Vector3(0, 0, 1),
};

describe('resolveWarriorAreaTargets', () => {
  it('returns every living circle target in deterministic registry order', () => {
    const records = [record('first', 3, 0), record('dead', 1, 0, true), record('outside', 7.1, 0), record('second', 0, 3)];
    expect(resolveWarriorAreaTargets(records, event, getWarriorSkillArea('ataque_giratorio')).map(({ id }) => id)).toEqual(['first', 'second']);
  });

  it('excludes arc targets behind the warrior', () => {
    const records = [record('front', 0, 3), record('behind', 0, -2), record('side', 3.9, 0)];
    expect(resolveWarriorAreaTargets(records, { ...event, attackId: 'triplo_ataque' }, getWarriorSkillArea('triplo_ataque')).map(({ id }) => id)).toEqual(['front']);
  });

  it('uses the forward impact center for the jump skill', () => {
    const records = [record('forward', 0, 5), record('outside', 0, 5.01), record('far-behind', 0, -6)];
    expect(resolveWarriorAreaTargets(records, { ...event, attackId: 'pulo_atacando' }, getWarriorSkillArea('pulo_atacando')).map(({ id }) => id)).toEqual(['forward']);
  });

  it('returns a shared enemy root only once for one hit index', () => {
    const shared = new THREE.Object3D();
    const records = [record('first', 0, 2, false, shared), record('duplicate', 0, 2, false, shared)];
    expect(resolveWarriorAreaTargets(records, event, getWarriorSkillArea('ataque_giratorio')).map(({ id }) => id)).toEqual(['first']);
  });

  it('allows the same enemy on separate timeline hit indices', () => {
    const target = record('target', 0, 2);
    const area = getWarriorSkillArea('triplo_ataque');
    expect(resolveWarriorAreaTargets([target], { ...event, attackId: 'triplo_ataque', hitIndex: 0 }, area)).toEqual([target]);
    expect(resolveWarriorAreaTargets([target], { ...event, attackId: 'triplo_ataque', hitIndex: 1 }, area)).toEqual([target]);
    expect(resolveWarriorAreaTargets([target, target], { ...event, attackId: 'triplo_ataque', hitIndex: 1 }, area)).toEqual([target]);
  });
});
