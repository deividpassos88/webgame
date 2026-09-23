import * as THREE from 'three';
import { Enemy } from '../entities/Enemy';
import type { EnemyOptions } from '../entities/Enemy';
import type { VFXLightPool } from '../vfx/VFXLightPool';
import {
  ARCHER_CLIP_NAMES,
  GUARDIAN_CLIP_NAMES,
  EnemyAnimationController,
} from '../entities/EnemyAnimationController';
import type {
  ArcherEnemyVisual,
  GuardianEnemyVisual,
  RegularEnemyVisual,
} from './EnemyAssetStore';

const REGULAR_COLORS = [0x8a1010, 0x6a2a8a, 0x1a6a4a] as const;

const REGULAR_BASE = {
  hp: 50,
  damage: 12,
  scale: 0.7,
  detectionRange: 22,
  attackRange: 4,
  speed: 3.6,
} as const;

const LOCOMOTION_BASE_SCALE = REGULAR_BASE.speed / 2.8;

const ARCHER_BASE = {
  hp: 100,
  damage: 7,
  scale: 0.68,
  detectionRange: 26,
  attackRange: 10.5,
  speed: 3.15,
} as const;

const GUARDIAN_BASE = {
  hp: 150,
  damage: 14,
  scale: 0.76,
  detectionRange: 23,
  attackRange: 4.5,
  speed: 3.05,
} as const;

export type RegularEnemyVariant = 'normal' | 'archer' | 'guardian';

/**
 * Each regular wave has a deterministic roster. This is independent of the
 * global entity id counter, so an ADM jump or a miniboss interruption cannot
 * leak a previous wave's monster mix into the next one.
 */
export function selectRegularEnemyVariant(
  wave: number,
  spawnIndex: number
): RegularEnemyVariant {
  const normalizedIndex = Math.max(0, Math.floor(spawnIndex));
  const roster: readonly RegularEnemyVariant[] = wave <= 2
    ? ['normal']
    : wave <= 4
      ? ['normal', 'archer']
      : wave === 5
        ? ['normal', 'archer', 'guardian']
        : ['archer', 'guardian'];
  return roster[normalizedIndex % roster.length];
}

export function createRegularEnemyOptions(
  position: THREE.Vector3,
  hpMultiplier: number,
  damageMultiplier: number,
  sequence: number,
  speedMultiplier = 1
): EnemyOptions {
  const normalizedColorIndex = ((Math.trunc(sequence) % REGULAR_COLORS.length)
    + REGULAR_COLORS.length) % REGULAR_COLORS.length;

  return {
    position: position.clone(),
    color: REGULAR_COLORS[normalizedColorIndex],
    hp: Math.round(REGULAR_BASE.hp * hpMultiplier),
    damage: REGULAR_BASE.damage * damageMultiplier,
    scale: REGULAR_BASE.scale,
    detectionRange: REGULAR_BASE.detectionRange,
    attackRange: REGULAR_BASE.attackRange,
    speed: REGULAR_BASE.speed * speedMultiplier,
    collisionRadius: 0.38,
    locomotionAnimationScale: Number((LOCOMOTION_BASE_SCALE * speedMultiplier).toFixed(6)),
    temperament: 'neutral',
  };
}

export function createRegularEnemy(
  position: THREE.Vector3,
  hpMultiplier: number,
  damageMultiplier: number,
  sequence: number,
  speedMultiplier = 1,
  visual?: RegularEnemyVisual,
  shockLightPool?: VFXLightPool | null
): Enemy {
  return new Enemy(
    {
      ...createRegularEnemyOptions(
        position,
        hpMultiplier,
        damageMultiplier,
        sequence,
        speedMultiplier
      ),
      shockLightPool: shockLightPool ?? null,
    },
    visual
  );
}

export function createArcherEnemyOptions(
  position: THREE.Vector3,
  hpMultiplier: number,
  damageMultiplier: number,
  speedMultiplier = 1
): EnemyOptions {
  return {
    position: position.clone(),
    color: 0x6e472c,
    hp: Math.round(ARCHER_BASE.hp * hpMultiplier),
    damage: ARCHER_BASE.damage * damageMultiplier,
    scale: ARCHER_BASE.scale,
    detectionRange: ARCHER_BASE.detectionRange,
    attackRange: ARCHER_BASE.attackRange,
    speed: ARCHER_BASE.speed * speedMultiplier,
    collisionRadius: 0.34,
    locomotionAnimationScale: Number((ARCHER_BASE.speed / 2.8 * speedMultiplier).toFixed(6)),
    temperament: 'neutral',
    attackMode: 'ranged',
    groundAnimatedModel: true,
    animatedGroundOffset: -0.035,
  };
}

export function createArcherEnemy(
  position: THREE.Vector3,
  hpMultiplier: number,
  damageMultiplier: number,
  speedMultiplier = 1,
  visual?: ArcherEnemyVisual,
  shockLightPool?: VFXLightPool | null
): Enemy {
  const options = createArcherEnemyOptions(
    position,
    hpMultiplier,
    damageMultiplier,
    speedMultiplier
  );
  options.shockLightPool = shockLightPool ?? null;
  return new Enemy(
    options,
    visual,
    visual
      ? (model, clips) => new EnemyAnimationController(
        model,
        clips,
        options.locomotionAnimationScale,
        ARCHER_CLIP_NAMES,
        'archer',
        ['x', 'y', 'z']
      )
      : undefined
  );
}

export function createGuardianEnemyOptions(
  position: THREE.Vector3,
  hpMultiplier: number,
  damageMultiplier: number,
  speedMultiplier = 1
): EnemyOptions {
  return {
    position: position.clone(),
    color: 0x46515a,
    hp: Math.round(GUARDIAN_BASE.hp * hpMultiplier),
    damage: GUARDIAN_BASE.damage * damageMultiplier,
    scale: GUARDIAN_BASE.scale,
    detectionRange: GUARDIAN_BASE.detectionRange,
    attackRange: GUARDIAN_BASE.attackRange,
    speed: GUARDIAN_BASE.speed * speedMultiplier,
    collisionRadius: 0.5,
    locomotionAnimationScale: Number((GUARDIAN_BASE.speed / 2.8 * speedMultiplier).toFixed(6)),
    temperament: 'neutral',
    groundAnimatedModel: true,
    animatedGroundOffset: -0.035,
  };
}

export function createGuardianEnemy(
  position: THREE.Vector3,
  hpMultiplier: number,
  damageMultiplier: number,
  speedMultiplier = 1,
  visual?: GuardianEnemyVisual,
  shockLightPool?: VFXLightPool | null
): Enemy {
  const options = createGuardianEnemyOptions(
    position,
    hpMultiplier,
    damageMultiplier,
    speedMultiplier
  );
  options.shockLightPool = shockLightPool ?? null;
  return new Enemy(
    options,
    visual,
    visual
      ? (model, clips) => new EnemyAnimationController(
        model,
        clips,
        options.locomotionAnimationScale,
        GUARDIAN_CLIP_NAMES,
        'guardian',
        ['x', 'y', 'z']
      )
      : undefined
  );
}

export function createMiniBossOptions(
  position: THREE.Vector3,
  hpMultiplier = 1,
  damageMultiplier = 1,
  speedMultiplier = 1
): EnemyOptions {
  return {
    position: position.clone(),
    color: 0xb35a16,
    hp: Math.round(240 * hpMultiplier),
    damage: 24 * damageMultiplier,
    scale: REGULAR_BASE.scale * 2,
    detectionRange: 26,
    attackRange: 5,
    // Mini-bosses use the same physical base speed as regular monsters. Their
    // larger body is visual only; it must not make their chase or animation
    // move faster than the regular enemy baseline.
    speed: REGULAR_BASE.speed * speedMultiplier,
    collisionRadius: 1,
    locomotionAnimationScale: Number(
      (LOCOMOTION_BASE_SCALE * speedMultiplier).toFixed(6)
    ),
    temperament: 'neutral',
    dropOnDeath: null,
  };
}
