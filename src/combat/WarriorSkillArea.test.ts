import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  getWarriorSkillArea,
  getWarriorSkillDamage,
  resolveWarriorSkillAreaCenter,
  isPointInWarriorSkillArea,
} from './WarriorSkillArea';

describe('WarriorSkillArea', () => {
  it('defines the approved larger areas for all five skills', () => {
    expect(getWarriorSkillArea('ataque_giratorio')).toMatchObject({ shape: 'circle', radius: 10 });
    expect(getWarriorSkillArea('ataque_giratorio_2')).toMatchObject({ shape: 'circle', radius: 10 });
    expect(getWarriorSkillArea('pulo_atacando')).toMatchObject({
      shape: 'circle',
      radius: 5,
    });
    expect(getWarriorSkillArea('triplo_ataque')).toMatchObject({ shape: 'arc', radius: 5, angleDegrees: 140 });
    expect(getWarriorSkillArea('corte_duplo')).toMatchObject({ shape: 'arc', radius: 5, angleDegrees: 125 });
  });

  it('adds exactly one damage and clamps invalid base damage', () => {
    expect(getWarriorSkillDamage(18)).toBe(19);
    expect(getWarriorSkillDamage(-10)).toBe(1);
    expect(getWarriorSkillDamage(Number.NaN)).toBe(1);
  });

  it('tests circles in the horizontal plane and includes their boundary', () => {
    const area = getWarriorSkillArea('ataque_giratorio');
    const origin = new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, 1);
    expect(isPointInWarriorSkillArea(origin, forward, new THREE.Vector3(10, 99, 0), area)).toBe(true);
    expect(isPointInWarriorSkillArea(origin, forward, new THREE.Vector3(10.01, 0, 0), area)).toBe(false);
  });

  it('keeps arc targets in front and inside the angular boundary', () => {
    const area = getWarriorSkillArea('triplo_ataque');
    const origin = new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, 1);
    expect(isPointInWarriorSkillArea(origin, forward, new THREE.Vector3(0, 0, 4), area)).toBe(true);
    expect(isPointInWarriorSkillArea(origin, forward, new THREE.Vector3(0, 0, -2), area)).toBe(false);
    const edge = THREE.MathUtils.degToRad(70);
    expect(isPointInWarriorSkillArea(origin, forward, new THREE.Vector3(Math.sin(edge) * 5, 0, Math.cos(edge) * 5), area)).toBe(true);
  });

  it('centers jump impact around the warrior', () => {
    const area = getWarriorSkillArea('pulo_atacando');
    const origin = new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, 1);
    expect(isPointInWarriorSkillArea(origin, forward, new THREE.Vector3(0, 0, 5), area)).toBe(true);
    expect(isPointInWarriorSkillArea(origin, forward, new THREE.Vector3(0, 0, 5.01), area)).toBe(false);
    expect(isPointInWarriorSkillArea(origin, forward, new THREE.Vector3(0, 0, -5), area)).toBe(true);
    expect(resolveWarriorSkillAreaCenter(origin, forward, area).toArray()).toEqual([0, 0, 0]);
  });
});
