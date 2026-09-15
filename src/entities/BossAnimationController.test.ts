import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BossAnimationController } from './BossAnimationController';

function clips(): THREE.AnimationClip[] {
  return [
    new THREE.AnimationClip('idle', 2, []),
    new THREE.AnimationClip('walking', 1.5, []),
    new THREE.AnimationClip('running', 1, []),
    new THREE.AnimationClip('attack_meteors', 2.7, []),
    new THREE.AnimationClip('attack_dash', 1.1, []),
    new THREE.AnimationClip('death', 4.6, []),
    new THREE.AnimationClip('jump_circle', 0.6, []),
    new THREE.AnimationClip('jump_rectangle', 4, []),
  ];
}

function duplicatedWalkingLoop(): THREE.AnimationClip {
  return new THREE.AnimationClip('walking', 1, [
    new THREE.VectorKeyframeTrack(
      'Hips.position',
      [0, 0.5, 1],
      [0, 3, -88, 0, 100, -88, 0, 192, -88]
    ),
  ]);
}

describe('BossAnimationController', () => {
  it('maps idle and walking locomotion to the named boss clips', () => {
    const controller = new BossAnimationController(new THREE.Group(), clips());

    expect(controller.activeClipName).toBe('idle');
    expect(controller.play('walking')).toBe(true);
    expect(controller.activeClipName).toBe('walking');
    expect(controller.activeTimeScale).toBe(1);
    expect(controller.play('idle')).toBe(true);
    expect(controller.activeClipName).toBe('idle');
  });

  it('removes forward root motion before trimming the repeated walking pose', () => {
    const controller = new BossAnimationController(
      new THREE.Group(),
      clips().filter(({ name }) => name !== 'walking').concat(duplicatedWalkingLoop())
    );

    controller.play('walking');
    const action = (controller as unknown as {
      currentAction: THREE.AnimationAction | null;
    }).currentAction;

    expect(action?.getClip().duration).toBeCloseTo(0.5, 5);
    expect(Array.from(action?.getClip().tracks[0].values ?? [])).toEqual([
      0, 3, -88,
      0, 3, -88,
    ]);
  });

  it('delays the short circle jump so it lands when the 4.2 second warning ends', () => {
    const controller = new BossAnimationController(new THREE.Group(), clips());

    expect(controller.scheduleSkill('circle', 4.2)).toBe(true);
    expect(controller.activeClipName).toBe('idle');
    controller.update(3.6);
    expect(controller.activeClipName).toBe('jump_circle');
    expect(controller.activeTimeScale).toBe(1);
    expect(controller.play('running')).toBe(false);
  });

  it('fits the long rectangle jump into its 3.5 second warning', () => {
    const controller = new BossAnimationController(new THREE.Group(), clips());

    expect(controller.scheduleSkill('rectangle', 3.5)).toBe(true);
    expect(controller.activeClipName).toBe('jump_rectangle');
    expect(controller.activeTimeScale).toBeCloseTo(4 / 3.5, 5);
  });

  it.each([
    ['circle', 'jump_circle'],
    ['rectangle', 'jump_rectangle'],
    ['meteors', 'attack_meteors'],
  ] as const)('maps %s to %s', (skill, clipName) => {
    const controller = new BossAnimationController(new THREE.Group(), clips());

    expect(controller.scheduleSkill(skill, 0)).toBe(true);
    expect(controller.activeClipName).toBe(clipName);
  });

  it('alternates both claw attacks when the player is in melee range', () => {
    const controller = new BossAnimationController(new THREE.Group(), clips());

    controller.playNextAttack();
    expect(controller.activeClipName).toBe('attack_meteors');
    controller.update(1.4);
    controller.playNextAttack();
    expect(controller.activeClipName).toBe('attack_dash');
  });

  it('plays one complete approach jump and blocks locomotion until it ends', () => {
    const controller = new BossAnimationController(new THREE.Group(), clips());

    expect(controller.playApproachJump()).toBe(0.6);
    expect(controller.activeClipName).toBe('jump_circle');
    expect(controller.play('running')).toBe(false);
    controller.update(0.6);
    expect(controller.play('running')).toBe(true);
  });

  it('death cancels scheduled skills and cannot be interrupted', () => {
    const controller = new BossAnimationController(new THREE.Group(), clips());
    controller.scheduleSkill('circle', 4.2);

    expect(controller.playDeath()).toBe(4.6);
    expect(controller.activeClipName).toBe('death');
    expect(controller.play('running')).toBe(false);
    controller.update(5);
    expect(controller.activeClipName).toBe('death');
  });
});
