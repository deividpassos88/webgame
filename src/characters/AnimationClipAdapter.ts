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

export function makeClipInPlace(
  clip: THREE.AnimationClip,
  lockedAxes: readonly RootMotionAxis[] = ['x', 'z'],
  referenceClip: THREE.AnimationClip = clip
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

    const initialValues = referenceTrack
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
