import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS,
  RUNTIME_WARRIOR_BUDGET,
} from './RuntimeWarriorConfig';
import { createRuntimeWarriorPartGeometries } from './RuntimeWarriorGeometry';

function describeRuntimeParts(
  parts: ReturnType<typeof createRuntimeWarriorPartGeometries>
): Array<{
  id: string;
  materialRole: string;
  deformRegion: string | null;
  rigidBone: string | null;
  vertexCount: number;
  indexCount: number;
  position: number[];
  normal: number[];
  uv: number[];
  index: number[];
}> {
  return parts.map((part) => ({
    id: part.id,
    materialRole: part.materialRole,
    deformRegion: part.deformRegion,
    rigidBone: part.rigidBone,
    vertexCount: part.geometry.getAttribute('position').count,
    indexCount: part.geometry.getIndex()?.count ?? 0,
    position: Array.from(part.geometry.getAttribute('position').array),
    normal: Array.from(part.geometry.getAttribute('normal').array),
    uv: Array.from(part.geometry.getAttribute('uv').array),
    index: Array.from(part.geometry.getIndex()?.array ?? []),
  }));
}

function runtimeTriangleCount(
  parts: ReturnType<typeof createRuntimeWarriorPartGeometries>
): number {
  return parts.reduce((sum, part) => sum + (part.geometry.getIndex()?.count ?? 0) / 3, 0);
}

describe('createRuntimeWarriorPartGeometries', () => {
  it('creates the same finite indexed warrior topology from the same measurements', () => {
    const first = createRuntimeWarriorPartGeometries(DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS);
    const second = createRuntimeWarriorPartGeometries(DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS);

    expect(describeRuntimeParts(first)).toEqual(describeRuntimeParts(second));
    for (const part of first) {
      const position = part.geometry.getAttribute('position');
      const normal = part.geometry.getAttribute('normal');
      const uv = part.geometry.getAttribute('uv');
      const index = part.geometry.getIndex();
      expect(position.count).toBeGreaterThan(0);
      expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(normal.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(uv.array).every(Number.isFinite)).toBe(true);
      expect(normal.count).toBe(position.count);
      expect(uv.count).toBe(position.count);
      expect(index).not.toBeNull();
      expect(index!.count % 3).toBe(0);
      expect(Array.from(index!.array).every((value) => Number.isInteger(value) && value >= 0 && value < position.count)).toBe(true);
      expect(part.geometry.boundingBox).not.toBeNull();
      expect(part.geometry.boundingSphere).not.toBeNull();
      expect(part.geometry.boundingBox!.min.toArray().every(Number.isFinite)).toBe(true);
      expect(part.geometry.boundingBox!.max.toArray().every(Number.isFinite)).toBe(true);
      expect(part.geometry.boundingSphere!.center.toArray().every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(part.geometry.boundingSphere!.radius)).toBe(true);
      expect(part.geometry.boundingSphere!.radius).toBeGreaterThan(0);
    }
  });

  it('keeps body, clothing and armour within the WebGL triangle budget', () => {
    const parts = createRuntimeWarriorPartGeometries(DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS);

    expect(runtimeTriangleCount(parts)).toBeGreaterThanOrEqual(RUNTIME_WARRIOR_BUDGET.minTriangles);
    expect(runtimeTriangleCount(parts)).toBeLessThanOrEqual(RUNTIME_WARRIOR_BUDGET.maxTriangles);
    expect(new Set(parts.map((part) => part.materialRole)).size).toBe(7);
  });

  it('keeps revolution faces oriented outwards for the body surface', () => {
    const body = createRuntimeWarriorPartGeometries(DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS)
      .find((part) => part.id === 'RuntimeWarrior_Body');
    expect(body).toBeDefined();
    const position = body!.geometry.getAttribute('position');
    const normal = body!.geometry.getAttribute('normal');
    // The first profile/segment is the +X side of the local body frame.
    expect(position.getX(0)).toBeGreaterThan(0);
    expect(Math.abs(position.getZ(0))).toBeLessThan(1e-6);
    expect(normal.getX(0)).toBeGreaterThan(0);
  });

  it('keeps attributes finite when callers provide extreme positive measurements', () => {
    const parts = createRuntimeWarriorPartGeometries({
      ...DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS,
      height: Number.MAX_VALUE,
      chestWidth: Number.MAX_VALUE,
      chestDepth: Number.MAX_VALUE,
      headWidth: Number.MAX_VALUE,
    });

    for (const part of parts) {
      for (const attributeName of ['position', 'normal', 'uv'] as const) {
        expect(Array.from(part.geometry.getAttribute(attributeName).array).every(Number.isFinite)).toBe(true);
      }
      expect(part.geometry.boundingBox!.min.toArray().every(Number.isFinite)).toBe(true);
      expect(part.geometry.boundingBox!.max.toArray().every(Number.isFinite)).toBe(true);
      expect(part.geometry.boundingSphere!.center.toArray().every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(part.geometry.boundingSphere!.radius)).toBe(true);
    }
  });

  it('emits all required material roles and named body layers without a sword', () => {
    const parts = createRuntimeWarriorPartGeometries(DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS);
    expect(new Set(parts.map((part) => part.materialRole))).toEqual(new Set([
      'skin', 'eye', 'hair', 'cloth', 'leather', 'steel', 'darkMetal',
    ]));
    const ids = new Set(parts.map((part) => part.id));
    for (const id of [
      'RuntimeWarrior_Body', 'RuntimeWarrior_Head', 'RuntimeWarrior_Nose',
      'RuntimeWarrior_LeftHand', 'RuntimeWarrior_RightHand',
      'RuntimeWarrior_Tunic', 'RuntimeWarrior_LeftPants', 'RuntimeWarrior_RightPants',
      'RuntimeWarrior_Belt', 'RuntimeWarrior_LeftBracer', 'RuntimeWarrior_RightBracer',
      'RuntimeWarrior_Breastplate', 'RuntimeWarrior_LeftPauldron', 'RuntimeWarrior_RightPauldron',
      'RuntimeWarrior_LeftGreave', 'RuntimeWarrior_RightGreave', 'RuntimeWarrior_Scabbard',
    ]) {
      expect(ids).toContain(id);
    }
    expect(parts.some((part) => /sword/i.test(part.id))).toBe(false);
  });
});
