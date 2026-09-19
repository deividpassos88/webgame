import * as THREE from 'three';
import {
  adaptRotationClip,
  makeClipInPlace,
  type RootMotionAxis,
} from './AnimationClipAdapter';
import {
  getCharacterDefinition,
  type CharacterAnimationState,
  type CharacterId,
  type WarriorAttackId,
} from './CharacterCatalog';

export interface CharacterAnimationSource {
  getAnimations(id: CharacterId): THREE.AnimationClip[];
  getBoneNames(id: CharacterId): ReadonlySet<string>;
  getBoneRestRotations(id: CharacterId): ReadonlyMap<string, THREE.Quaternion>;
}

const STATES: readonly CharacterAnimationState[] = [
  'idle',
  'running',
  'attacking',
  'hit',
  'dead',
];

function findExact(clips: THREE.AnimationClip[], name?: string) {
  return name ? clips.find((clip) => clip.name === name) : undefined;
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
  referenceClip?: THREE.AnimationClip
) {
  const prepared = inPlaceAxes
    ? makeClipInPlace(clip, inPlaceAxes, referenceClip)
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
        idleReferenceClip
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

const MAGE_SKILL_FALLBACKS: Record<string, readonly string[]> = {
  // warrior skill id -> possible maga animation names
  ataque_basico: ['ataque basico', 'ataque basico', 'posicao ataque'],
  ataque_giratorio: ['ataque agua', 'ataque basico'],
  ataque_giratorio_2: ['ataque gelo', 'ataque agua'],
  pulo_atacando: ['ataque choque', 'ataque de larva'],
  triplo_ataque: ['ataque laser', 'ataque choque'],
  corte_duplo: ['ataque de larva', 'ataque laser'],
  // also allow maga names to be found via warrior names
  'ataque basico': ['ataque_basico', 'ataque basico'],
  'ataque agua': ['ataque_giratorio'],
  'ataque gelo': ['ataque_giratorio_2'],
  'ataque choque': ['pulo_atacando'],
  'ataque laser': ['triplo_ataque'],
  'ataque de larva': ['corte_duplo'],
  'posicao ataque': ['ataque_basico', 'ataque basico'],
};

function findAttackClipWithFallback(
  clips: THREE.AnimationClip[],
  attackId: string,
  characterId: CharacterId
): THREE.AnimationClip | undefined {
  const exact = clips.find((c) => c.name === attackId);
  if (exact) return exact;
  // try case-insensitive or trimmed? keep exact for now
  const fallbacks = MAGE_SKILL_FALLBACKS[attackId];
  if (fallbacks) {
    for (const alt of fallbacks) {
      const found = clips.find((c) => c.name === alt);
      if (found) return found;
    }
  }
  // For maga, also try to find any attack clip if warrior id not found
  if (characterId === 'maga') {
    // try to find any clip that contains part of the name
    const lower = attackId.toLowerCase();
    if (lower.includes('giratorio')) {
      return clips.find((c) => c.name.toLowerCase().includes('agua') || c.name.toLowerCase().includes('gelo'));
    }
    if (lower.includes('pulo')) {
      return clips.find((c) => c.name.toLowerCase().includes('choque') || c.name.toLowerCase().includes('larva'));
    }
  }
  return undefined;
}

export function resolveWarriorAttackClips(
  characterId: CharacterId,
  source: CharacterAnimationSource
): Partial<Record<string, THREE.AnimationClip>> {
  const definition = getCharacterDefinition(characterId);
  const result: Partial<Record<string, THREE.AnimationClip>> = {};
  const nativeClips = source.getAnimations(characterId);
  const idleReferenceClip = findExact(
    nativeClips,
    definition.clipMap.idle ?? definition.idlePoseSource
  );

  // Build a set of all attack ids we want to resolve:
  // - those defined in the character
  // - plus warrior skill ids for compatibility (so skills work on maga)
  // - plus maga ids for completeness
  const desiredAttackIds = new Set<string>(definition.attackClipNames ?? []);
  // Always try to resolve warrior skill ids so the skill system works for any class
  for (const wid of ['ataque_basico', 'ataque_giratorio', 'ataque_giratorio_2', 'pulo_atacando', 'triplo_ataque', 'corte_duplo']) {
    desiredAttackIds.add(wid);
  }
  for (const mid of ['ataque basico', 'ataque agua', 'ataque choque', 'ataque gelo', 'ataque laser', 'ataque de larva', 'posicao ataque']) {
    desiredAttackIds.add(mid);
  }

  for (const attackId of desiredAttackIds) {
    const clip = findAttackClipWithFallback(nativeClips, attackId, characterId);
    if (!clip) continue;
    const prepared = definition.inPlaceAxes
      ? makeClipInPlace(clip, definition.inPlaceAxes, idleReferenceClip)
      : clip.clone();
    prepared.name = `${characterId}:attack:${attackId}`;
    result[attackId] = prepared;
  }

  return result;
}

export function resolveAttackClips(
  characterId: CharacterId,
  source: CharacterAnimationSource
): Partial<Record<string, THREE.AnimationClip>> {
  return resolveWarriorAttackClips(characterId, source);
}
