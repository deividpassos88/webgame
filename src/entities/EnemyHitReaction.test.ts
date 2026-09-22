import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Enemy, ENEMY_HIT_KNOCKBACK_METERS, ENEMY_HIT_STAGGER_SECONDS } from './Enemy';
import { EnemyAnimationController } from './EnemyAnimationController';
import { isEnemyHitClipName } from './EnemyHitClip';

function clip(name: string, duration = 0.4): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, [
    new THREE.VectorKeyframeTrack('Hips.position', [0, duration], [0, 1, 0, 0, 1, 0]),
  ]);
}

function modelWithHips(): THREE.Group {
  const model = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'Hips';
  model.add(hips);
  return model;
}

describe('enemy hit reaction', () => {
  it('recognizes authored hit clips and ignores attacks', () => {
    expect(isEnemyHitClipName('hit')).toBe(true);
    expect(isEnemyHitClipName('Recebendo Dano')).toBe(true);
    expect(isEnemyHitClipName('Charged_Slash')).toBe(false);
    expect(isEnemyHitClipName('dying_backwards')).toBe(false);
  });

  it('plays a hit clip when the model has one', () => {
    const controller = new EnemyAnimationController(modelWithHips(), [
      clip('Walking'),
      clip('hit'),
    ]);
    expect(controller.playHit()).toBe(true);
    expect(controller.state).toBe('hit');
    controller.releaseHit();
    expect(controller.state).toBe('idle');
  });

  it('knocks the monster back and keeps it dizzy for 0.3s per hit', () => {
    const enemy = new Enemy({
      position: new THREE.Vector3(),
      hp: 40,
      speed: 4,
      detectionRange: 20,
    });
    enemy.receivePlayerHit(5, new THREE.Vector3(3, 0, 0));
    expect(enemy.hp).toBe(35);
    expect(enemy.root.position.x).toBeCloseTo(-ENEMY_HIT_KNOCKBACK_METERS);
    expect(ENEMY_HIT_STAGGER_SECONDS).toBe(0.3);

    enemy.update(0.25, new THREE.Vector3(6, 0, 0), () => undefined);
    expect(enemy.root.position.x).toBeCloseTo(-ENEMY_HIT_KNOCKBACK_METERS);
    expect(enemy.elementalSpeedMultiplier).toBe(0);

    enemy.receivePlayerHit(5, new THREE.Vector3(3, 0, 0));
    expect(enemy.root.position.x).toBeCloseTo(-ENEMY_HIT_KNOCKBACK_METERS * 2);

    enemy.update(0.35, new THREE.Vector3(6, 0, 0), () => undefined);
    expect(enemy.elementalSpeedMultiplier).toBe(1);
    expect(enemy.root.position.x).toBeGreaterThan(-ENEMY_HIT_KNOCKBACK_METERS * 2);
  });

  it('does not stagger a damage-over-time tick', () => {
    const enemy = new Enemy({
      position: new THREE.Vector3(),
      hp: 40,
      speed: 4,
      detectionRange: 20,
    });
    enemy.takeDamage(5);
    enemy.update(0.05, new THREE.Vector3(6, 0, 0), () => undefined);
    expect(enemy.root.position.x).toBeGreaterThan(0.05);
  });
});
