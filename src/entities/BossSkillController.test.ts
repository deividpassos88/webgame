import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BOSS_SKILL_GEOMETRY,
  BossSkillController,
  type BossSkillKind,
} from './BossSkillController';

const boss = new THREE.Vector3(0, 0, 0);
const player = new THREE.Vector3(0, 0, 5);

function trigger(
  randomValue: number,
  impactPosition = player
): { skill: BossSkillKind; damage: number } {
  const controller = new BossSkillController(() => randomValue);
  const telegraph = controller.update(5, boss, player);
  const impact = controller.update(
    telegraph.events[0].secondsUntilImpact,
    boss,
    impactPosition
  );
  return {
    skill: telegraph.events[0].skill,
    damage: impact.damage,
  };
}

describe('BossSkillController', () => {
  it('warns the circle for 4.2 seconds, impacts once, then rests for five seconds', () => {
    const controller = new BossSkillController(() => 0);

    const telegraph = controller.update(5, boss, player);
    expect(telegraph.events[0].secondsUntilImpact).toBe(4.2);
    expect(telegraph.events).toEqual([
      expect.objectContaining({ type: 'telegraph', skill: 'circle' }),
    ]);
    expect(controller.phase).toBe('telegraph');
    expect(controller.update(4.1, boss, player).damage).toBe(0);

    const impact = controller.update(0.1, boss, player);
    expect(impact.events[0].secondsUntilImpact).toBe(0);
    expect(impact.damage).toBe(23);
    expect(impact.events).toEqual([
      expect.objectContaining({ type: 'impact', skill: 'circle' }),
    ]);
    expect(controller.phase).toBe('resting');
    expect(controller.restRemaining).toBe(5);
    expect(controller.update(0, boss, player).damage).toBe(0);
  });

  it.each([
    [0, 'circle', 4.2],
    [0.34, 'rectangle', 3.5],
    [0.67, 'meteors', 1],
  ] as const)('uses the approved warning for %s', (random, skill, seconds) => {
    const controller = new BossSkillController(() => random);

    const telegraph = controller.update(5, boss, player).events[0];

    expect(telegraph).toMatchObject({ skill, secondsUntilImpact: seconds });
  });

  it('locks thirty same-sized meteor warnings across a much wider area', () => {
    const controller = new BossSkillController(() => 0.67);

    const telegraph = controller.update(5, boss, player).events[0];
    const farthest = Math.max(...telegraph.meteorPoints.map((point) =>
      Math.hypot(point.x - player.x, point.z - player.z)
    ));

    expect(telegraph.skill).toBe('meteors');
    expect(telegraph.meteorPoints).toHaveLength(30);
    expect(BOSS_SKILL_GEOMETRY.meteorRadius).toBe(1.35);
    expect(farthest).toBeGreaterThanOrEqual(15);
  });

  it.each([
    [0, 'circle', 23],
    [0.34, 'rectangle', 24],
    [0.67, 'meteors', 9],
  ] as const)('applies the approved damage for %s', (random, skill, damage) => {
    expect(trigger(random)).toMatchObject({ skill, damage });
  });

  it('never selects dash or jump movement', () => {
    expect(trigger(0.999999)).toMatchObject({ skill: 'meteors', damage: 9 });
  });

  it('applies only one meteor hit and never repeats it after the one-second impact', () => {
    const controller = new BossSkillController(() => 0.67);
    controller.update(5, boss, player);

    expect(controller.update(1, boss, player).damage).toBe(9);
    expect(controller.update(0, boss, player).damage).toBe(0);
  });

  it('does not damage a player who leaves the warned circle', () => {
    expect(trigger(0, new THREE.Vector3(20, 0, 20)).damage).toBe(0);
  });

  it('damages across the expanded 17.5 meter explosion radius', () => {
    expect(trigger(0, new THREE.Vector3(0, 0, 22.4)).damage).toBe(23);
    expect(trigger(0, new THREE.Vector3(0, 0, 22.6)).damage).toBe(0);
  });

  it('damages throughout the adjusted 120 by 24 meter rectangle', () => {
    expect(trigger(0.34, new THREE.Vector3(11.9, 0, 119.9)).damage).toBe(24);
    expect(trigger(0.34, new THREE.Vector3(12.1, 0, 100)).damage).toBe(0);
    expect(trigger(0.34, new THREE.Vector3(0, 0, 120.1)).damage).toBe(0);
  });

  it('does not repeat the previous skill immediately', () => {
    const controller = new BossSkillController(() => 0);
    expect(controller.update(5, boss, player).events[0].skill).toBe('circle');
    controller.update(4.2, boss, player);
    expect(controller.update(5, boss, player).events[0].skill).toBe('rectangle');
  });

  it('scales skill damage with the boss enrage damage multiplier and updates rest cooldown', () => {
    const controller = new BossSkillController(() => 0);
    controller.update(5, boss, player);

    // Dano aumentado em 1.45x (3x bar): 23 * 1.45 = 33
    const impact3x = controller.update(4.2, boss, player, 1.45, 3.7);
    expect(impact3x.damage).toBe(33);
    expect(controller.restRemaining).toBe(3.7);

    // Dano aumentado em 2.0x (1x bar): 24 * 2.0 = 48
    controller.update(3.7, boss, player);
    const impact1x = controller.update(3.5, boss, player, 2.0, 2.2);
    expect(impact1x.damage).toBe(48);
    expect(controller.restRemaining).toBe(2.2);
  });

  it('reset cancels the current warning and restores the initial rest', () => {
    const controller = new BossSkillController(() => 0);
    controller.update(5, boss, player);

    controller.reset();

    expect(controller.phase).toBe('resting');
    expect(controller.restRemaining).toBe(5);
    expect(controller.update(0, boss, player).events).toEqual([]);
  });
});
