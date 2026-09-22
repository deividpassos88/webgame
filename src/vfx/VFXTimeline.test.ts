import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VFXTimeline } from './VFXTimeline';

describe('VFXTimeline', () => {
  it('fires normalized events from the AnimationAction time instead of timers', () => {
    const root = new THREE.Group();
    const mixer = new THREE.AnimationMixer(root);
    const clip = new THREE.AnimationClip('attack', 2, [
      new THREE.NumberKeyframeTrack('.visible', [0, 2], [1, 1]),
    ]);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();

    const fired: string[] = [];
    const timeline = new VFXTimeline(action, [
      { at: 0.25, name: 'charge' },
      { at: 0.5, name: 'launch' },
    ]);

    mixer.update(0.49);
    timeline.update((name) => fired.push(name));
    expect(fired).toEqual([]);

    mixer.update(0.02);
    timeline.update((name) => fired.push(name));
    expect(fired).toEqual(['charge']);

    action.setEffectiveTimeScale(2);
    mixer.update(0.25);
    timeline.update((name) => fired.push(name));
    expect(fired).toEqual(['charge', 'launch']);
  });
});
