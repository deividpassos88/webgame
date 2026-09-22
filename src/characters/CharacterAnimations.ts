import * as THREE from 'three';
import {
  adaptRotationClip,
  makeClipInPlace,
  type RootMotionAxis,
} from './AnimationClipAdapter';
import {
  WARRIOR_ATTACK_IDS,
  getCharacterDefinition,
  type CharacterAnimationState,
  type CharacterId,
  type WarriorAttackId,
} from './CharacterCatalog';

export interface CharacterAnimationSource {
  getAnimations(id: CharacterId): THREE.AnimationClip[];
  getBoneNames(id: CharacterId): ReadonlySet<string>;
  getBoneRestRotations(id: CharacterId): ReadonlyMap<string, THREE.Quaternion>;
  getBoneRestTranslations(id: CharacterId): ReadonlyMap<string, THREE.Vector3>;
}

const STATES: readonly CharacterAnimationState[] = [
  'idle',
  'running',
  'attacking',
  'hit',
  'dead',
];

function normalizeClipName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_.-]+/g, '')
    .toLowerCase();
}

function findExact(clips: THREE.AnimationClip[], name?: string) {
  if (!name) return undefined;
  const exact = clips.find((clip) => clip.name === name);
  if (exact) return exact;
  const normalizedName = normalizeClipName(name);
  return clips.find((clip) => normalizeClipName(clip.name) === normalizedName);
}

function findFirst(
  clips: THREE.AnimationClip[],
  names?: readonly string[]
): THREE.AnimationClip | undefined {
  for (const name of names ?? []) {
    const clip = findExact(clips, name);
    if (clip) return clip;
  }
  return undefined;
}

function ownClip(
  clip: THREE.AnimationClip,
  characterId: CharacterId,
  state: CharacterAnimationState,
  inPlaceAxes?: readonly RootMotionAxis[],
  referenceClip?: THREE.AnimationClip,
  restTranslations?: ReadonlyMap<string, THREE.Vector3>
) {
  const prepared = inPlaceAxes
    ? makeClipInPlace(clip, inPlaceAxes, referenceClip, restTranslations)
    : clip.clone();
  prepared.name = `${characterId}:${state}`;
  return prepared;
}

function cloneStaticTrack(track: THREE.KeyframeTrack): THREE.KeyframeTrack {
  const size = track.getValueSize();
  const values = new Array<number>(size * 2);
  for (let component = 0; component < size; component += 1) {
    const value = Number(track.values[component]);
    values[component] = value;
    values[size + component] = value;
  }
  const times = [0, 1 / 30];
  if (track instanceof THREE.QuaternionKeyframeTrack) {
    return new THREE.QuaternionKeyframeTrack(track.name, times, values);
  }
  if (track instanceof THREE.VectorKeyframeTrack) {
    return new THREE.VectorKeyframeTrack(track.name, times, values);
  }
  if (track instanceof THREE.NumberKeyframeTrack) {
    return new THREE.NumberKeyframeTrack(track.name, times, values);
  }
  return new THREE.KeyframeTrack(track.name, times, values);
}

function staticPoseClip(source: THREE.AnimationClip): THREE.AnimationClip {
  return new THREE.AnimationClip(
    `${source.name}:static`,
    1 / 30,
    source.tracks.map(cloneStaticTrack)
  );
}

export function resolveCharacterClips(
  characterId: CharacterId,
  source: CharacterAnimationSource
): Partial<Record<CharacterAnimationState, THREE.AnimationClip>> {
  const definition = getCharacterDefinition(characterId);
  const result: Partial<Record<CharacterAnimationState, THREE.AnimationClip>> = {};
  const nativeClips = source.getAnimations(characterId);
  const rootRestTranslations = definition.rootMotionReference === 'rest-pose'
    ? source.getBoneRestTranslations(characterId)
    : undefined;
  const idleReferenceClip =
    findExact(nativeClips, definition.clipMap.idle)
    ?? findFirst(nativeClips, definition.clipAliases?.idle)
    ?? findExact(nativeClips, definition.idlePoseSource);

  for (const state of STATES) {
    let clip = findExact(nativeClips, definition.clipMap[state])
      ?? findFirst(nativeClips, definition.clipAliases?.[state]);
    if (!clip && state === 'idle' && definition.idlePoseSource) {
      const poseSource = findExact(nativeClips, definition.idlePoseSource);
      if (poseSource) clip = staticPoseClip(poseSource);
    }
    if (clip) {
      result[state] = ownClip(
        clip,
        characterId,
        state,
        definition.inPlaceAxes,
        idleReferenceClip,
        rootRestTranslations
      );
    }
  }

  if (!definition.fallbackCharacterId) return result;

  let fallbackClips: THREE.AnimationClip[];
  try {
    fallbackClips = source.getAnimations(definition.fallbackCharacterId);
  } catch {
    return result;
  }

  const allowedBones = source.getBoneNames(characterId);
  const fallbackDefinition = getCharacterDefinition(definition.fallbackCharacterId);
  const sourceRestRotations = source.getBoneRestRotations(
    definition.fallbackCharacterId
  );
  const targetRestRotations = source.getBoneRestRotations(characterId);

  for (const state of STATES) {
    if (result[state]) continue;
    const fallback = findExact(fallbackClips, definition.fallbackClipMap?.[state])
      ?? findFirst(fallbackClips, fallbackDefinition.clipAliases?.[state]);
    if (!fallback) continue;

    const adapted = adaptRotationClip(
      fallback,
      allowedBones,
      `${characterId}:${state}`,
      { sourceRestRotations, targetRestRotations }
    );
    if (adapted.tracks.length > 0) result[state] = adapted;
  }

  return result;
}

export function resolveWarriorAttackClips(
  characterId: CharacterId,
  source: CharacterAnimationSource
): Partial<Record<WarriorAttackId, THREE.AnimationClip>> {
  const definition = getCharacterDefinition(characterId);
  const result: Partial<Record<WarriorAttackId, THREE.AnimationClip>> = {};
  const nativeClips = source.getAnimations(characterId);
  const rootRestTranslations = definition.rootMotionReference === 'rest-pose'
    ? source.getBoneRestTranslations(characterId)
    : undefined;
  const idleReferenceClip = findExact(
    nativeClips,
    definition.clipMap.idle ?? definition.idlePoseSource
  );
  const attackIds = new Set<WarriorAttackId>([
    ...(definition.attackClipNames ?? []),
    ...Object.keys(definition.attackClipMap ?? {}) as WarriorAttackId[],
  ]);

  for (const attackId of WARRIOR_ATTACK_IDS) {
    if (!attackIds.has(attackId)) continue;
    const clipName = definition.attackClipMap?.[attackId] ?? attackId;
    const clip = findExact(nativeClips, clipName);
    if (!clip) continue;
    const prepared = definition.inPlaceAxes
      ? makeClipInPlace(clip, definition.inPlaceAxes, idleReferenceClip, rootRestTranslations)
      : clip.clone();
    prepared.name = `${characterId}:attack:${attackId}`;
    result[attackId] = prepared;
  }

  return result;
}
