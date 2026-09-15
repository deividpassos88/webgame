import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARCHER_CLIP_NAMES, EnemyAnimationController } from './EnemyAnimationController';

function modelWithHips(): THREE.Group {
  const model = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'Hips';
  model.add(hips);
  return model;
}

function clip(
  name: string,
  duration = 1,
  values = [0, 0, 0, 2, 3, 4]
): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, [
    new THREE.VectorKeyframeTrack(
      'Hips.position',
      [0, duration],
      values
    ),
  ]);
}

describe('EnemyAnimationController clip fallbacks', () => {
  it('falls back from missing idle to Walking while keeping the public state idle', () => {
    const controller = new EnemyAnimationController(modelWithHips(), [clip('Walking')]);

    expect(controller.state).toBe('idle');
    expect(controller.activeClipName).toBe('Walking');
  });

  it('falls back from missing idle to Running when Walking is unavailable', () => {
    const controller = new EnemyAnimationController(modelWithHips(), [clip('Running')]);

    expect(controller.state).toBe('idle');
    expect(controller.activeClipName).toBe('Running');
  });

  it('exposes the native source clip name for the active action', () => {
    const controller = new EnemyAnimationController(modelWithHips(), [clip('Walking')]);

    controller.play('walking');

    expect(controller.activeClipName).toBe('Walking');
  });

  it('matches locomotion playback to the configured world-speed multiplier', () => {
    const controller = new EnemyAnimationController(
      modelWithHips(),
      [clip('Running')],
      2.12
    );

    controller.play('running');

    expect(controller.activeTimeScale).toBeCloseTo(2.12, 5);
  });

  it('removes forward root motion before trimming the repeated loop pose', () => {
    const running = new THREE.AnimationClip('Running', 1, [
      new THREE.VectorKeyframeTrack(
        'Hips.position',
        [0, 0.5, 1],
        [0, 0, 0, 1, 0, 0, 2, 0, 0]
      ),
    ]);
    const controller = new EnemyAnimationController(modelWithHips(), [running]);

    controller.play('running');
    const action = (controller as unknown as {
      currentAction: THREE.AnimationAction | null;
    }).currentAction;

    expect(action?.getClip().duration).toBeCloseTo(0.5, 5);
    expect(Array.from(action?.getClip().tracks[0].times ?? [])).toEqual([0, 0.5]);
  });

  it('reuses a single exported slash for every attack', () => {
    const controller = new EnemyAnimationController(modelWithHips(), [clip('Charged_Slash', 2)]);

    expect(controller.playNextAttack()).toBe('attack-primary');
    expect(controller.playNextAttack()).toBe('attack-primary');
  });

  it('reuses the secondary slash when it is the only exported attack', () => {
    const controller = new EnemyAnimationController(
      modelWithHips(),
      [clip('Charged_Upward_Slash', 2)]
    );

    expect(controller.playNextAttack()).toBe('attack-secondary');
    expect(controller.playNextAttack()).toBe('attack-secondary');
  });

  it('returns to the last locomotion action when a requested locomotion clip is missing', () => {
    const controller = new EnemyAnimationController(modelWithHips(), [
      clip('Walking'),
      clip('Charged_Slash', 2),
    ]);

    expect(controller.playNextAttack()).toBe('attack-primary');
    expect(controller.play('running')).toBe(true);
    expect(controller.state).toBe('idle');
    expect(controller.activeClipName).toBe('Walking');
  });

  it('stops the previous action when death has no exported clip', () => {
    const controller = new EnemyAnimationController(modelWithHips(), [
      clip('Walking'),
      clip('Charged_Slash', 2),
    ]);

    expect(controller.playNextAttack()).toBe('attack-primary');
    expect(controller.playDeath()).toBe(0);
    expect(controller.state).toBe('dead');
    expect(controller.activeClipName).toBeNull();
    expect((controller as unknown as {
      currentAction: THREE.AnimationAction | null;
    }).currentAction).toBeNull();
  });

  it('anchors attack root motion to the resolved idle fallback X/Z', () => {
    const controller = new EnemyAnimationController(modelWithHips(), [
      clip('Walking', 1, [7, 3, -11, 9, 4, -13]),
      clip('Charged_Slash', 1, [23, 5, 19, 29, 6, 31]),
    ]);

    expect(controller.playNextAttack()).toBe('attack-primary');
    const action = (controller as unknown as {
      currentAction: THREE.AnimationAction | null;
    }).currentAction;
    const rootTrack = action?.getClip().tracks.find((track) => track.name === 'Hips.position');

    expect(Array.from(rootTrack?.values ?? [])).toEqual([7, 5, -11, 7, 6, -11]);
  });

  it('returns zero death delay when dying_backwards is not exported', () => {
    const controller = new EnemyAnimationController(modelWithHips(), [clip('Walking')]);

    expect(controller.playDeath()).toBe(0);
  });

  it('locks the archer root Y motion so its animation stays grounded', () => {
    const controller = new EnemyAnimationController(
      modelWithHips(),
      [clip('idle', 1, [0, 3, 0, 0, 7, 0])],
      1,
      ARCHER_CLIP_NAMES,
      'archer',
      ['x', 'y', 'z']
    );
    const action = (controller as unknown as {
      currentAction: THREE.AnimationAction | null;
    }).currentAction;
    const rootTrack = action?.getClip().tracks.find((track) => track.name === 'Hips.position');

    expect(Array.from(rootTrack?.values ?? [])).toEqual([0, 3, 0, 0, 3, 0]);
  });
});
