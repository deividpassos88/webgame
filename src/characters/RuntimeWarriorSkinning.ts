import * as THREE from 'three';
import {
  type RuntimeDeformRegion,
  type RuntimeRigBoneId,
} from './RuntimeWarriorConfig';

export type { RuntimeDeformRegion, RuntimeRigBoneId } from './RuntimeWarriorConfig';

/** The skeleton and the indices used by generated runtime geometry. */
export interface RuntimeWarriorRig {
  readonly skeleton: THREE.Skeleton;
  readonly bones: ReadonlyMap<RuntimeRigBoneId, THREE.Bone>;
  readonly boneIndices: ReadonlyMap<RuntimeRigBoneId, number>;
}

const REQUIRED_RIG_BONES: readonly RuntimeRigBoneId[] = [
  'hips',
  'spine',
  'spine1',
  'spine2',
  'neck',
  'head',
  'leftUpperArm',
  'leftForeArm',
  'leftHand',
  'rightUpperArm',
  'rightForeArm',
  'rightHand',
  'leftUpLeg',
  'leftLeg',
  'leftFoot',
  'rightUpLeg',
  'rightLeg',
  'rightFoot',
];

const REQUIRED_RIG_BONE_LABELS: Readonly<Record<RuntimeRigBoneId, string>> = {
  hips: 'Hips',
  spine: 'Spine',
  spine1: 'Spine1',
  spine2: 'Spine2',
  neck: 'Neck',
  head: 'Head',
  leftUpperArm: 'LeftUpperArm',
  leftForeArm: 'LeftForeArm',
  leftHand: 'LeftHand',
  rightUpperArm: 'RightUpperArm',
  rightForeArm: 'RightForeArm',
  rightHand: 'RightHand',
  leftUpLeg: 'LeftUpLeg',
  leftLeg: 'LeftLeg',
  leftFoot: 'LeftFoot',
  rightUpLeg: 'RightUpLeg',
  rightLeg: 'RightLeg',
  rightFoot: 'RightFoot',
};

/** Only these nearby bones are considered for each deformable region. */
const REGION_CANDIDATES: Readonly<Record<RuntimeDeformRegion, readonly RuntimeRigBoneId[]>> = {
  head: ['neck', 'head'],
  torso: ['hips', 'spine', 'spine1', 'spine2', 'neck'],
  leftArm: ['spine2', 'leftUpperArm', 'leftForeArm', 'leftHand'],
  rightArm: ['spine2', 'rightUpperArm', 'rightForeArm', 'rightHand'],
  leftLeg: ['hips', 'leftUpLeg', 'leftLeg', 'leftFoot'],
  rightLeg: ['hips', 'rightUpLeg', 'rightLeg', 'rightFoot'],
};

// These are model-unit radii for the smallest expected warrior.  Segment
// length also contributes, so the overlap remains useful for custom scales.
const REGION_MIN_RADIUS: Readonly<Record<RuntimeDeformRegion, number>> = {
  head: 0.16,
  torso: 0.20,
  leftArm: 0.24,
  rightArm: 0.24,
  leftLeg: 0.24,
  rightLeg: 0.24,
};

const MIXAMO_PREFIX = 'mixamorig';
const MINIMUM_WEIGHT = 0.001;
const ATTRIBUTE_SUM_EPSILON = 0.0001;

interface RigContext {
  readonly source: THREE.SkinnedMesh;
}

interface SegmentData {
  readonly skeletonIndex: number;
  readonly startX: number;
  readonly startY: number;
  readonly startZ: number;
  readonly endX: number;
  readonly endY: number;
  readonly endZ: number;
  readonly radius: number;
}

function isBoneObject(object: THREE.Object3D | null | undefined): object is THREE.Bone {
  return object !== null && object !== undefined && (object as THREE.Bone).isBone === true;
}

// A manually assembled RuntimeWarriorRig is useful in tests and callers may
// construct one without a source mesh.  In that case bone matrixWorld is
// already treated as model-local.  Resolved rigs retain the source to account
// for a transformed SkinnedMesh.
const rigContexts = new WeakMap<RuntimeWarriorRig, RigContext>();
const geometryBoneCountMarkers = new WeakMap<THREE.BufferGeometry, number>();

/** Normalize both `mixamorig:RightHand` and `mixamorigRightHand` spellings. */
export function normalizeRigBoneName(name: string): string {
  return name.normalize('NFKC').replace(/[:_\-\s]/g, '').toLowerCase();
}

function normalizedBoneLabel(id: RuntimeRigBoneId): string {
  return normalizeRigBoneName(REQUIRED_RIG_BONE_LABELS[id]);
}

function findRuntimeBoneId(name: string): RuntimeRigBoneId | undefined {
  const normalized = normalizeRigBoneName(name);
  const withoutMixamoPrefix = normalized.startsWith(MIXAMO_PREFIX)
    ? normalized.slice(MIXAMO_PREFIX.length)
    : normalized;

  for (let index = 0; index < REQUIRED_RIG_BONES.length; index += 1) {
    const id = REQUIRED_RIG_BONES[index];
    const label = normalizedBoneLabel(id);
    if (normalized === `${MIXAMO_PREFIX}${label}` || normalized === label || withoutMixamoPrefix === label) {
      return id;
    }
  }
  return undefined;
}

function assertSkeletonShape(source: THREE.SkinnedMesh): THREE.Skeleton {
  if (!source || source.isSkinnedMesh !== true) {
    throw new Error('Runtime warrior rig source must be a THREE.SkinnedMesh');
  }
  const skeleton = source.skeleton;
  if (!skeleton || !Array.isArray(skeleton.bones)) {
    throw new Error('Runtime warrior SkinnedMesh has no valid skeleton');
  }
  return skeleton;
}

/**
 * Resolve the required runtime bones before generated geometry is attached.
 * Unknown helper/deformation bones remain in the source skeleton, while the
 * returned maps expose only the stable IDs consumed by runtime geometry.
 */
export function resolveRuntimeWarriorRig(source: THREE.SkinnedMesh): RuntimeWarriorRig {
  const skeleton = assertSkeletonShape(source);
  const resolvedBones = new Map<RuntimeRigBoneId, THREE.Bone>();
  const resolvedIndices = new Map<RuntimeRigBoneId, number>();

  const sourceBones = skeleton.bones;
  for (let sourceIndex = 0; sourceIndex < sourceBones.length; sourceIndex += 1) {
    const bone = sourceBones[sourceIndex];
    if (!bone || bone.isBone !== true) continue;
    const id = findRuntimeBoneId(bone.name);
    if (id === undefined || resolvedBones.has(id)) continue;
    resolvedBones.set(id, bone);
    resolvedIndices.set(id, sourceIndex);
  }

  // Complete validation happens before returning a rig, so callers cannot
  // accidentally hide the source mesh and only discover a missing joint later.
  for (let index = 0; index < REQUIRED_RIG_BONES.length; index += 1) {
    const id = REQUIRED_RIG_BONES[index];
    if (!resolvedBones.has(id)) {
      throw new Error(`Runtime warrior rig is missing required bone ${REQUIRED_RIG_BONE_LABELS[id]}`);
    }
  }

  source.updateMatrixWorld(true);
  const rig: RuntimeWarriorRig = {
    skeleton,
    bones: resolvedBones,
    boneIndices: resolvedIndices,
  };
  rigContexts.set(rig, { source });
  return rig;
}

function assertRuntimeRig(rig: RuntimeWarriorRig): void {
  if (!rig || !rig.skeleton || !Array.isArray(rig.skeleton.bones) || !rig.bones || !rig.boneIndices) {
    throw new Error('Runtime warrior rig is not valid');
  }

  for (let index = 0; index < REQUIRED_RIG_BONES.length; index += 1) {
    const id = REQUIRED_RIG_BONES[index];
    const bone = rig.bones.get(id);
    const skeletonIndex = rig.boneIndices.get(id);
    if (!bone || skeletonIndex === undefined || rig.skeleton.bones[skeletonIndex] !== bone) {
      throw new Error(`Runtime warrior rig is missing required bone ${REQUIRED_RIG_BONE_LABELS[id]}`);
    }
    if (!Number.isInteger(skeletonIndex) || skeletonIndex < 0 || skeletonIndex > 0xffff) {
      throw new Error(`Runtime warrior rig bone index is not representable: ${REQUIRED_RIG_BONE_LABELS[id]}`);
    }
  }
}

function firstBoneChild(bone: THREE.Bone): THREE.Bone | null {
  for (let index = 0; index < bone.children.length; index += 1) {
    const child = bone.children[index] as THREE.Bone;
    if (child.isBone === true) return child;
  }
  return null;
}

function modelInverseForRig(rig: RuntimeWarriorRig): THREE.Matrix4 {
  const context = rigContexts.get(rig);
  if (context) {
    context.source.updateMatrixWorld(true);
    return new THREE.Matrix4().copy(context.source.matrixWorld).invert();
  }

  // For a hand-built rig, use the non-bone parent of its first root as the
  // model frame when one exists; otherwise matrixWorld is already local.
  const skeletonBones = rig.skeleton.bones;
  for (let index = 0; index < skeletonBones.length; index += 1) {
    const candidate = skeletonBones[index];
    if (!candidate || isBoneObject(candidate.parent)) continue;
    candidate.updateMatrixWorld(true);
    if (candidate.parent) return new THREE.Matrix4().copy(candidate.parent.matrixWorld).invert();
    break;
  }
  return new THREE.Matrix4();
}

function transformPoint(
  matrix: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  target: Float64Array,
  targetIndex: number
): void {
  const elements = matrix.elements;
  const transformedX = elements[0] * x + elements[4] * y + elements[8] * z + elements[12];
  const transformedY = elements[1] * x + elements[5] * y + elements[9] * z + elements[13];
  const transformedZ = elements[2] * x + elements[6] * y + elements[10] * z + elements[14];
  target[targetIndex] = transformedX;
  target[targetIndex + 1] = transformedY;
  target[targetIndex + 2] = transformedZ;
}

function buildCandidateSegments(
  region: RuntimeDeformRegion,
  rig: RuntimeWarriorRig,
  modelInverse: THREE.Matrix4,
  sourceFrameCorrection: THREE.Matrix4,
  proximityRadiusScale: number
): SegmentData[] {
  const candidates = REGION_CANDIDATES[region];
  if (!candidates) throw new Error(`Unknown runtime deform region: ${String(region)}`);

  const segmentStarts = new Float64Array(candidates.length * 3);
  const segmentEnds = new Float64Array(candidates.length * 3);
  const segments: SegmentData[] = [];
  const minimumRadius = REGION_MIN_RADIUS[region];

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidateId = candidates[candidateIndex];
    const bone = rig.bones.get(candidateId);
    const skeletonIndex = rig.boneIndices.get(candidateId);
    if (!bone || skeletonIndex === undefined) {
      throw new Error(`Runtime warrior rig is missing required bone ${REQUIRED_RIG_BONE_LABELS[candidateId]}`);
    }

    const baseElements = bone.matrixWorld.elements;
    const baseX = baseElements[12];
    const baseY = baseElements[13];
    const baseZ = baseElements[14];
    if (!Number.isFinite(baseX) || !Number.isFinite(baseY) || !Number.isFinite(baseZ)) {
      throw new Error(`Runtime warrior bone has a non-finite transform: ${REQUIRED_RIG_BONE_LABELS[candidateId]}`);
    }

    const child = firstBoneChild(bone);
    let tipX: number;
    let tipY: number;
    let tipZ: number;
    if (child) {
      const childElements = child.matrixWorld.elements;
      tipX = childElements[12];
      tipY = childElements[13];
      tipZ = childElements[14];
    } else {
      const parent = isBoneObject(bone.parent) ? bone.parent : null;
      let directionX = 0;
      let directionY = 1;
      let directionZ = 0;
      if (parent) {
        const parentElements = parent.matrixWorld.elements;
        directionX = baseX - parentElements[12];
        directionY = baseY - parentElements[13];
        directionZ = baseZ - parentElements[14];
      } else {
        directionX = baseElements[4];
        directionY = baseElements[5];
        directionZ = baseElements[6];
      }
      const directionLength = Math.hypot(directionX, directionY, directionZ);
      const fallbackLength = Math.max(minimumRadius, 0.1);
      if (directionLength > 1e-8) {
        tipX = baseX + directionX * fallbackLength / directionLength;
        tipY = baseY + directionY * fallbackLength / directionLength;
        tipZ = baseZ + directionZ * fallbackLength / directionLength;
      } else {
        tipX = baseX;
        tipY = baseY + fallbackLength;
        tipZ = baseZ;
      }
    }

    if (!Number.isFinite(tipX) || !Number.isFinite(tipY) || !Number.isFinite(tipZ)) {
      throw new Error(`Runtime warrior bone has a non-finite endpoint: ${REQUIRED_RIG_BONE_LABELS[candidateId]}`);
    }

    const targetOffset = candidateIndex * 3;
    transformPoint(modelInverse, baseX, baseY, baseZ, segmentStarts, targetOffset);
    transformPoint(modelInverse, tipX, tipY, tipZ, segmentEnds, targetOffset);
    const modelStartX = segmentStarts[targetOffset];
    const modelStartY = segmentStarts[targetOffset + 1];
    const modelStartZ = segmentStarts[targetOffset + 2];
    const modelEndX = segmentEnds[targetOffset];
    const modelEndY = segmentEnds[targetOffset + 1];
    const modelEndZ = segmentEnds[targetOffset + 2];
    transformPoint(
      sourceFrameCorrection,
      modelStartX,
      modelStartY,
      modelStartZ,
      segmentStarts,
      targetOffset
    );
    transformPoint(
      sourceFrameCorrection,
      modelEndX,
      modelEndY,
      modelEndZ,
      segmentEnds,
      targetOffset
    );
    const correctedStartX = segmentStarts[targetOffset];
    const correctedStartY = segmentStarts[targetOffset + 1];
    const correctedStartZ = segmentStarts[targetOffset + 2];
    const correctedEndX = segmentEnds[targetOffset];
    const correctedEndY = segmentEnds[targetOffset + 1];
    const correctedEndZ = segmentEnds[targetOffset + 2];
    const segmentLength = Math.hypot(
      correctedEndX - correctedStartX,
      correctedEndY - correctedStartY,
      correctedEndZ - correctedStartZ
    );
    if (!Number.isFinite(segmentLength)) {
      throw new Error(`Runtime warrior bone has a non-finite local segment: ${REQUIRED_RIG_BONE_LABELS[candidateId]}`);
    }
    segments.push({
      skeletonIndex,
      startX: correctedStartX,
      startY: correctedStartY,
      startZ: correctedStartZ,
      endX: correctedEndX,
      endY: correctedEndY,
      endZ: correctedEndZ,
      radius: Math.max(minimumRadius * proximityRadiusScale, segmentLength * 1.1),
    });
  }

  return segments;
}

/**
 * Blender/Mixamo exports may use a corrective Hips rotation while retaining
 * mesh vertices in an upright source frame. Candidate joint endpoints need
 * that inverse local rotation before they can be compared to mesh positions.
 * Translation is deliberately excluded: a translated root is a real mesh
 * placement and must not be erased.
 */
function sourceFrameCorrectionForRig(rig: RuntimeWarriorRig): THREE.Matrix4 {
  const hips = rig.bones.get('hips');
  if (!hips) throw new Error('Runtime warrior rig is missing required bone Hips');
  hips.updateMatrix();
  return new THREE.Matrix4().extractRotation(hips.matrix).invert();
}

function proximityRadiusScaleForGeometry(geometry: THREE.BufferGeometry): number {
  const candidate = geometry.userData.runtimeWarriorProximityRadiusScale;
  if (candidate === undefined) return 1;
  if (!Number.isFinite(candidate) || candidate < 1 || candidate > 3) {
    throw new Error('Runtime warrior geometry has an invalid proximity radius scale');
  }
  return candidate;
}

function pointSegmentDistanceSquared(
  pointX: number,
  pointY: number,
  pointZ: number,
  segment: SegmentData
): number {
  const directionX = segment.endX - segment.startX;
  const directionY = segment.endY - segment.startY;
  const directionZ = segment.endZ - segment.startZ;
  const lengthSquared = directionX * directionX + directionY * directionY + directionZ * directionZ;
  let projection = 0;
  if (lengthSquared > 1e-16) {
    projection = (
      (pointX - segment.startX) * directionX
      + (pointY - segment.startY) * directionY
      + (pointZ - segment.startZ) * directionZ
    ) / lengthSquared;
    projection = Math.max(0, Math.min(1, projection));
  }
  const nearestX = segment.startX + directionX * projection;
  const nearestY = segment.startY + directionY * projection;
  const nearestZ = segment.startZ + directionZ * projection;
  const deltaX = pointX - nearestX;
  const deltaY = pointY - nearestY;
  const deltaZ = pointZ - nearestZ;
  return deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
}

/**
 * Generate stable four-slot skin attributes from distance to nearby bone
 * segments.  All temporary arrays are allocated once per geometry, outside
 * the vertex loop, so the hot path only performs scalar arithmetic.
 */
export function applyProximitySkinning(
  geometry: THREE.BufferGeometry,
  region: RuntimeDeformRegion,
  rig: RuntimeWarriorRig
): void {
  assertRuntimeRig(rig);
  if (!geometry || !(geometry instanceof THREE.BufferGeometry)) {
    throw new Error('Runtime warrior skinning requires a THREE.BufferGeometry');
  }
  const position = geometry.getAttribute('position');
  if (!position || position.itemSize < 3) {
    throw new Error('Runtime warrior geometry requires a position attribute with three components');
  }
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    for (let component = 0; component < 3; component += 1) {
      if (!Number.isFinite(position.getComponent(vertex, component))) {
        throw new Error('Runtime warrior geometry position contains a non-finite value');
      }
    }
  }

  const modelInverse = modelInverseForRig(rig);
  // A resolved source has already updated its hierarchy.  A manually built
  // rig may not, so updating each root here keeps matrixWorld deterministic.
  for (let boneIndex = 0; boneIndex < rig.skeleton.bones.length; boneIndex += 1) {
    const bone = rig.skeleton.bones[boneIndex];
    if (!isBoneObject(bone.parent)) bone.updateMatrixWorld(true);
  }
  const sourceFrameCorrection = sourceFrameCorrectionForRig(rig);
  const segments = buildCandidateSegments(
    region,
    rig,
    modelInverse,
    sourceFrameCorrection,
    proximityRadiusScaleForGeometry(geometry)
  );
  const vertexCount = position.count;
  const skinIndexValues = new Uint16Array(vertexCount * 4);
  const skinWeightValues = new Float32Array(vertexCount * 4);
  const topIndices = new Int32Array(4);
  const topWeights = new Float64Array(4);

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const pointX = position.getX(vertex);
    const pointY = position.getY(vertex);
    const pointZ = position.getZ(vertex);
    topIndices[0] = 0;
    topIndices[1] = 0;
    topIndices[2] = 0;
    topIndices[3] = 0;
    topWeights[0] = 0;
    topWeights[1] = 0;
    topWeights[2] = 0;
    topWeights[3] = 0;
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
      const segment = segments[segmentIndex];
      const distanceSquared = pointSegmentDistanceSquared(pointX, pointY, pointZ, segment);
      const distance = Math.sqrt(distanceSquared);
      const falloff = Math.max(0, 1 - distance / segment.radius);
      const weight = falloff * falloff;
      if (weight < MINIMUM_WEIGHT) continue;

      let insertAt = 0;
      while (insertAt < 4 && weight <= topWeights[insertAt]) insertAt += 1;
      if (insertAt >= 4) continue;
      for (let slot = 3; slot > insertAt; slot -= 1) {
        topIndices[slot] = topIndices[slot - 1];
        topWeights[slot] = topWeights[slot - 1];
      }
      topIndices[insertAt] = segment.skeletonIndex;
      topWeights[insertAt] = weight;
    }

    const totalWeight = topWeights[0] + topWeights[1] + topWeights[2] + topWeights[3];
    if (!(totalWeight > 0) || !Number.isFinite(totalWeight)) {
      throw new Error(`Runtime warrior vertex has no influence above cutoff at vertex ${vertex}`);
    }

    const attributeOffset = vertex * 4;
    const inverseTotalWeight = 1 / totalWeight;
    for (let slot = 0; slot < 4; slot += 1) {
      skinIndexValues[attributeOffset + slot] = topIndices[slot];
      skinWeightValues[attributeOffset + slot] = topWeights[slot] * inverseTotalWeight;
    }
  }

  // Attach only after all source/radius/vertex calculations have succeeded.
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndexValues, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeightValues, 4));
  geometryBoneCountMarkers.set(geometry, rig.skeleton.bones.length);
  try {
    validateSkinAttributes(geometry, rig.skeleton);
  } catch (error) {
    geometry.deleteAttribute('skinIndex');
    geometry.deleteAttribute('skinWeight');
    geometryBoneCountMarkers.delete(geometry);
    throw error;
  }
}

/** Validate the generated skin contract, optionally against an explicit skeleton. */
export function validateSkinAttributes(
  geometry: THREE.BufferGeometry,
  skeleton?: THREE.Skeleton
): void {
  if (!geometry || !(geometry instanceof THREE.BufferGeometry)) {
    throw new Error('Runtime warrior skin validation requires a THREE.BufferGeometry');
  }
  const position = geometry.getAttribute('position');
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  if (!position) throw new Error('Runtime warrior geometry is missing position attribute');
  if (!skinIndex) throw new Error('Runtime warrior geometry is missing skinIndex attribute');
  if (!skinWeight) throw new Error('Runtime warrior geometry is missing skinWeight attribute');
  if (skinIndex.itemSize !== 4) throw new Error('Runtime warrior skinIndex must have four slots');
  if (skinWeight.itemSize !== 4) throw new Error('Runtime warrior skinWeight must have four slots');
  if (skinIndex.count !== position.count || skinWeight.count !== position.count) {
    throw new Error('Runtime warrior skin attributes must match position count');
  }

  const markerValue = geometryBoneCountMarkers.get(geometry);
  const boneCount = skeleton?.bones.length ?? markerValue;
  if (typeof boneCount !== 'number' || !Number.isInteger(boneCount) || boneCount <= 0) {
    throw new Error('Runtime warrior skin validation requires a real skeleton or an apply-generated bone-count marker');
  }

  for (let vertex = 0; vertex < position.count; vertex += 1) {
    let totalWeight = 0;
    let activeInfluences = 0;
    for (let slot = 0; slot < 4; slot += 1) {
      const index = skinIndex.getComponent(vertex, slot);
      const weight = skinWeight.getComponent(vertex, slot);
      if (!Number.isFinite(index) || !Number.isInteger(index) || index < 0 || index >= boneCount) {
        throw new Error(`Runtime warrior skinIndex is outside the skeleton at vertex ${vertex}`);
      }
      if (!Number.isFinite(weight)) {
        throw new Error(`Runtime warrior skinWeight must be finite at vertex ${vertex}`);
      }
      if (weight < 0) {
        throw new Error(`Runtime warrior skinWeight cannot be negative at vertex ${vertex}`);
      }
      if (weight > 0) activeInfluences += 1;
      totalWeight += weight;
    }
    if (activeInfluences > 4) {
      throw new Error(`Runtime warrior vertex has more than four active influences at vertex ${vertex}`);
    }
    if (!Number.isFinite(totalWeight) || Math.abs(totalWeight - 1) > ATTRIBUTE_SUM_EPSILON) {
      throw new Error(`Runtime warrior skin weights must sum to one at vertex ${vertex}`);
    }
  }
}
