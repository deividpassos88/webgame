import * as THREE from 'three';
import {
  DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS,
  RUNTIME_WARRIOR_CANONICAL_HIP_Y,
  RUNTIME_WARRIOR_BUDGET,
  type RuntimeMaterialRole,
  type RuntimeWarriorPartGeometry,
} from './RuntimeWarriorConfig';
import { createRuntimeWarriorPartGeometries } from './RuntimeWarriorGeometry';
import {
  getRuntimeWarriorMaterials,
  type RuntimeWarriorMaterialLibrary,
} from './RuntimeWarriorMaterials';
import {
  applyProximitySkinning,
  normalizeRigBoneName,
  resolveRuntimeWarriorRig,
  validateSkinAttributes,
  type RuntimeWarriorRig,
} from './RuntimeWarriorSkinning';
import {
  validateRuntimeWarriorBudget,
  type RuntimeWarriorBudgetReport,
} from './RuntimeWarriorBudget';
import {
  createMountedRuntimeWarriorSwordGeometry,
  createRuntimeWarriorSwordTrailAnchor,
  RUNTIME_WARRIOR_MOUNTED_SWORD_BLADE_LENGTH,
} from './RuntimeWarriorWeapon';
import { Logger } from '../utils/Logger';

/** The seven material buckets are also the hard upper bound for generated meshes. */
const MATERIAL_ROLES: readonly RuntimeMaterialRole[] = [
  'skin',
  'eye',
  'hair',
  'cloth',
  'leather',
  'steel',
  'darkMetal',
];

interface GeometryAccumulator {
  readonly role: RuntimeMaterialRole;
  readonly firstPartId: string;
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly skinIndices: number[];
  readonly skinWeights: number[];
  readonly swordVisibility: number[];
  readonly indices: number[];
  vertexCount: number;
}

interface OriginalVisibility {
  readonly mesh: THREE.SkinnedMesh;
  readonly visible: boolean;
}

interface RuntimeSourceFit {
  readonly transform: THREE.Matrix4;
  readonly proximityRadiusScale: number;
}

export interface RuntimeWarriorVisual {
  readonly root: THREE.Group;
  readonly triangleCount: number;
  /** Current generated role meshes; this deliberately excludes the trail. */
  readonly drawCallCount: number;
  /**
   * Worst-case runtime combat allowance: the seven generated role meshes plus
   * the one preallocated sword-trail mesh. This never counts the separate
   * fallback weapon group.
   */
  readonly completeDrawCallCount: number;
  readonly budget: RuntimeWarriorBudgetReport;
  readonly materials: RuntimeWarriorMaterialLibrary;
  /** Non-renderable right-hand child used by the one existing SwordTrail mesh. */
  readonly swordTrailAnchor: THREE.Group;
  /** World-space rest length of the compact mounted blade. */
  readonly swordBladeLength: number;
  /** Changes the cached dark-metal shader uniform without creating a Mesh. */
  setRuntimeSwordEquipped(equipped: boolean): void;
  dispose(): void;
}

export type RuntimeWarriorMountResult =
  | { readonly kind: 'mounted'; readonly visual: RuntimeWarriorVisual }
  | { readonly kind: 'fallback'; readonly reason: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sourceSkinnedMeshes(model: THREE.Group): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  model.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh === true) {
      meshes.push(object as THREE.SkinnedMesh);
    }
  });
  return meshes;
}

function firstValidSource(meshes: readonly THREE.SkinnedMesh[]): THREE.SkinnedMesh {
  for (const mesh of meshes) {
    if (mesh.skeleton && Array.isArray(mesh.skeleton.bones)) return mesh;
  }
  throw new Error('Runtime warrior model has no valid SkinnedMesh source');
}

/**
 * Some Mixamo exports call the upper-arm joints `LeftArm`/`RightArm` instead
 * of `LeftUpperArm`/`RightUpperArm`.  Resolve that spelling without leaving a
 * name mutation behind: animation tracks still target the original names.
 */
function resolveRigWithMixamoAliases(source: THREE.SkinnedMesh): RuntimeWarriorRig {
  const aliases = [
    ['mixamorigleftupperarm', 'mixamorigleftarm'],
    ['mixamorigrightupperarm', 'mixamorigrightarm'],
  ] as const;
  const names = new Set(source.skeleton.bones.map((bone) => normalizeRigBoneName(bone.name)));
  const renamed: Array<{ readonly bone: THREE.Bone; readonly name: string }> = [];

  for (const [canonical, alias] of aliases) {
    if (names.has(canonical) || !names.has(alias)) continue;
    const bone = source.skeleton.bones.find(
      (candidate) => normalizeRigBoneName(candidate.name) === alias
    );
    if (!bone) continue;
    renamed.push({ bone, name: bone.name });
    bone.name = canonical.startsWith('mixamorig')
      ? `mixamorig:${canonical.slice('mixamorig'.length)}`
      : canonical;
  }

  try {
    return resolveRuntimeWarriorRig(source);
  } finally {
    for (const entry of renamed) entry.bone.name = entry.name;
  }
}

function ensureFiniteAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  name: string,
  expectedItemSize: number,
  expectedCount: number
): void {
  if (attribute.itemSize !== expectedItemSize) {
    throw new Error(`Runtime warrior ${name} must have ${expectedItemSize} components`);
  }
  if (attribute.count !== expectedCount) {
    throw new Error(`Runtime warrior ${name} count must match position count`);
  }
  for (let vertex = 0; vertex < attribute.count; vertex += 1) {
    for (let component = 0; component < attribute.itemSize; component += 1) {
      if (!Number.isFinite(attribute.getComponent(vertex, component))) {
        throw new Error(`Runtime warrior ${name} contains a non-finite value`);
      }
    }
  }
}

function attributeOrThrow(
  geometry: THREE.BufferGeometry,
  name: string
): THREE.BufferAttribute | THREE.InterleavedBufferAttribute {
  const attribute = geometry.getAttribute(name) as
    | THREE.BufferAttribute
    | THREE.InterleavedBufferAttribute
    | undefined;
  if (!attribute) throw new Error(`Runtime warrior geometry is missing ${name} attribute`);
  return attribute;
}

function createAccumulator(role: RuntimeMaterialRole, firstPartId: string): GeometryAccumulator {
  return {
    role,
    firstPartId,
    positions: [],
    normals: [],
    uvs: [],
    skinIndices: [],
    skinWeights: [],
    swordVisibility: [],
    indices: [],
    vertexCount: 0,
  };
}

function appendPartGeometry(
  accumulator: GeometryAccumulator,
  part: RuntimeWarriorPartGeometry,
  swordVisibility = 0
): void {
  if (!Number.isFinite(swordVisibility) || swordVisibility < 0 || swordVisibility > 1) {
    throw new Error(`Runtime warrior part ${part.id} has an invalid sword visibility value`);
  }
  const geometry = part.geometry;
  const position = attributeOrThrow(geometry, 'position');
  const normal = attributeOrThrow(geometry, 'normal');
  const uv = attributeOrThrow(geometry, 'uv');
  const skinIndex = attributeOrThrow(geometry, 'skinIndex');
  const skinWeight = attributeOrThrow(geometry, 'skinWeight');

  ensureFiniteAttribute(position, 'position', 3, position.count);
  ensureFiniteAttribute(normal, 'normal', 3, position.count);
  ensureFiniteAttribute(uv, 'uv', 2, position.count);
  ensureFiniteAttribute(skinIndex, 'skinIndex', 4, position.count);
  ensureFiniteAttribute(skinWeight, 'skinWeight', 4, position.count);

  const index = geometry.getIndex();
  if (!index) throw new Error(`Runtime warrior part ${part.id} is missing an index`);
  if (index.itemSize !== 1) {
    throw new Error(`Runtime warrior part ${part.id} index must have one component`);
  }
  if (index.count === 0 || index.count % 3 !== 0) {
    throw new Error(`Runtime warrior part ${part.id} has an invalid triangle index count`);
  }

  const vertexOffset = accumulator.vertexCount;
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    for (let component = 0; component < 3; component += 1) {
      accumulator.positions.push(position.getComponent(vertex, component));
      accumulator.normals.push(normal.getComponent(vertex, component));
    }
    for (let component = 0; component < 2; component += 1) {
      accumulator.uvs.push(uv.getComponent(vertex, component));
    }
    for (let component = 0; component < 4; component += 1) {
      const indexValue = skinIndex.getComponent(vertex, component);
      const weightValue = skinWeight.getComponent(vertex, component);
      if (!Number.isInteger(indexValue) || indexValue < 0 || indexValue > 0xffff) {
        throw new Error(`Runtime warrior part ${part.id} has an invalid skin index`);
      }
      if (weightValue < 0) {
        throw new Error(`Runtime warrior part ${part.id} has a negative skin weight`);
      }
      accumulator.skinIndices.push(indexValue);
      accumulator.skinWeights.push(weightValue);
    }
    if (accumulator.role === 'darkMetal') accumulator.swordVisibility.push(swordVisibility);
  }

  for (let indexPosition = 0; indexPosition < index.count; indexPosition += 1) {
    const localIndex = index.getX(indexPosition);
    if (!Number.isInteger(localIndex) || localIndex < 0 || localIndex >= position.count) {
      throw new Error(`Runtime warrior part ${part.id} has an invalid triangle index`);
    }
    accumulator.indices.push(vertexOffset + localIndex);
  }
  accumulator.vertexCount += position.count;
}

function mergeAccumulator(accumulator: GeometryAccumulator): THREE.BufferGeometry {
  if (accumulator.vertexCount === 0 || accumulator.indices.length === 0) {
    throw new Error(`Runtime warrior material role ${accumulator.role} has no geometry`);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(accumulator.positions, 3)
  );
  if (accumulator.role === 'darkMetal') {
    geometry.setAttribute(
      'runtimeWarriorSwordVisibility',
      new THREE.Float32BufferAttribute(accumulator.swordVisibility, 1)
    );
  }
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(accumulator.normals, 3)
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(accumulator.uvs, 2));
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(new Uint16Array(accumulator.skinIndices), 4)
  );
  geometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(accumulator.skinWeights, 4)
  );

  const maxIndex = accumulator.indices.reduce(
    (maximum, value) => Math.max(maximum, value),
    0
  );
  if (maxIndex > 0xffff) {
    geometry.setIndex(new THREE.Uint32BufferAttribute(new Uint32Array(accumulator.indices), 1));
  } else {
    geometry.setIndex(new THREE.Uint16BufferAttribute(new Uint16Array(accumulator.indices), 1));
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function installRigidSkinning(
  geometry: THREE.BufferGeometry,
  boneIndex: number,
  skeleton: THREE.Skeleton
): void {
  if (!Number.isInteger(boneIndex) || boneIndex < 0 || boneIndex >= skeleton.bones.length) {
    throw new Error(`Runtime warrior rigid bone index is outside the source skeleton: ${boneIndex}`);
  }
  const position = attributeOrThrow(geometry, 'position');
  const indices = new Uint16Array(position.count * 4);
  const weights = new Float32Array(position.count * 4);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    indices[vertex * 4] = boneIndex;
    weights[vertex * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  validateSkinAttributes(geometry, skeleton);
}

function validateMergedGeometry(
  geometry: THREE.BufferGeometry,
  skeleton: THREE.Skeleton,
  role: RuntimeMaterialRole
): number {
  const position = attributeOrThrow(geometry, 'position');
  const normal = attributeOrThrow(geometry, 'normal');
  const uv = attributeOrThrow(geometry, 'uv');
  const skinIndex = attributeOrThrow(geometry, 'skinIndex');
  const skinWeight = attributeOrThrow(geometry, 'skinWeight');
  ensureFiniteAttribute(position, `${role} position`, 3, position.count);
  ensureFiniteAttribute(normal, `${role} normal`, 3, position.count);
  ensureFiniteAttribute(uv, `${role} uv`, 2, position.count);
  ensureFiniteAttribute(skinIndex, `${role} skinIndex`, 4, position.count);
  ensureFiniteAttribute(skinWeight, `${role} skinWeight`, 4, position.count);
  if (role === 'darkMetal') {
    const swordVisibility = attributeOrThrow(geometry, 'runtimeWarriorSwordVisibility');
    ensureFiniteAttribute(swordVisibility, `${role} sword visibility`, 1, position.count);
    for (let vertex = 0; vertex < swordVisibility.count; vertex += 1) {
      const value = swordVisibility.getX(vertex);
      if (value < 0 || value > 1) {
        throw new Error('Runtime warrior darkMetal sword visibility must stay between zero and one');
      }
    }
  }

  const index = geometry.getIndex();
  if (!index || index.count === 0 || index.count % 3 !== 0) {
    throw new Error(`Runtime warrior ${role} geometry has an invalid index`);
  }
  if (index.itemSize !== 1) {
    throw new Error(`Runtime warrior ${role} index must have one component`);
  }
  for (let indexPosition = 0; indexPosition < index.count; indexPosition += 1) {
    const value = index.getX(indexPosition);
    if (!Number.isInteger(value) || value < 0 || value >= position.count) {
      throw new Error(`Runtime warrior ${role} geometry has an invalid index value`);
    }
  }
  validateSkinAttributes(geometry, skeleton);
  if (!geometry.boundingBox || !geometry.boundingSphere) {
    throw new Error(`Runtime warrior ${role} geometry has no bounds`);
  }
  if (
    !geometry.boundingBox.min.toArray().every(Number.isFinite) ||
    !geometry.boundingBox.max.toArray().every(Number.isFinite) ||
    !geometry.boundingSphere.center.toArray().every(Number.isFinite) ||
    !Number.isFinite(geometry.boundingSphere.radius)
  ) {
    throw new Error(`Runtime warrior ${role} geometry has non-finite bounds`);
  }
  return index.count / 3;
}

function disposeGeometries(geometries: Iterable<THREE.BufferGeometry>): void {
  for (const geometry of geometries) geometry.dispose();
}

function safeLogFallback(reason: string, error: unknown): void {
  try {
    Logger.warn('RuntimeWarriorFactory', `Fallback seguro: ${reason}`, error);
  } catch {
    // Logging must never turn a visual fallback into a render-loop exception.
  }
}

function sourceSpacePoint(
  sourceInverse: THREE.Matrix4,
  orientationCorrection: THREE.Matrix4,
  bone: THREE.Bone
): THREE.Vector3 {
  return new THREE.Vector3()
    .setFromMatrixPosition(bone.matrixWorld)
    .applyMatrix4(sourceInverse)
    .applyMatrix4(orientationCorrection);
}

/**
 * Imported GLB rigs may have a scaled/axis-corrected Hips root while the
 * procedural measurements are authored in canonical metres. Fit the new
 * vertices into that source rest frame before proximity weighting. The root
 * transform still carries the source mesh frame, so this is a construction
 * step rather than a frame-loop adjustment.
 */
function deriveRuntimeSourceFit(
  source: THREE.SkinnedMesh,
  rig: RuntimeWarriorRig
): RuntimeSourceFit {
  source.updateMatrixWorld(true);
  for (const bone of rig.skeleton.bones) {
    if (!(bone.parent as THREE.Bone | null)?.isBone) bone.updateMatrixWorld(true);
  }
  const hips = rig.bones.get('hips');
  const leftFoot = rig.bones.get('leftFoot');
  const rightFoot = rig.bones.get('rightFoot');
  if (!hips || !leftFoot || !rightFoot) {
    throw new Error('Runtime warrior rig is missing a source-fit landmark');
  }

  hips.updateMatrix();
  const sourceInverse = new THREE.Matrix4().copy(source.matrixWorld).invert();
  const orientationCorrection = new THREE.Matrix4().extractRotation(hips.matrix).invert();
  const hipsLocalRotation = new THREE.Quaternion().setFromRotationMatrix(hips.matrix);
  // Fixtures and conventional exports already share the procedural upright
  // frame. Only an explicit root-axis correction needs the landmark fit.
  if (hipsLocalRotation.angleTo(new THREE.Quaternion()) < 0.0001) {
    return { transform: new THREE.Matrix4(), proximityRadiusScale: 1 };
  }
  const hip = sourceSpacePoint(sourceInverse, orientationCorrection, hips);
  const left = sourceSpacePoint(sourceInverse, orientationCorrection, leftFoot);
  const right = sourceSpacePoint(sourceInverse, orientationCorrection, rightFoot);
  const footY = (left.y + right.y) * 0.5;
  const canonicalFloorY = Math.max(
    0.025,
    DEFAULT_RUNTIME_WARRIOR_MEASUREMENTS.height * 0.02
  );
  const canonicalLegSpan = RUNTIME_WARRIOR_CANONICAL_HIP_Y - canonicalFloorY;
  const sourceLegSpan = hip.y - footY;
  if (!Number.isFinite(sourceLegSpan) || sourceLegSpan <= 0.0001) {
    throw new Error('Runtime warrior rig has an invalid source-fit leg span');
  }
  const scale = THREE.MathUtils.clamp(sourceLegSpan / canonicalLegSpan, 0.2, 2);
  const xSign = right.x >= hip.x ? 1 : -1;
  const transform = new THREE.Matrix4().makeScale(xSign * scale, scale, scale);
  transform.setPosition(hip.x, footY - canonicalFloorY * scale, hip.z);
  return {
    transform,
    // The imported corrective-root rig is more compact than canonical metre
    // measurements. Expand only its construction-time candidate envelopes;
    // the normal cutoff still rejects distant malformed vertices.
    proximityRadiusScale: THREE.MathUtils.clamp(1 / scale, 1, 3),
  };
}

function applyRuntimeSourceFit(
  parts: readonly RuntimeWarriorPartGeometry[],
  fit: RuntimeSourceFit
): void {
  for (const part of parts) {
    part.geometry.applyMatrix4(fit.transform);
    part.geometry.userData.runtimeWarriorProximityRadiusScale = fit.proximityRadiusScale;
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();
  }
}

function generatedHandAnchor(
  parts: readonly RuntimeWarriorPartGeometry[],
  id: string
): THREE.Vector3 {
  const hand = parts.find((part) => part.id === id);
  if (!hand) throw new Error(`Runtime warrior generated hand is missing: ${id}`);
  if (!hand.geometry.boundingBox) hand.geometry.computeBoundingBox();
  if (!hand.geometry.boundingBox) {
    throw new Error(`Runtime warrior generated hand has no bounds: ${id}`);
  }
  return hand.geometry.boundingBox.getCenter(new THREE.Vector3());
}

/**
 * Build the runtime warrior off-graph and commit it only after all validation
 * has succeeded.  The source GLB remains the fallback visual on every error.
 */
export function mountRuntimeWarrior(model: THREE.Group): RuntimeWarriorMountResult {
  let temporaryRoot: THREE.Group | null = null;
  let runtimeGeometries = new Set<THREE.BufferGeometry>();
  let partGeometries = new Set<THREE.BufferGeometry>();
  let sourceMeshes: THREE.SkinnedMesh[] = [];
  let originalVisibility: OriginalVisibility[] = [];
  let swordTrailAnchor: THREE.Group | null = null;

  try {
    if (!model || model.isObject3D !== true) {
      throw new Error('Runtime warrior mount requires a THREE.Group model');
    }
    sourceMeshes = sourceSkinnedMeshes(model);
    if (sourceMeshes.length === 0) {
      throw new Error('Runtime warrior model has no SkinnedMesh source');
    }
    originalVisibility = sourceMeshes.map((mesh) => ({ mesh, visible: mesh.visible }));
    const source = firstValidSource(sourceMeshes);
    const rig = resolveRigWithMixamoAliases(source);
    const rightHand = rig.bones.get('rightHand');
    if (!rightHand) throw new Error('Runtime warrior rig is missing rightHand');
    model.updateMatrixWorld(true);
    source.updateMatrixWorld(true);
    // Runtime vertices and proximity endpoints are expressed in the source
    // SkinnedMesh local frame.  Carry that frame into the model parent so the
    // generated visual remains aligned under armature transforms.
    const sourceFrameRelativeToModel = new THREE.Matrix4()
      .copy(model.matrixWorld)
      .invert()
      .multiply(source.matrixWorld);
    const materials = getRuntimeWarriorMaterials();
    // The singleton dark-metal material may have been used by a previous
    // player. A fresh visual must start with its merged sword vertices hidden.
    materials.setRuntimeSwordEquipped(false);
    const parts = createRuntimeWarriorPartGeometries();
    if (parts.length === 0) throw new Error('Runtime warrior geometry factory returned no parts');
    applyRuntimeSourceFit(parts, deriveRuntimeSourceFit(source, rig));
    const rightHandAnchor = generatedHandAnchor(parts, 'RuntimeWarrior_RightHand');

    const grouped = new Map<RuntimeMaterialRole, GeometryAccumulator>();
    for (const part of parts) {
      partGeometries.add(part.geometry);
      try {
        if (part.deformRegion !== null) {
          applyProximitySkinning(part.geometry, part.deformRegion, rig);
        } else if (part.rigidBone !== null) {
          const boneIndex = rig.boneIndices.get(part.rigidBone);
          if (boneIndex === undefined) {
            throw new Error(`Runtime warrior rigid bone is missing: ${part.rigidBone}`);
          }
          installRigidSkinning(part.geometry, boneIndex, rig.skeleton);
        } else {
          throw new Error(`Runtime warrior part ${part.id} has no skinning assignment`);
        }
      } catch (error) {
        throw new Error(`Runtime warrior part ${part.id} skinning failed: ${errorMessage(error)}`);
      }

      let accumulator = grouped.get(part.materialRole);
      if (!accumulator) {
        accumulator = createAccumulator(part.materialRole, part.id);
        grouped.set(part.materialRole, accumulator);
      }
      appendPartGeometry(accumulator, part);
    }

    if (grouped.size !== RUNTIME_WARRIOR_BUDGET.materialRoles) {
      throw new Error(
        `Runtime warrior expected ${RUNTIME_WARRIOR_BUDGET.materialRoles} material roles, got ${grouped.size}`
      );
    }

    // This construction-only segment is expressed in the source mesh rest
    // frame, then rigidly skinned before it joins the existing dark-metal
    // accumulator. It cannot become an extra renderer object/draw call.
    const mountedSwordGeometry = createMountedRuntimeWarriorSwordGeometry(
      source,
      rightHand,
      rightHandAnchor
    );
    partGeometries.add(mountedSwordGeometry);
    const rightHandIndex = rig.boneIndices.get('rightHand');
    if (rightHandIndex === undefined) {
      throw new Error('Runtime warrior rigid sword bone is missing: rightHand');
    }
    installRigidSkinning(mountedSwordGeometry, rightHandIndex, rig.skeleton);
    const darkMetalAccumulator = grouped.get('darkMetal');
    if (!darkMetalAccumulator) {
      throw new Error('Runtime warrior material role is missing: darkMetal');
    }
    appendPartGeometry(
      darkMetalAccumulator,
      {
        id: 'RuntimeWarrior_MountedSword',
        materialRole: 'darkMetal',
        deformRegion: null,
        geometry: mountedSwordGeometry,
        rigidBone: 'rightHand',
      },
      1
    );

    temporaryRoot = new THREE.Group();
    temporaryRoot.name = 'RuntimeWarrior';
    temporaryRoot.matrixAutoUpdate = false;
    temporaryRoot.matrix.copy(sourceFrameRelativeToModel);
    temporaryRoot.matrixWorldNeedsUpdate = true;
    let triangleCount = 0;
    const generatedMeshes: THREE.SkinnedMesh[] = [];
    for (const role of MATERIAL_ROLES) {
      const accumulator = grouped.get(role);
      if (!accumulator) throw new Error(`Runtime warrior material role is missing: ${role}`);
      const geometry = mergeAccumulator(accumulator);
      runtimeGeometries.add(geometry);
      const material = materials.get(role);
      if (!material) throw new Error(`Runtime warrior material role is unavailable: ${role}`);
      const mesh = new THREE.SkinnedMesh(geometry, material);
      mesh.name = accumulator.firstPartId;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.runtimeWarriorMaterialRole = role;
      // Binding is completed while the temporary group is still off-graph;
      // source GLB meshes are hidden only after every role passes validation.
      mesh.bind(source.skeleton, source.bindMatrix);
      triangleCount += validateMergedGeometry(geometry, source.skeleton, role);
      generatedMeshes.push(mesh);
      temporaryRoot.add(mesh);
    }

    if (generatedMeshes.length > RUNTIME_WARRIOR_BUDGET.maxDrawCalls) {
      throw new Error(
        `Runtime warrior draw-call budget exceeded: ${generatedMeshes.length}`
      );
    }
    const completeDrawCallCount = generatedMeshes.length + 1;
    if (completeDrawCallCount > RUNTIME_WARRIOR_BUDGET.maxDrawCalls) {
      throw new Error(
        `Runtime warrior complete draw-call budget exceeded: ${completeDrawCallCount}`
      );
    }
    if (
      triangleCount < RUNTIME_WARRIOR_BUDGET.minTriangles ||
      triangleCount > RUNTIME_WARRIOR_BUDGET.maxTriangles
    ) {
      throw new Error(`Runtime warrior triangle budget exceeded: ${triangleCount}`);
    }
    if (generatedMeshes.some((mesh) => mesh.material !== materials.get(mesh.userData.runtimeWarriorMaterialRole))) {
      throw new Error('Runtime warrior generated mesh material does not match its role');
    }

    // Validate once at construction time.  The resulting report is cached on
    // the visual and forwarded by Player/Game; no frame-loop traversal is
    // needed for performance diagnostics.
    const budget = validateRuntimeWarriorBudget({
      root: temporaryRoot,
      triangleCount,
      drawCallCount: generatedMeshes.length,
      completeDrawCallCount,
      materials,
      dispose: () => undefined,
    } as RuntimeWarriorVisual);

    // Part geometries have been copied into role geometries and are no longer
    // owned by the visual instance.
    disposeGeometries(partGeometries);
    partGeometries = new Set<THREE.BufferGeometry>();

    swordTrailAnchor = createRuntimeWarriorSwordTrailAnchor(rightHandAnchor);
    model.add(temporaryRoot);
    model.updateMatrixWorld(true);
    // Begin aligned to the generated hand in the runtime root, then reparent
    // with world transform preserved so the non-renderable trail anchor
    // follows the shared animated hand bone without another draw call.
    temporaryRoot.add(swordTrailAnchor);
    model.updateMatrixWorld(true);
    rightHand.attach(swordTrailAnchor);
    for (const entry of originalVisibility) entry.mesh.visible = false;

    let disposed = false;
    const visualRoot = temporaryRoot;
    const runtimeSwordTrailAnchor = swordTrailAnchor;
    const visual: RuntimeWarriorVisual = {
      root: visualRoot,
      triangleCount,
      drawCallCount: generatedMeshes.length,
      completeDrawCallCount,
      budget,
      materials,
      swordTrailAnchor: runtimeSwordTrailAnchor,
      swordBladeLength: RUNTIME_WARRIOR_MOUNTED_SWORD_BLADE_LENGTH,
      setRuntimeSwordEquipped(equipped: boolean): void {
        if (disposed) return;
        materials.setRuntimeSwordEquipped(equipped);
      },
      dispose(): void {
        if (disposed) return;
        disposed = true;
        materials.setRuntimeSwordEquipped(false);
        runtimeSwordTrailAnchor.removeFromParent();
        visualRoot.removeFromParent();
        disposeGeometries(runtimeGeometries);
        visualRoot.clear();
        for (const entry of originalVisibility) entry.mesh.visible = entry.visible;
        runtimeGeometries = new Set<THREE.BufferGeometry>();
      },
    };
    return { kind: 'mounted', visual };
  } catch (error) {
    swordTrailAnchor?.removeFromParent();
    if (temporaryRoot) temporaryRoot.removeFromParent();
    if (temporaryRoot) temporaryRoot.clear();
    disposeGeometries(runtimeGeometries);
    disposeGeometries(partGeometries);
    for (const entry of originalVisibility) entry.mesh.visible = entry.visible;
    const reason = errorMessage(error);
    safeLogFallback(reason, error);
    return { kind: 'fallback', reason };
  }
}
