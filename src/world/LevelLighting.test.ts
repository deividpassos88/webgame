import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Level } from './Level';

const originalDocument = globalThis.document;

beforeEach(() => {
  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
  };
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => context,
    }),
  } as unknown as Document;
});

afterEach(() => {
  globalThis.document = originalDocument;
});

describe('Level torch lighting', () => {
  it('keeps four visible point lights while reassigning them to nearby torches', () => {
    const level = new Level();
    const lights = level.group.children.filter(
      (child): child is THREE.PointLight => child instanceof THREE.PointLight
    );

    expect(lights).toHaveLength(4);
    expect(lights.every((light) => light.visible)).toBe(true);

    level.update(0, new THREE.Vector3(0, 0, 0));
    expect(lights.every((light) => light.intensity === 0)).toBe(true);

    level.update(0, new THREE.Vector3(-23.4, 0, -7.9));
    expect(lights.map((light) => [light.position.x, light.position.z])).toEqual([
      [-24.3, -12],
      [-20.3, -4],
      [-24.3, 12],
      [-12, -24.3],
    ]);
    expect(lights.every((light) => light.intensity > 0)).toBe(true);

    level.update(1, new THREE.Vector3(23.4, 0, 7.9));
    expect(lights).toHaveLength(4);
    expect(lights.every((light) => light.visible)).toBe(true);
  });
});
