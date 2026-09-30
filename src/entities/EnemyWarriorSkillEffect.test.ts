import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Enemy, ENEMY_HIT_KNOCKBACK_METERS } from './Enemy';
import { getWarriorSkillEffect } from '../combat/WarriorSkillEffects';

function spawnEnemy(): Enemy {
  return new Enemy({
    position: new THREE.Vector3(),
    hp: 200,
    speed: 4,
    detectionRange: 20,
  });
}

/** Deixa o monstro "respirar" longe do jogador para não andar durante o teste. */
function idle(enemy: Enemy, seconds: number): void {
  const far = new THREE.Vector3(0, 0, 60);
  enemy.update(seconds, far, () => undefined);
}

describe('efeito de skill do guerreiro no monstro', () => {
  it('recua poucos centímetros no golpe normal, sem jogar o monstro para longe', () => {
    const enemy = spawnEnemy();
    const start = enemy.root.position.clone();

    enemy.receivePlayerHit(5, new THREE.Vector3(3, 0, 0));

    const moved = enemy.root.position.distanceTo(start);
    expect(moved).toBeCloseTo(ENEMY_HIT_KNOCKBACK_METERS);
    // Tremida nervosa, não um arremesso.
    expect(moved).toBeLessThan(0.2);
    expect(ENEMY_HIT_KNOCKBACK_METERS).toBe(0.1);
  });

  it('skill 1 tonteia por 1,2 s e volta a andar depois', () => {
    const enemy = spawnEnemy();
    const effect = getWarriorSkillEffect('ataque_giratorio');
    expect(effect.kind).toBe('stun');

    enemy.applyWarriorStun(effect.durationSeconds);
    expect(enemy.isWarriorStunned).toBe(true);
    expect(enemy.elementalSpeedMultiplier).toBe(0);

    idle(enemy, 1.0);
    expect(enemy.isWarriorStunned).toBe(true);

    idle(enemy, 0.3);
    expect(enemy.isWarriorStunned).toBe(false);
    expect(enemy.elementalSpeedMultiplier).toBeGreaterThan(0);
  });

  it('skill 2 congela por 1,2 s', () => {
    const enemy = spawnEnemy();
    const effect = getWarriorSkillEffect('ataque_giratorio_2');
    expect(effect.kind).toBe('freeze');

    enemy.applyWarriorFreeze(effect.durationSeconds);
    expect(enemy.elementalSpeedMultiplier).toBe(0);

    idle(enemy, 1.0);
    expect(enemy.elementalSpeedMultiplier).toBe(0);

    idle(enemy, 0.3);
    expect(enemy.elementalSpeedMultiplier).toBeGreaterThan(0);
  });

  it('skill 3 levanta o monstro por 1 s envolto em chamas', () => {
    const enemy = spawnEnemy();
    const effect = getWarriorSkillEffect('pulo_atacando');
    expect(effect.kind).toBe('launch');
    expect(effect.durationSeconds).toBe(1);

    const groundY = enemy.root.position.y;
    enemy.applyWarriorFlameLaunch(effect.durationSeconds);
    // No ar, preso e em chamas.
    expect(enemy.isWarriorFlameLaunched).toBe(true);
    expect(enemy.elementalSpeedMultiplier).toBe(0);

    idle(enemy, 0.5);
    expect(enemy.root.position.y).toBeGreaterThan(groundY);
    expect(enemy.isWarriorFlameLaunched).toBe(true);

    idle(enemy, 0.6);
    // O 1 segundo acabou: voltou ao chão e solto das chamas.
    expect(enemy.isWarriorFlameLaunched).toBe(false);
    expect(enemy.root.position.y).toBeCloseTo(groundY, 2);
    expect(enemy.elementalSpeedMultiplier).toBeGreaterThan(0);
  });

  it('skill 4 derruba e prende no chão por 1,3 s', () => {
    const enemy = spawnEnemy();
    const effect = getWarriorSkillEffect('triplo_ataque');
    expect(effect.kind).toBe('knockdown');

    enemy.applyWarriorKnockdown(effect.durationSeconds);
    expect(enemy.isWarriorKnockedDown).toBe(true);
    expect(enemy.elementalSpeedMultiplier).toBe(0);

    idle(enemy, 1.1);
    expect(enemy.isWarriorKnockedDown).toBe(true);

    idle(enemy, 0.3);
    expect(enemy.isWarriorKnockedDown).toBe(false);
  });

  it('renovar o efeito não acumula duas durações', () => {
    const enemy = spawnEnemy();
    enemy.applyWarriorStun(1.2);
    idle(enemy, 0.6);
    enemy.applyWarriorStun(1.2);
    idle(enemy, 0.7);
    // Passou 0,7 s da renovação: ainda tonteando.
    expect(enemy.isWarriorStunned).toBe(true);
    idle(enemy, 0.6);
    expect(enemy.isWarriorStunned).toBe(false);
  });
});
