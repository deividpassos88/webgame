import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { RuntimeWarriorMaterialLibrary } from './RuntimeWarriorMaterials';
import type { RuntimeWarriorVisual } from './RuntimeWarriorFactory';
import {
  validateRuntimeWarriorBudget,
  type RuntimeWarriorBudgetReport,
} from './RuntimeWarriorBudget';

const MATERIAL_ROLES = [
  'skin',
  'eye',
  'hair',
  'cloth',
  'leather',
  'steel',
  'darkMetal',
] as const;

function oneTriangleGeometry(weightSlots = 4): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      0, 0, 0,
      0.1, 0, 0,
      0, 0.1, 0,
    ], 3)
  );
  geometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(
      Array.from(
        { length: 3 * weightSlots },
        (_, index) => weightSlots > 4 ? 1 / weightSlots : index % weightSlots === 0 ? 1 : 0
      ),
      weightSlots
    )
  );
  geometry.setIndex([0, 1, 2]);
  return geometry;
}

function fakeVisual(
  overrides: Partial<{
    triangles: number;
    drawCalls: number;
    completeDrawCalls: number;
    materialRoles: readonly string[];
    weightSlots: number;
  }> = {}
): RuntimeWarriorVisual {
  const root = new THREE.Group();
  const roles = overrides.materialRoles ?? MATERIAL_ROLES;
  for (const role of roles) {
    const mesh = new THREE.Mesh(
      oneTriangleGeometry(overrides.weightSlots ?? 4),
      new THREE.MeshBasicMaterial()
    );
    mesh.userData.runtimeWarriorMaterialRole = role;
    root.add(mesh);
  }

  return {
    root,
    triangleCount: overrides.triangles ?? 15_000,
    drawCallCount: overrides.drawCalls ?? roles.length,
    completeDrawCallCount: overrides.completeDrawCalls ?? (overrides.drawCalls ?? roles.length) + 1,
    budget: Object.freeze({
      triangles: overrides.triangles ?? 15_000,
      drawCalls: overrides.completeDrawCalls ?? (overrides.drawCalls ?? roles.length) + 1,
      materialRoles: roles.length,
      maxInfluences: overrides.weightSlots ?? 4,
    }),
    materials: {} as RuntimeWarriorMaterialLibrary,
    swordTrailAnchor: new THREE.Group(),
    swordBladeLength: 1,
    setRuntimeSwordEquipped: () => undefined,
    dispose: () => undefined,
  };
}

describe('validateRuntimeWarriorBudget', () => {
  it('reports the complete equipped allowance as a frozen report for a valid visual', () => {
    const report = validateRuntimeWarriorBudget(fakeVisual());

    expect(report).toEqual<RuntimeWarriorBudgetReport>({
      triangles: 15_000,
      drawCalls: 8,
      materialRoles: 7,
      maxInfluences: 1,
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.keys(report)).toEqual([
      'triangles',
      'drawCalls',
      'materialRoles',
      'maxInfluences',
    ]);
  });

  it('rejects triangle and draw-call values beyond the desktop budget', () => {
    expect(() => validateRuntimeWarriorBudget(
      fakeVisual({ triangles: 18_001 })
    )).toThrow(/triangles/i);
    expect(() => validateRuntimeWarriorBudget(
      fakeVisual({ triangles: 18_000, drawCalls: 9 })
    )).toThrow(/draw calls/i);
  });

  it('rejects a visual without exactly the seven approved material roles', () => {
    expect(() => validateRuntimeWarriorBudget(
      fakeVisual({ materialRoles: MATERIAL_ROLES.slice(0, 6) })
    )).toThrow(/material roles/i);
    expect(() => validateRuntimeWarriorBudget(
      fakeVisual({ materialRoles: [...MATERIAL_ROLES.slice(0, 6), 'invalid'] })
    )).toThrow(/material role/i);
  });

  it('rejects more than four meaningful skin-weight influences', () => {
    expect(() => validateRuntimeWarriorBudget(
      fakeVisual({ weightSlots: 5 })
    )).toThrow(/influences/i);
  });
});
