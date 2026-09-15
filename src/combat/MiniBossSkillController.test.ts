import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  MINI_BOSS_SKILL_DAMAGE_MULTIPLIER,
  MINI_BOSS_SKILL_GEOMETRY,
  MINI_BOSS_SKILL_TELEGRAPH_SECONDS,
  MiniBossSkillController,
  type MiniBossSkillKind,
} from './MiniBossSkillController';

const miniBoss = new THREE.Vector3(0, 0, 0);
const player = new THREE.Vector3(0, 0, 5);

function trigger(
  randomValue: number,
  impactPosition = player
): { skill: MiniBossSkillKind; damage: number } {
  const controller = new MiniBossSkillController(() => randomValue);
  const telegraph = controller.update(5, miniBoss, player);
  const impact = controller.update(
    telegraph.events[0].secondsUntilImpact,
    miniBoss,
    impactPosition,
    24
  );
  return {
    skill: telegraph.events[0].skill,
    damage: impact.damage,
  };
}

describe('MiniBossSkillController', () => {
  it('uses the approved two-times-smaller circle and rectangle geometry', () => {
    expect(MINI_BOSS_SKILL_GEOMETRY).toMatchObject({
      circleRadius: 8.75,
      rectangleLength: 60,
      rectangleWidth: 12,
    });
    expect(MINI_BOSS_SKILL_DAMAGE_MULTIPLIER).toBe(1.5);
    expect(MINI_BOSS_SKILL_TELEGRAPH_SECONDS).toBe(2);
  });

  it('warns the circle for exactly two seconds, impacts once, then rests for five seconds', () => {
    const controller = new MiniBossSkillController(() => 0);

    const telegraph = controller.update(5, miniBoss, player);
    expect(telegraph.events).toEqual([
      expect.objectContaining({
        type: 'telegraph',
        skill: 'circle',
        secondsUntilImpact: 2,
      }),
    ]);
    expect(controller.phase).toBe('telegraph');
    expect(controller.update(1.9, miniBoss, player, 24).damage).toBe(0);

    const impact = controller.update(0.1, miniBoss, player, 24);
    expect(impact.events).toEqual([
      expect.objectContaining({ type: 'impact', skill: 'circle', secondsUntilImpact: 0 }),
    ]);
    expect(impact.damage).toBe(36);
    expect(controller.phase).toBe('resting');
    expect(controller.restRemaining).toBe(5);
    expect(controller.update(0, miniBoss, player).damage).toBe(0);
  });

  it('carries rest overshoot into the new warning instead of extending its lifetime', () => {
    const controller = new MiniBossSkillController(() => 0);

    const frame = controller.update(5.5, miniBoss, player);

    expect(frame.events).toEqual([
      expect.objectContaining({
        type: 'telegraph',
        skill: 'circle',
        secondsUntilImpact: 1.5,
      }),
    ]);
    expect(controller.phase).toBe('telegraph');
  });

  it('carries impact overshoot into the following rest period', () => {
    const controller = new MiniBossSkillController(() => 0);

    const frame = controller.update(10, miniBoss, player, 24);

    expect(frame.events).toEqual([
      expect.objectContaining({ type: 'impact', skill: 'circle' }),
    ]);
    expect(frame.damage).toBe(36);
    expect(controller.phase).toBe('resting');
    expect(controller.restRemaining).toBeCloseTo(2, 8);
  });

  it('selects the rectangle without ever selecting meteors and applies its damage', () => {
    const controller = new MiniBossSkillController(() => 0.999999);

    const telegraph = controller.update(5, miniBoss, player);
    expect(telegraph.events[0]).toMatchObject({
      skill: 'rectangle',
      secondsUntilImpact: 2,
    });
    expect(controller.update(2, miniBoss, player, 24).damage).toBe(36);
  });

  it('keeps the circle fixed at the position marked when the warning starts', () => {
    const controller = new MiniBossSkillController(() => 0);

    controller.update(5, miniBoss, player);
    const countdown = controller.update(1, miniBoss, new THREE.Vector3(0, 0, 20), 24);

    expect(countdown.events).toEqual([]);
    const impact = controller.update(1, miniBoss, new THREE.Vector3(0, 0, 20), 24);
    expect(impact.events[0]).toMatchObject({
      type: 'impact',
      target: expect.objectContaining({ x: 0, z: 5 }),
    });
    expect(impact.damage).toBe(0);
  });

  it('keeps the rectangle direction fixed when the player moves during the warning', () => {
    const controller = new MiniBossSkillController(() => 0.999999);

    controller.update(5, miniBoss, player);
    expect(controller.update(1, miniBoss, new THREE.Vector3(10, 0, 0), 24).events).toEqual([]);
    const impact = controller.update(1, miniBoss, new THREE.Vector3(10, 0, 0), 24);
    expect(impact.events[0]).toMatchObject({
      type: 'impact',
      skill: 'rectangle',
      target: expect.objectContaining({ x: 0, z: 5 }),
    });
    expect(impact.damage).toBe(0);
  });

  it.each([
    [0, 'circle', 36],
    [0.999999, 'rectangle', 36],
  ] as const)('applies the approved damage for %s', (random, skill, damage) => {
    expect(trigger(random)).toMatchObject({ skill, damage });
  });

  it('covers the circle edge but rejects positions outside its 8.75 meter radius', () => {
    expect(trigger(0, new THREE.Vector3(0, 0, 13.74)).damage).toBe(36);
    expect(trigger(0, new THREE.Vector3(0, 0, 13.76)).damage).toBe(0);
  });

  it('covers the oriented 60 by 12 meter rectangle and rejects its outside edge', () => {
    expect(trigger(0.999999, new THREE.Vector3(5.99, 0, 59.99)).damage).toBe(36);
    expect(trigger(0.999999, new THREE.Vector3(6.01, 0, 30)).damage).toBe(0);
    expect(trigger(0.999999, new THREE.Vector3(0, 0, 60.01)).damage).toBe(0);
  });

  it('does not repeat the previous skill immediately', () => {
    const controller = new MiniBossSkillController(() => 0);

    expect(controller.update(5, miniBoss, player).events[0].skill).toBe('circle');
    controller.update(2, miniBoss, player, 24);
    expect(controller.update(5, miniBoss, player).events[0].skill).toBe('rectangle');
  });

  it('keeps timers and event state independent for separate mini-boss controllers', () => {
    const first = new MiniBossSkillController(() => 0);
    const second = new MiniBossSkillController(() => 0.999999);

    first.update(5, miniBoss, player);
    expect(second.update(1, miniBoss, player).events).toEqual([]);
    expect(second.restRemaining).toBe(4);
    expect(first.phase).toBe('telegraph');
    expect(second.phase).toBe('resting');
  });

  it('reset cancels the current warning and restores the initial rest', () => {
    const controller = new MiniBossSkillController(() => 0);
    controller.update(5, miniBoss, player);

    controller.reset();

    expect(controller.phase).toBe('resting');
    expect(controller.restRemaining).toBe(5);
    expect(controller.update(0, miniBoss, player).events).toEqual([]);
  });
});
