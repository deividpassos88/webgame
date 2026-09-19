import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBoss } from '../entities/Boss';
import { Enemy } from '../entities/Enemy';
import type { RegularEnemyVisual } from './EnemyAssetStore';
import * as waveEnemyFactory from './WaveEnemyFactory';
import {
  createArcherEnemy,
  createArcherEnemyOptions,
  createGuardianEnemy,
  createGuardianEnemyOptions,
  createMiniBossOptions,
  createRegularEnemyOptions,
  selectRegularEnemyVariant,
} from './WaveEnemyFactory';

describe('WaveEnemyFactory', () => {
  it('creates a regular enemy with the supplied animated GLB visual', () => {
    const model = new THREE.Group();
    model.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 2, 1),
        new THREE.MeshStandardMaterial()
      )
    );
    const visual: RegularEnemyVisual = {
      model,
      animations: [new THREE.AnimationClip('Character_output.fbx', 1, [])],
    };
    const api = waveEnemyFactory as typeof waveEnemyFactory & {
      createRegularEnemy?: (
        position: THREE.Vector3,
        hpMultiplier: number,
        damageMultiplier: number,
        sequence: number,
        speedMultiplier: number,
        visual: RegularEnemyVisual
      ) => Enemy;
    };

    expect(api.createRegularEnemy).toBeTypeOf('function');
    const enemy = api.createRegularEnemy!(new THREE.Vector3(), 1, 1, 0, 1, visual);
    expect(enemy.animationState).toBe('idle');
  });

  it('creates scaled regular descriptors with cycling colors and a cloned position', () => {
    const position = new THREE.Vector3(4, 0, -7);

    const first = createRegularEnemyOptions(position, 1.4, 1.05, 0, 1.08);
    const second = createRegularEnemyOptions(position, 1, 1, 1);
    const third = createRegularEnemyOptions(position, 1, 1, 2);
    const wrapped = createRegularEnemyOptions(position, 1, 1, 3);

    expect(first).toMatchObject({
      hp: 70,
      scale: 0.7,
      detectionRange: 22,
      attackRange: 4,
      collisionRadius: 0.38,
      locomotionAnimationScale: 1.388571,
      color: 0x8a1010,
    });
    expect(first.damage).toBeCloseTo(12.6, 6);
    expect(first.speed).toBeCloseTo(3.888, 6);
    expect(new Enemy(first)).toMatchObject({
      detectionRange: 22,
      attackRange: 4,
    });
    expect(new Enemy(first).speed).toBeCloseTo(3.888, 6);
    expect([second.color, third.color, wrapped.color]).toEqual([
      0x6a2a8a,
      0x1a6a4a,
      0x8a1010,
    ]);
    expect(first.position).not.toBe(position);
    expect(first.position).toEqual(new THREE.Vector3(4, 0, -7));
  });

  it('creates a mini-boss with regular physical speed and matching locomotion playback', () => {
    const position = new THREE.Vector3(-3, 0, -11);

    const options = createMiniBossOptions(position, 1.5, 1.25, 1.06);

    expect(options).toMatchObject({
      hp: 360,
      damage: 30,
      scale: 1.4,
      color: 0xb35a16,
      detectionRange: 26,
      attackRange: 5,
      collisionRadius: 1,
      locomotionAnimationScale: 1.362857,
    });
    expect(options.speed).toBeCloseTo(3.816, 6);
    const enemy = new Enemy(options);
    expect(enemy).toMatchObject({
      detectionRange: 26,
      attackRange: 5,
    });
    expect(enemy.speed).toBeCloseTo(3.816, 6);
    expect(options.position).not.toBe(position);
    expect(options.position).toEqual(new THREE.Vector3(-3, 0, -11));
  });

  it('creates an archer with a long attack range and the ranged combat mode', () => {
    const options = createArcherEnemyOptions(new THREE.Vector3(2, 0, -5), 1.2, 1.1, 1.05);
    const archer = createArcherEnemy(new THREE.Vector3(), 1, 1);

    expect(options).toMatchObject({
      hp: 120,
      attackRange: 10.5,
      detectionRange: 26,
      attackMode: 'ranged',
      collisionRadius: 0.34,
      groundAnimatedModel: true,
      animatedGroundOffset: -0.035,
    });
    expect(options.damage).toBeCloseTo(7.7, 6);
    expect(archer.attackMode).toBe('ranged');
    expect(archer.attackRange).toBeGreaterThan(new Enemy(createRegularEnemyOptions(new THREE.Vector3(), 1, 1, 0)).attackRange);
  });

  it('uses the requested monster roster for each of the six regular waves', () => {
    expect([0, 1, 7].map((index) => selectRegularEnemyVariant(1, index))).toEqual([
      'normal', 'normal', 'normal',
    ]);
    expect([0, 1, 2, 3].map((index) => selectRegularEnemyVariant(3, index))).toEqual([
      'normal', 'archer', 'normal', 'archer',
    ]);
    expect([0, 1, 2, 3, 4, 5].map((index) => selectRegularEnemyVariant(5, index))).toEqual([
      'normal', 'archer', 'guardian', 'normal', 'archer', 'guardian',
    ]);
    expect([0, 1, 2, 3].map((index) => selectRegularEnemyVariant(6, index))).toEqual([
      'archer', 'guardian', 'archer', 'guardian',
    ]);
  });

  it('creates a grounded melee guardian distinct from the normal monster', () => {
    const options = createGuardianEnemyOptions(new THREE.Vector3(3, 0, -6), 1.2, 1.1, 1.05);
    const guardian = createGuardianEnemy(new THREE.Vector3(), 1, 1);

    expect(options).toMatchObject({
      hp: 180,
      attackRange: 4.5,
      detectionRange: 23,
      collisionRadius: 0.5,
      groundAnimatedModel: true,
      animatedGroundOffset: -0.035,
    });
    expect(options.damage).toBeCloseTo(15.4, 6);
    expect(guardian.attackMode).toBe('melee');
  });

  it('binds the guardian animator to the guardian clip names', () => {
    const model = new THREE.Group();
    model.add(
      new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial())
    );
    const guardianClips = ['mixamo.com', 'correndo', 'atacando', 'morrendo', 'protecao']
      .map((name) => new THREE.AnimationClip(name, 1, []));
    const visual = {
      model,
      animations: guardianClips,
    };

    const guardian = createGuardianEnemy(new THREE.Vector3(10, 0, 10), 1, 1, 1, visual);
    expect(guardian.animationState).toBe('idle');
    // idle do guardião é o clip "mixamo.com" — se o mapeamento estivesse errado
    // (clips do monstro_normal), o animator não encontraria nada.
    expect(guardian.activeAnimationClip).toBe('mixamo.com');

    // longe do centro e do player: caminha de volta ao centro (locomotion)
    guardian.update(0.016, new THREE.Vector3(500, 0, 500), () => undefined);
    expect(['walking', 'running']).toContain(guardian.animationState);
    expect(guardian.activeAnimationClip).toBe('correndo');
  });

  it('binds the archer animator to the archer clip names', () => {
    const model = new THREE.Group();
    model.add(
      new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial())
    );
    const archerClips = ['idle', 'correndo', 'atacando', 'morrendo']
      .map((name) => new THREE.AnimationClip(name, 1, []));
    const visual = { model, animations: archerClips };

    const archer = createArcherEnemy(new THREE.Vector3(10, 0, 10), 1, 1, 1, visual);
    expect(archer.animationState).toBe('idle');
    expect(archer.activeAnimationClip).toBe('idle');

    // longe do centro e do player: caminha de volta ao centro (locomotion)
    archer.update(0.016, new THREE.Vector3(500, 0, 500), () => undefined);
    expect(['walking', 'running']).toContain(archer.animationState);
    expect(archer.activeAnimationClip).toBe('correndo');
  });

  it('preserves the regular speed expression without a mini-boss rounding drift', () => {
    const speedMultiplier = 1.23456789;

    const options = createMiniBossOptions(new THREE.Vector3(), 1, 1, speedMultiplier);

    expect(options.speed).toBe(3.6 * speedMultiplier);
  });
});

describe('createBoss compatibility', () => {
  it('keeps the approved final-boss descriptor and copies its spawn position', () => {
    const position = new THREE.Vector3(0, 0, -14);

    const boss = createBoss(position);

    expect(boss).toMatchObject({
      hp: 7000,
      damage: 11,
      detectionRange: 45,
      attackRange: 2.2,
      speed: 0.8,
      isBoss: true,
    });
    expect(boss.root.userData.enemyBodyScale).toBe(3.2);
    expect(boss.root.position).toEqual(new THREE.Vector3(0, 0, -14));
    position.set(9, 9, 9);
    expect(boss.root.position).toEqual(new THREE.Vector3(0, 0, -14));
  });

  it('creates an animated boss and exposes skill animation scheduling', () => {
    const model = new THREE.Group();
    model.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
    const animations = [
      'idle', 'walking', 'running', 'attack_meteors', 'attack_dash',
      'death', 'jump_circle', 'jump_rectangle',
    ].map((name) => new THREE.AnimationClip(name, 1, []));

    const boss = createBoss(new THREE.Vector3(), { model, animations });

    expect(boss.animationState).toBe('idle');
    expect(boss.playSkillAnimation('circle', 0)).toBe(true);
    expect(boss.activeAnimationClip).toBe('jump_circle');
  });
});
