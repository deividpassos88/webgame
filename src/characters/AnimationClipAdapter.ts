import * as THREE from 'three';

export type RootMotionAxis = 'x' | 'y' | 'z';

export interface RotationRetargetOptions {
  sourceRestRotations: ReadonlyMap<string, THREE.Quaternion>;
  targetRestRotations: ReadonlyMap<string, THREE.Quaternion>;
}

const AXIS_INDEX: Record<RootMotionAxis, number> = {
  x: 0,
  y: 1,
  z: 2,
};

const ROOT_BONE_NAMES = new Set([
  'mixamorig:Hips',
  THREE.PropertyBinding.sanitizeNodeName('mixamorig:Hips'),
  'Hips',
]);

const LOOP_POSE_EPSILON = 1e-3;

export function trimDuplicatedLoopEndpoint(
  source: THREE.AnimationClip
): THREE.AnimationClip {
  const eligible = source.tracks.filter((track) => track.times.length >= 3);
  if (eligible.length === 0) return source;
  const duplicated = eligible.every((track) => {
    const valueSize = track.getValueSize();
    const lastOffset = track.values.length - valueSize;
    for (let component = 0; component < valueSize; component++) {
      if (
        Math.abs(track.values[component] - track.values[lastOffset + component])
        > LOOP_POSE_EPSILON
      ) {
        return false;
      }
    }
    return true;
  });
  if (!duplicated) return source;

  const trimmed = source.clone();
  const loopEnd = Math.min(
    ...eligible.map((track) => track.times[track.times.length - 2])
  );
  trimmed.tracks.forEach((track) => track.trim(0, loopEnd));
  trimmed.resetDuration();
  return trimmed;
}

function trackTargetName(trackName: string): string {
  const propertySeparator = trackName.lastIndexOf('.');
  return propertySeparator >= 0 ? trackName.slice(0, propertySeparator) : trackName;
}

function rootPositionTrack(clip: THREE.AnimationClip) {
  return clip.tracks.find(
    (track) =>
      track.name.endsWith('.position') &&
      ROOT_BONE_NAMES.has(trackTargetName(track.name)) &&
      track.getValueSize() === 3 &&
      track.values.length >= 3
  );
}

function restPositionForTrack(
  track: THREE.KeyframeTrack,
  restTranslations?: ReadonlyMap<string, THREE.Vector3>
): THREE.Vector3 | undefined {
  if (!restTranslations) return undefined;
  const target = trackTargetName(track.name);
  const exact = restTranslations.get(target);
  if (exact) return exact;
  for (const [name, position] of restTranslations) {
    if (THREE.PropertyBinding.sanitizeNodeName(name) === target) return position;
  }
  return undefined;
}

export function adaptRotationClip(
  clip: THREE.AnimationClip,
  allowedNodeNames: ReadonlySet<string>,
  newName: string,
  retarget?: RotationRetargetOptions
): THREE.AnimationClip {
  const tracks = clip.tracks
    .filter(
      (track) =>
        track.name.endsWith('.quaternion') &&
        allowedNodeNames.has(trackTargetName(track.name))
    )
    .map((track) => {
      const cloned = track.clone();
      const nodeName = trackTargetName(track.name);
      const sourceRest = retarget?.sourceRestRotations.get(nodeName);
      const targetRest = retarget?.targetRestRotations.get(nodeName);
      if (!sourceRest || !targetRest || cloned.getValueSize() !== 4) {
        return cloned;
      }

      const inverseSourceRest = sourceRest.clone().invert();
      const sourceFrame = new THREE.Quaternion();
      const delta = new THREE.Quaternion();
      const targetFrame = new THREE.Quaternion();
      for (let i = 0; i < cloned.values.length; i += 4) {
        sourceFrame.set(
          cloned.values[i],
          cloned.values[i + 1],
          cloned.values[i + 2],
          cloned.values[i + 3]
        );
        delta.copy(inverseSourceRest).multiply(sourceFrame);
        targetFrame.copy(targetRest).multiply(delta).normalize();
        targetFrame.toArray(cloned.values, i);
      }
      return cloned;
    });

  return new THREE.AnimationClip(newName, clip.duration, tracks, clip.blendMode);
}

export type LowerBodyStabilizer = ReadonlyMap<string, number>;

function stabilizerStrengthForTrack(
  target: string,
  strengths: LowerBodyStabilizer
): number | undefined {
  const exact = strengths.get(target);
  if (exact !== undefined) return exact;
  for (const [name, strength] of strengths) {
    if (THREE.PropertyBinding.sanitizeNodeName(name) === target) return strength;
  }
  return undefined;
}

function restRotationForTrack(
  target: string,
  track: THREE.KeyframeTrack,
  restRotations: ReadonlyMap<string, THREE.Quaternion>
): THREE.Quaternion {
  const exact = restRotations.get(target);
  if (exact) return exact;
  for (const [name, rotation] of restRotations) {
    if (THREE.PropertyBinding.sanitizeNodeName(name) === target) return rotation;
  }
  // Without a rest pose the joint still stops wobbling: it holds its own
  // first key instead of swinging through the authored range.
  return new THREE.Quaternion(
    track.values[0] ?? 0,
    track.values[1] ?? 0,
    track.values[2] ?? 0,
    track.values[3] ?? 1
  );
}

/**
 * Dampens lower-body joint motion toward the rest pose, for lobby idles whose
 * authored leg/foot sway reads as wobbling on a display dais. Strength 1
 * locks a joint fully to rest; 0 leaves it untouched. Only `.quaternion`
 * tracks of mapped bones are rewritten; every other track (hips, spine,
 * arms, head) and the source clip are left intact.
 */
export function stabilizeLowerBodyClip(
  clip: THREE.AnimationClip,
  restRotations: ReadonlyMap<string, THREE.Quaternion>,
  strengths: LowerBodyStabilizer
): THREE.AnimationClip {
  const stabilized = clip.clone();
  if (strengths.size === 0) return stabilized;
  const rest = new THREE.Quaternion();
  const key = new THREE.Quaternion();
  const damped = new THREE.Quaternion();
  for (const track of stabilized.tracks) {
    if (
      !track.name.endsWith('.quaternion')
      || track.getValueSize() !== 4
      || track.values.length < 4
    ) {
      continue;
    }
    const target = trackTargetName(track.name);
    const strength = stabilizerStrengthForTrack(target, strengths);
    if (strength === undefined || strength <= 0) continue;
    const keep = 1 - Math.min(1, strength);
    rest.copy(restRotationForTrack(target, track, restRotations));
    for (let offset = 0; offset + 4 <= track.values.length; offset += 4) {
      key.set(
        track.values[offset],
        track.values[offset + 1],
        track.values[offset + 2],
        track.values[offset + 3]
      );
      damped.copy(rest).slerp(key, keep);
      damped.toArray(track.values, offset);
    }
  }
  return stabilized;
}

export function makeClipInPlace(
  clip: THREE.AnimationClip,
  lockedAxes: readonly RootMotionAxis[] = ['x', 'z'],
  referenceClip: THREE.AnimationClip = clip,
  restTranslations?: ReadonlyMap<string, THREE.Vector3>
): THREE.AnimationClip {
  const cloned = clip.clone();
  const referenceTrack = rootPositionTrack(referenceClip);

  for (const track of cloned.tracks) {
    if (
      !track.name.endsWith('.position') ||
      !ROOT_BONE_NAMES.has(trackTargetName(track.name)) ||
      track.getValueSize() !== 3 ||
      track.values.length < 3
    ) {
      continue;
    }

    const restPosition = restPositionForTrack(track, restTranslations);
    const initialValues = restPosition
      ? [restPosition.x, restPosition.y, restPosition.z]
      : referenceTrack
        ? [referenceTrack.values[0], referenceTrack.values[1], referenceTrack.values[2]]
        : [track.values[0], track.values[1], track.values[2]];
    for (let i = 0; i < track.values.length; i += 3) {
      for (const axis of lockedAxes) {
        const axisIndex = AXIS_INDEX[axis];
        track.values[i + axisIndex] = initialValues[axisIndex];
      }
    }
  }

  return cloned;
}
