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
  final: [number, number, number],
  duration = 1
) {
  return new THREE.AnimationClip(name, duration, [
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
    mage: [
      rotationClip('idle'),
      rotationClip('ataque basico'),
      rotationClip('ataque agua'),
      rotationClip('ataque gelo'),
      rotationClip('ataque choque'),
      rotationClip('ataque laser'),
      rotationClip('ataque de larva'),
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
    getBoneRestTranslations: (id) =>
      new Map(
        [...(id === 'dragon-miner'
          ? ['mixamorig:Hips']
          : ['mixamorig:Hips', 'mixamorig:Sword_joint'])].map((name) => [
          name,
          new THREE.Vector3(),
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
      mage: [],
    };
    const clips = resolveCharacterClips('paladin', {
      getAnimations: (id) => animations[id],
      getBoneNames: () => new Set(['mixamorig:Hips']),
      getBoneRestRotations: () => new Map(),
      getBoneRestTranslations: () => new Map(),
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

  it('uses only Maga_High look_around as lobby idle and ignores wait', () => {
    const animations: Record<CharacterId, THREE.AnimationClip[]> = {
      'dragon-miner': [],
      paladin: [],
      mage: [
        clipWithRootMotion('wait', [0.002, 0.56, 0.01], [0.02, 0.57, 0.02], 6),
        clipWithRootMotion('look_around', [0.002, 0.56, 0.01], [0.04, 0.58, 0.03], 15.5),
      ],
    };

    const clips = resolveCharacterClips('mage', {
      getAnimations: (id) => animations[id],
      getBoneNames: () => new Set(['mixamorig:Hips']),
      getBoneRestRotations: () => new Map(),
      getBoneRestTranslations: () => new Map(),
    });

    expect(clips.idle?.name).toBe('mage:idle');
    expect(clips.idle?.duration).toBeCloseTo(15.5);
    const track = clips.idle?.tracks.find((candidate) => candidate.name === 'mixamorig:Hips.position');
    const values = Array.from(track?.values ?? []);
    expect(values.slice(0, 3).map(Math.fround)).toEqual([
      Math.fround(0.002), Math.fround(0.56), Math.fround(0.01),
    ]);
    expect(values.slice(3, 6)).toEqual(values.slice(0, 3));
  });

  it('pins Maga root translation to the rest pose so her idle preview stays grounded', () => {
    const rest = new THREE.Vector3(0.045, 54.25, -3.14);
    const animations: Record<CharacterId, THREE.AnimationClip[]> = {
      'dragon-miner': [],
      paladin: [],
      mage: [
        clipWithRootMotion('idle', [0.5, -1.16, -51.78], [0.85, -0.85, -51.88]),
        clipWithRootMotion('correr rapido2', [0.5, -1.16, -51.78], [10, 20, 30]),
        clipWithRootMotion('ataque basico', [0.5, -1.16, -51.78], [2, 3, 4]),
        clipWithRootMotion('hit', [0.5, -1.16, -51.78], [3, 4, 5]),
        clipWithRootMotion('morrendo', [0.5, -1.16, -51.78], [4, 5, 6]),
      ],
    };

    const clips = resolveCharacterClips('mage', {
      getAnimations: (id) => animations[id],
      getBoneNames: () => new Set(['mixamorig:Hips']),
      getBoneRestRotations: () => new Map(),
      getBoneRestTranslations: () => new Map([['mixamorig:Hips', rest]]),
    });

    for (const state of ['idle', 'running', 'attacking', 'hit', 'dead'] as const) {
      const track = clips[state]?.tracks.find(
        (candidate) => candidate.name === 'mixamorig:Hips.position'
      );
      expect(Array.from(track?.values ?? [])).toEqual([
        Math.fround(rest.x), Math.fround(rest.y), Math.fround(rest.z),
        Math.fround(rest.x), Math.fround(rest.y), Math.fround(rest.z),
      ]);
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

  it('prefers Maga correr rapido2 even when the GLB exports accents/capitalization', () => {
    const animations: Record<CharacterId, THREE.AnimationClip[]> = {
      'dragon-miner': [],
      paladin: [],
      mage: [
        clipWithRootMotion('idle', [0.5, -1.16, -51.78], [0.85, -0.85, -51.88]),
        clipWithRootMotion('correr para frente', [0.5, -1.16, -51.78], [4, 5, 6], 0.733),
        clipWithRootMotion('Correr Rápido 2', [0.5, -1.16, -51.78], [10, 20, 30], 0.62),
      ],
    };

    const clips = resolveCharacterClips('mage', {
      getAnimations: (id) => animations[id],
      getBoneNames: () => new Set(['mixamorig:Hips']),
      getBoneRestRotations: () => new Map(),
      getBoneRestTranslations: () => new Map([
        ['mixamorig:Hips', new THREE.Vector3(0.045, 54.25, -3.14)],
      ]),
    });

    expect(clips.running?.name).toBe('mage:running');
    expect(clips.running?.duration).toBeCloseTo(0.62);
  });

  it('does not use the Mage generic Mixamo/death clip as a running fallback', () => {
    const animations: Record<CharacterId, THREE.AnimationClip[]> = {
      'dragon-miner': [],
      paladin: [],
      mage: [
        clipWithRootMotion('idle', [0.5, -1.16, -51.78], [0.85, -0.85, -51.88]),
        clipWithRootMotion('mixamo.com', [0.5, -1.16, -51.78], [-8, -45, -5], 2.43),
        clipWithRootMotion('morrendo', [0.5, -1.16, -51.78], [-9, -44, -5], 3.67),
        clipWithRootMotion('andar', [0.5, -1.16, -51.78], [0.7, -1.1, -51.7], 0.8),
      ],
    };

    const clips = resolveCharacterClips('mage', {
      getAnimations: (id) => animations[id],
      getBoneNames: () => new Set(['mixamorig:Hips']),
      getBoneRestRotations: () => new Map(),
      getBoneRestTranslations: () => new Map([
        ['mixamorig:Hips', new THREE.Vector3(0.045, 54.25, -3.14)],
      ]),
    });

    expect(clips.running?.name).toBe('mage:running');
    expect(clips.running?.duration).toBeCloseTo(0.8);
  });

  it('maps Maga authored attack clips onto every shared skill id and pins their root to rest pose', () => {
    const rest = new THREE.Vector3(0.045, 54.25, -3.14);
    const animations: Record<CharacterId, THREE.AnimationClip[]> = {
      'dragon-miner': [],
      paladin: [],
      mage: [
        clipWithRootMotion('idle', [0.5, -1.16, -51.78], [0.85, -0.85, -51.88]),
        clipWithRootMotion('ataque basico', [0.5, -1.16, -51.78], [1, 2, 3]),
        clipWithRootMotion('ataque agua', [0.5, -1.16, -51.78], [2, 3, 4]),
        clipWithRootMotion('ataque gelo', [0.5, -1.16, -51.78], [3, 4, 5]),
        clipWithRootMotion('ataque choque', [0.5, -1.16, -51.78], [4, 5, 6]),
        clipWithRootMotion('ataque laser', [0.5, -1.16, -51.78], [5, 6, 7]),
        clipWithRootMotion('ataque de larva', [0.5, -1.16, -51.78], [6, 7, 8]),
      ],
    };

    const attacks = resolveWarriorAttackClips('mage', {
      getAnimations: (id) => animations[id],
      getBoneNames: () => new Set(['mixamorig:Hips']),
      getBoneRestRotations: () => new Map(),
      getBoneRestTranslations: () => new Map([['mixamorig:Hips', rest]]),
    });

    expect(Object.keys(attacks)).toEqual([
      'ataque_basico',
      'ataque_giratorio',
      'ataque_giratorio_2',
      'pulo_atacando',
      'triplo_ataque',
      'corte_duplo',
    ]);
    for (const clip of Object.values(attacks)) {
      const track = clip?.tracks.find((candidate) => candidate.name === 'mixamorig:Hips.position');
      expect(Array.from(track?.values ?? [])).toEqual([
        Math.fround(rest.x), Math.fround(rest.y), Math.fround(rest.z),
        Math.fround(rest.x), Math.fround(rest.y), Math.fround(rest.z),
      ]);
    }
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
      mage: [],
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
      getBoneRestTranslations: () => new Map(),
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
      mage: [],
    };
    const clips = resolveCharacterClips('dragon-miner', {
      getAnimations: (id) => animations[id],
      getBoneNames: () => new Set(['mixamorig:Hips']),
      getBoneRestRotations: () => new Map(),
      getBoneRestTranslations: () => new Map(),
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
