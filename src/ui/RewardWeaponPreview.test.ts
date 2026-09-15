import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RewardWeaponPreview } from './RewardWeaponPreview';

function fixture(reducedMotion = false, fail?: 'axe') {
  const renders: number[] = [];
  const disposed: number[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  const fallbacks = { sword: { hidden: true }, axe: { hidden: true } };
  let nextFrame = 1;
  const preview = new RewardWeaponPreview(
    {
      createWeapon(id) {
        if (id === fail) throw new Error('preview failed');
        const group = new THREE.Group();
        group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.2), new THREE.MeshStandardMaterial()));
        return group;
      },
    },
    {
      canvasFor: () => ({ clientWidth: 320, clientHeight: 180 } as HTMLCanvasElement),
      fallbackFor: (id) => fallbacks[id] as HTMLElement,
      reducedMotion: () => reducedMotion,
      createRenderer: () => {
        const index = renders.length;
        renders.push(0);
        disposed.push(0);
        return {
          setPixelRatio() {}, setSize() {},
          render() { renders[index] += 1; },
          dispose() { disposed[index] += 1; },
        };
      },
      scheduleFrame: (callback) => {
        const id = nextFrame++;
        frames.set(id, callback);
        return id;
      },
      cancelFrame: (id) => { frames.delete(id); },
    }
  );
  return { preview, renders, disposed, frames, fallbacks };
}

describe('RewardWeaponPreview', () => {
  it('renders two real model scenes and stops scheduling when hidden', () => {
    const f = fixture();
    f.preview.show({ sword: true, axe: true });
    expect(f.renders).toEqual([1, 1]);
    expect(f.frames.size).toBe(1);
    const [id, callback] = [...f.frames][0];
    f.frames.delete(id);
    callback(16);
    expect(f.renders).toEqual([2, 2]);
    f.preview.hide();
    expect(f.frames.size).toBe(0);
  });

  it('renders still frames without scheduling under reduced motion', () => {
    const f = fixture(true);
    f.preview.show({ sword: true, axe: true });
    expect(f.renders).toEqual([1, 1]);
    expect(f.frames.size).toBe(0);
  });

  it('shows a per-card fallback and disposes successful contexts', () => {
    const f = fixture(false, 'axe');
    f.preview.show({ sword: true, axe: true });
    expect(f.fallbacks.sword.hidden).toBe(true);
    expect(f.fallbacks.axe.hidden).toBe(false);
    f.preview.dispose();
    expect(f.disposed).toEqual([1]);
  });
});
