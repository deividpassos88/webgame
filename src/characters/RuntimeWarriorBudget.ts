import * as THREE from 'three';
import {
  RUNTIME_WARRIOR_BUDGET,
  type RuntimeMaterialRole,
} from './RuntimeWarriorConfig';
import type { RuntimeWarriorVisual } from './RuntimeWarriorFactory';

/** The material roles that are allowed in the generated warrior visual. */
const APPROVED_MATERIAL_ROLES: readonly RuntimeMaterialRole[] = [
  'skin',
  'eye',
  'hair',
  'cloth',
  'leather',
  'steel',
  'darkMetal',
];

function isApprovedMaterialRole(value: unknown): value is RuntimeMaterialRole {
  return typeof value === 'string' &&
    (APPROVED_MATERIAL_ROLES as readonly string[]).includes(value);
}

function finiteInteger(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`Runtime warrior budget ${label} must be a finite integer`);
  }
  return value;
}

function countMeaningfulInfluences(
  mesh: THREE.Mesh,
  minimumWeight: number
): number {
  const skinWeight = mesh.geometry.getAttribute('skinWeight') as
    | THREE.BufferAttribute
    | THREE.InterleavedBufferAttribute
    | undefined;
  if (!skinWeight) {
    throw new Error(
      `Runtime warrior budget mesh ${mesh.name || '(unnamed)'} is missing skinWeight`
    );
  }
  if (!Number.isInteger(skinWeight.itemSize) || skinWeight.itemSize <= 0) {
    throw new Error('Runtime warrior budget skinWeight has an invalid item size');
  }

  let maximum = 0;
  for (let vertex = 0; vertex < skinWeight.count; vertex += 1) {
    let active = 0;
    for (let slot = 0; slot < skinWeight.itemSize; slot += 1) {
      const weight = skinWeight.getComponent(vertex, slot);
      if (!Number.isFinite(weight) || weight < 0) {
        throw new Error('Runtime warrior budget skinWeight contains an invalid value');
      }
      if (weight >= minimumWeight) active += 1;
    }
    maximum = Math.max(maximum, active);
  }
  return maximum;
}

/**
 * Validate the construction-time limits for one generated warrior visual.
 * The returned object is frozen so callers can safely cache and forward it
 * through diagnostics without allowing later mutation.
 */
export function validateRuntimeWarriorBudget(
  visual: RuntimeWarriorVisual
): RuntimeWarriorBudgetReport {
  if (!visual || !visual.root || visual.root.isObject3D !== true) {
    throw new Error('Runtime warrior budget requires a valid visual root');
  }

  const triangles = finiteInteger(visual.triangleCount, 'triangles');
  if (
    triangles < RUNTIME_WARRIOR_BUDGET.minTriangles ||
    triangles > RUNTIME_WARRIOR_BUDGET.maxTriangles
  ) {
    throw new Error(
      `Runtime warrior budget triangles must be between ${RUNTIME_WARRIOR_BUDGET.minTriangles} ` +
      `and ${RUNTIME_WARRIOR_BUDGET.maxTriangles}; got ${triangles}`
    );
  }

  const generatedDrawCalls = finiteInteger(visual.drawCallCount, 'generated draw calls');
  if (
    generatedDrawCalls <= 0 ||
    generatedDrawCalls > RUNTIME_WARRIOR_BUDGET.materialRoles
  ) {
    throw new Error(
      `Runtime warrior budget generated draw calls must be between 1 and ` +
      `${RUNTIME_WARRIOR_BUDGET.materialRoles}; got ${generatedDrawCalls}`
    );
  }

  const roles = new Set<RuntimeMaterialRole>();
  let meshCount = 0;
  let maxInfluences = 0;
  visual.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    meshCount += 1;

    const role = mesh.userData?.runtimeWarriorMaterialRole;
    if (!isApprovedMaterialRole(role)) {
      throw new Error(
        `Runtime warrior budget contains an invalid material role: ${String(role)}`
      );
    }
    roles.add(role);
    maxInfluences = Math.max(
      maxInfluences,
      countMeaningfulInfluences(mesh, RUNTIME_WARRIOR_BUDGET.minimumWeight)
    );
  });

  const materialRoles = roles.size;
  if (materialRoles !== RUNTIME_WARRIOR_BUDGET.materialRoles) {
    throw new Error(
      `Runtime warrior budget material roles must be exactly ` +
      `${RUNTIME_WARRIOR_BUDGET.materialRoles}; got ${materialRoles}`
    );
  }
  if (meshCount !== RUNTIME_WARRIOR_BUDGET.materialRoles) {
    throw new Error(
      `Runtime warrior budget must contain exactly ${RUNTIME_WARRIOR_BUDGET.materialRoles} generated role meshes; got ${meshCount}`
    );
  }
  if (generatedDrawCalls !== meshCount) {
    throw new Error(
      `Runtime warrior budget generated draw calls must match generated meshes; ` +
      `got ${generatedDrawCalls} calls for ${meshCount} meshes`
    );
  }
  if (maxInfluences <= 0 || maxInfluences > RUNTIME_WARRIOR_BUDGET.maxInfluences) {
    throw new Error(
      `Runtime warrior budget influences must be between 1 and ` +
      `${RUNTIME_WARRIOR_BUDGET.maxInfluences}; got ${maxInfluences}`
    );
  }

  const completeDrawCalls = finiteInteger(
    visual.completeDrawCallCount,
    'complete draw calls'
  );
  if (
    completeDrawCalls !== generatedDrawCalls + 1 ||
    completeDrawCalls > RUNTIME_WARRIOR_BUDGET.maxDrawCalls
  ) {
    throw new Error(
      `Runtime warrior budget complete draw calls must reserve one active trail ` +
      `within ${RUNTIME_WARRIOR_BUDGET.maxDrawCalls}; got ${completeDrawCalls}`
    );
  }

  return Object.freeze({
    triangles,
    // The public report is intentionally the worst equipped state, not the
    // body-only count. `drawCallCount` remains the current generated mesh
    // count for renderer diagnostics.
    drawCalls: completeDrawCalls,
    materialRoles,
    maxInfluences,
  });
}

export interface RuntimeWarriorBudgetReport {
  readonly triangles: number;
  readonly drawCalls: number;
  readonly materialRoles: number;
  readonly maxInfluences: number;
}
