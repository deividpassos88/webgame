import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CharacterId } from './CharacterCatalog';
import {
  resolveCharacterClips,
  resolveWarriorAttackClips,
  type CharacterAnimationSource,
} from './CharacterAnimations';

function rotationClip(name: string, extraBone = false) {
  const tracks: THREE.KeyframeTrack[] = [
    new THREE.QuaternionKeyframeTrack(
      'mixamorig:Hips.quaternion',
      [0, 1],
      [0, 0, 0, 1, 0, 0.1, 0, 0.99]
    ),
    new THREE.VectorKeyframeTrack(
      'mixamorig:Hips.position',
      [0, 1],
      [0, 0, 0, 2, 0, 3]
    ),
  ];
  if (extraBone) {
    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        'mixamorig:Sword_joint.quaternion',
        [0, 1],
        [0, 0, 0, 1, 0, 0, 0.1, 0.99]
      )
    );
  }
  return new THREE.AnimationClip(name, 1, tracks);
}

function clipWithRootMotion(
  name: string,
  initial: [number, number, number],
  final: [number, number, number]
) {
  return new THREE.AnimationClip(name, 1, [
    new THREE.VectorKeyframeTrack(
      'mixamorig:Hips.position',
      [0, 1],
      [...initial, ...final]
    ),
    new THREE.QuaternionKeyframeTrack(
      'mixamorig:Hips.quaternion',
      [0, 1],
      [0, 0, 0, 1, 0, 0.1, 0, 0.99]
    ),
  ]);
}

function source(): CharacterAnimationSource {
  const animations: Record<CharacterId, THREE.AnimationClip[]> = {
    'dragon-miner': [rotationClip('idle'), rotationClip('ataque')],
    paladin: [
      rotationClip('idle_sword', true),
      rotationClip('caminhando', true),
      rotationClip('correndo', true),
      rotationClip('ataque_basico', true),
      rotationClip('ataque_giratorio', true),
      rotationClip('ataque_giratorio_2', true),
      rotationClip('pulo_atacando', true),
      rotationClip('triplo_ataque', true),
      rotationClip('corte_duplo', true),
      rotationClip('recebe_dano', true),
      rotationClip('morte', true),
      rotationClip('caiu', true),
    ],
  };

  return {
    getAnimations: (id) => animations[id],
    getBoneNames: (id) =>
      id === 'dragon-miner'
        ? new Set(['mixamorig:Hips'])
        : new Set(['mixamorig:Hips', 'mixamorig:Sword_joint']),
    getBoneRestRotations: (id) =>
      new Map(
        [...(id === 'dragon-miner'
          ? ['mixamorig:Hips']
          : ['mixamorig:Hips', 'mixamorig:Sword_joint'])].map((name) => [
          name,
          new THREE.Quaternion(),
        ])
      ),
  };
}

describe('resolveCharacterClips', () => {
  it('maps every guerreiro_animado state by its exact exported clip name', () => {
    const clips = resolveCharacterClips('paladin', source());

    expect(Object.keys(clips).sort()).toEqual([
      'attacking',
      'dead',
      'hit',
      'idle',
      'running',
    ]);
    expect(clips.running?.name).toBe('paladin:running');
    const hipsPosition = clips.running?.tracks.find(
      (track) => track.name === 'mixamorig:Hips.position'
    );
    expect(Array.from(hipsPosition?.values ?? [])).toEqual([0, 0, 0, 0, 0, 3]);
    const attackHipsPosition = clips.attacking?.tracks.find(
      (track) => track.name === 'mixamorig:Hips.position'
    );
    expect(Array.from(attackHipsPosition?.values ?? [])).toEqual([
      0, 0, 0, 0, 0, 3,
    ]);
  });

  it('uses the idle pose X/Y origin for every guerreiro_animado clip while preserving each clip Z motion', () => {
    const animations: Record<CharacterId, THREE.AnimationClip[]> = {
      'dragon-miner': [],
      paladin: [
        clipWithRootMotion('idle_sword', [10, 20, 3], [10, 20, 3]),
        clipWithRootMotion('caminhando', [10, 20, 3], [11, 21, 4]),
        clipWithRootMotion('correndo', [100, 200, 30], [101, 201, 31]),
        clipWithRootMotion('ataque_basico', [-5, -6, 40], [-4, -5, 41]),
        clipWithRootMotion('recebe_dano', [70, 80, 50], [71, 81, 51]),
        clipWithRootMotion('morte', [90, 100, 60], [91, 101, 61]),
      ],
    };
    const clips = resolveCharacterClips('paladin', {
      getAnimations: (id) => animations[id],
      getBoneNames: () => new Set(['mixamorig:Hips']),
      getBoneRestRotations: () => new Map(),
    });

    for (const state of ['idle', 'running', 'attacking', 'hit', 'dead'] as const) {
      const track = clips[state]?.tracks.find(
        (candidate) => candidate.name === 'mixamorig:Hips.position'
      );
      expect(Array.from(track?.values ?? [])).toEqual(
        state === 'idle'
          ? [10, 20, 3, 10, 20, 3]
          : state === 'running'
            ? [10, 20, 30, 10, 20, 31]
            : state === 'attacking'
              ? [10, 20, 40, 10, 20, 41]
              : state === 'hit'
                ? [10, 20, 50, 10, 20, 51]
                : [10, 20, 60, 10, 20, 61]
      );
    }
  });

  it('uses the authored sword idle and resolves all six warrior attack clips in order', () => {
    const animationSource = source();

    const states = resolveCharacterClips('paladin', animationSource);
    const attacks = resolveWarriorAttackClips('paladin', animationSource);

    expect(states.idle?.name).toBe('paladin:idle');
    expect(states.idle?.duration).toBe(1);
    expect(Object.keys(attacks)).toEqual([
      'ataque_basico',
      'ataque_giratorio',
      'ataque_giratorio_2',
      'pulo_atacando',
      'triplo_ataque',
      'corte_duplo',
    ]);
    expect(Object.values(attacks).map((clip) => clip?.name)).toEqual([
      'paladin:attack:ataque_basico',
      'paladin:attack:ataque_giratorio',
      'paladin:attack:ataque_giratorio_2',
      'paladin:attack:pulo_atacando',
      'paladin:attack:triplo_ataque',
      'paladin:attack:corte_duplo',
    ]);
    const idlePosition = states.idle?.tracks.find((track) =>
      track.name.endsWith('.position')
    );
    expect(idlePosition?.times.length).toBe(2);
    expect(Array.from(idlePosition?.values ?? [])).toEqual([
      0, 0, 0, 0, 0, 3,
    ]);
  });

  it('keeps native Dragon Miner clips and adapts missing states to shared bones', () => {
    const clips = resolveCharacterClips('dragon-miner', source());

    expect(clips.idle?.name).toBe('dragon-miner:idle');
    expect(clips.attacking?.name).toBe('dragon-miner:attacking');
    expect(clips.running?.name).toBe('dragon-miner:running');
    expect(clips.hit?.name).toBe('dragon-miner:hit');
    expect(clips.dead?.name).toBe('dragon-miner:dead');
    expect(clips.running?.tracks.map((track) => track.name)).toEqual([
      'mixamorig:Hips.quaternion',
    ]);
  });

  it('does not borrow idle or attack when a native Dragon Miner clip is missing', () => {
    const base = source();
    const missingIdle: CharacterAnimationSource = {
      ...base,
      getAnimations: (id) =>
        id === 'dragon-miner'
          ? base.getAnimations(id).filter((clip) => clip.name !== 'idle')
          : base.getAnimations(id),
    };

    const clips = resolveCharacterClips('dragon-miner', missingIdle);

    expect(clips.idle).toBeUndefined();
    expect(clips.attacking?.name).toBe('dragon-miner:attacking');
    expect(clips.running?.name).toBe('dragon-miner:running');
  });

  it('retargets borrowed rotations from the fallback rest pose to the Dragon Miner rest pose', () => {
    const halfSqrt = Math.SQRT1_2;
    const sourceRest = new THREE.Quaternion(0, 0, halfSqrt, halfSqrt);
    const targetRest = new THREE.Quaternion(halfSqrt, 0, 0, halfSqrt);
    const animations: Record<CharacterId, THREE.AnimationClip[]> = {
      'dragon-miner': [],
      paladin: [
        new THREE.AnimationClip('correndo', 1, [
          new THREE.QuaternionKeyframeTrack(
            'mixamorigHips.quaternion',
            [0],
            [sourceRest.x, sourceRest.y, sourceRest.z, sourceRest.w]
          ),
        ]),
      ],
    };
    const animationSource = {
      getAnimations: (id: CharacterId) => animations[id],
      getBoneNames: () => new Set(['mixamorigHips']),
      getBoneRestRotations: (id: CharacterId) =>
        new Map([
          [
            'mixamorigHips',
            id === 'dragon-miner' ? targetRest : sourceRest,
          ],
        ]),
    } as CharacterAnimationSource;

    const clips = resolveCharacterClips('dragon-miner', animationSource);
    const values = Array.from(clips.running?.tracks[0].values ?? []);

    expect(values).toEqual([
      expect.closeTo(halfSqrt, 5),
      expect.closeTo(0, 5),
      expect.closeTo(0, 5),
      expect.closeTo(halfSqrt, 5),
    ]);
  });

  it('keeps native Dragon Miner clips in place on the horizontal rig axes', () => {
    const animations: Record<CharacterId, THREE.AnimationClip[]> = {
      'dragon-miner': [
        clipWithRootMotion('idle', [10, 20, 3], [14, 25, 4]),
        clipWithRootMotion('ataque', [100, 200, 30], [120, 240, 31]),
      ],
      paladin: [],
    };
    const clips = resolveCharacterClips('dragon-miner', {
      getAnimations: (id) => animations[id],
      getBoneNames: () => new Set(['mixamorig:Hips']),
      getBoneRestRotations: () => new Map(),
    });
    const idlePosition = clips.idle?.tracks.find((track) =>
      track.name.endsWith('.position')
    );
    const attackPosition = clips.attacking?.tracks.find((track) =>
      track.name.endsWith('.position')
    );

    expect(Array.from(idlePosition?.values ?? [])).toEqual([
      10, 20, 3, 10, 20, 4,
    ]);
    expect(Array.from(attackPosition?.values ?? [])).toEqual([
      10, 20, 30, 10, 20, 31,
    ]);
  });
});
