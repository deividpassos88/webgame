import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Player } from './Player';
import type { CharacterAssetStore } from '../characters/CharacterAssetStore';
import { createRuntimeWarriorSword } from '../characters/RuntimeWarriorWeapon';
import { getWeaponDefinition } from '../equipment/EquipmentCatalog';
import { WARRIOR_SKILLS } from '../combat/WarriorSkillCatalog';
import { regularEnemyHpMultiplier, miniBossHpMultiplier } from '../waves/WaveDifficultyScaling';
import {
  createRegularEnemyOptions,
  createArcherEnemyOptions,
  createGuardianEnemyOptions,
} from '../waves/WaveEnemyFactory';
import {
  getAttributeAllocationCap,
  attributeAllocationAllowance,
  createDefaultCharacterAttributes,
} from '../profile/CharacterAttributes';

function animation(name: string, duration = 1) {
  return new THREE.AnimationClip(name, duration, []);
}

function createModelWithHand(): THREE.Group {
  const model = new THREE.Group();
  const hand = new THREE.Bone();
  hand.name = 'mixamorigRightHand';
  model.add(hand);
  return model;
}

async function createTestPlayer(): Promise<Player> {
  const clips = [
    animation('idle_sword'),
    animation('caminhando'),
    animation('correndo'),
    animation('ataque_basico'),
    animation('ataque_giratorio'),
    animation('ataque_giratorio_2'),
    animation('pulo_atacando'),
    animation('triplo_ataque'),
    animation('corte_duplo'),
    animation('recebe_dano'),
    animation('morte'),
    animation('caiu'),
  ];
  const assets = {
    createModel: createModelWithHand,
    getAnimations: () => clips,
    getBoneNames: () => new Set<string>(),
  } as unknown as CharacterAssetStore;

  const player = new Player('paladin', assets);
  await player.load();
  const weapon = getWeaponDefinition('sword');
  if (weapon) {
    player.equipWeapon(weapon, createRuntimeWarriorSword());
  }
  return player;
}

describe('Requirement 1: Dynamic Stat Allocation Gate Progression', () => {
  it('caps each stat at +10 until another reaches +10 (unlocking +15), then +15 (unlocking +20), etc.', () => {
    const attributes = createDefaultCharacterAttributes();

    // Initial state: cap is 10 for all stats
    expect(getAttributeAllocationCap(attributes, 'vitality')).toBe(10);
    expect(getAttributeAllocationCap(attributes, 'attack')).toBe(10);
    expect(attributeAllocationAllowance(attributes, 'vitality', 10, 10)).toBe(10);
    expect(attributeAllocationAllowance(attributes, 'vitality', 15, 15)).toBe(10);

    // Vitality reaches 10, other stats are 0 -> Vitality cannot exceed 10
    attributes.vitality = 10;
    expect(getAttributeAllocationCap(attributes, 'vitality')).toBe(10);
    expect(attributeAllocationAllowance(attributes, 'vitality', 5, 5)).toBe(0);

    // Defense reaches 10 -> unlocks +5 more (up to 15) for Vitality
    attributes.defense = 10;
    expect(getAttributeAllocationCap(attributes, 'vitality')).toBe(15);
    expect(getAttributeAllocationCap(attributes, 'defense')).toBe(15);
    expect(attributeAllocationAllowance(attributes, 'vitality', 5, 5)).toBe(5);

    // Vitality reaches 15, defense is 10 -> Vitality cannot exceed 15
    attributes.vitality = 15;
    expect(getAttributeAllocationCap(attributes, 'vitality')).toBe(15);
    expect(attributeAllocationAllowance(attributes, 'vitality', 5, 5)).toBe(0);

    // Defense reaches 15 -> unlocks +5 more (up to 20) for Vitality
    attributes.defense = 15;
    expect(getAttributeAllocationCap(attributes, 'vitality')).toBe(20);
    expect(attributeAllocationAllowance(attributes, 'vitality', 5, 5)).toBe(5);

    // Defense reaches 20 -> unlocks +5 more (up to 25) for Vitality
    attributes.defense = 20;
    expect(getAttributeAllocationCap(attributes, 'vitality')).toBe(25);
  });
});

describe('Requirement 2: Wave HP Multipliers', () => {
  it('applies the exact regular enemy wave HP scaling', () => {
    expect(regularEnemyHpMultiplier(1)).toBeCloseTo(1.0, 5);
    expect(regularEnemyHpMultiplier(2)).toBeCloseTo(1.3, 5); // +30%
    expect(regularEnemyHpMultiplier(3)).toBeCloseTo(1.4, 5); // +40%
    expect(regularEnemyHpMultiplier(4)).toBeCloseTo(1.45, 5); // +45%
    expect(regularEnemyHpMultiplier(5)).toBeCloseTo(1.5, 5); // +50%
    expect(regularEnemyHpMultiplier(6)).toBeCloseTo(1.5, 5); // +50%
  });

  it('applies the exact mini-boss wave HP scaling', () => {
    expect(miniBossHpMultiplier(1)).toBeCloseTo(1.0, 5);
    expect(miniBossHpMultiplier(2)).toBeCloseTo(1.35, 5); // +35%
    expect(miniBossHpMultiplier(3)).toBeCloseTo(1.4, 5); // +40%
    expect(miniBossHpMultiplier(4)).toBeCloseTo(1.45, 5); // +45%
    expect(miniBossHpMultiplier(5)).toBeCloseTo(1.5, 5); // +50%
    expect(miniBossHpMultiplier(6)).toBeCloseTo(1.5, 5); // +50%
  });
});

describe('Requirement 3: Monster Base HP Ratios', () => {
  it('sets Regular monster base HP = 50, Archer = 2x regular (100), Guardian = 3x regular (150)', () => {
    const regular = createRegularEnemyOptions(new THREE.Vector3(), 1, 1, 0);
    const archer = createArcherEnemyOptions(new THREE.Vector3(), 1, 1);
    const guardian = createGuardianEnemyOptions(new THREE.Vector3(), 1, 1);

    expect(regular.hp).toBe(50);
    expect(archer.hp).toBe(100);
    expect(guardian.hp).toBe(150);

    expect(archer.hp).toBe((regular.hp ?? 50) * 2);
    expect(guardian.hp).toBe((regular.hp ?? 50) * 3);
  });
});

describe('Requirement 4: Player Targeted Facing / Strafe and Skill Execution', () => {
  it('faces toward the targeted enemy when moving in any direction (backward / strafe)', async () => {
    const player = await createTestPlayer();
    const enemy = new THREE.Object3D();
    // Enemy is placed in front of player (Z = 5)
    enemy.position.set(0, 0, 5);

    // Target the enemy
    player.attackEnemy(enemy, () => {});
    expect(player.attackTargetEnemy).toBe(enemy);

    // Move backward (dir = -Z = [0, 0, -1])
    player.moveByDirection(new THREE.Vector3(0, 0, -1), 0.1);
    player.update(0.1);

    // The player position should have moved backward in Z
    expect(player.root.position.z).toBeLessThan(0);
    // But facing direction must point towards the enemy (Z = 5), so rotation.y is facing Z+ (angle 0)
    const expectedAngle = Math.atan2(enemy.position.x - player.root.position.x, enemy.position.z - player.root.position.z);
    expect(player.root.rotation.y).toBeCloseTo(expectedAngle, 1);

    // Move sideways (strafe right: dir = +X = [1, 0, 0])
    player.moveByDirection(new THREE.Vector3(1, 0, 0), 0.1);
    player.update(0.1);

    expect(player.root.position.x).toBeGreaterThan(0);
    const strafeAngle = Math.atan2(enemy.position.x - player.root.position.x, enemy.position.z - player.root.position.z);
    expect(player.root.rotation.y).toBeCloseTo(strafeAngle, 1);
  });

  it('faces movement direction when no target is active', async () => {
    const player = await createTestPlayer();
    player.clearAttackTarget();

    // Move in +X direction
    player.moveByDirection(new THREE.Vector3(1, 0, 0), 0.2);
    player.update(0.2);

    // With no target, facing matches movement direction (Math.PI / 2)
    expect(player.root.rotation.y).toBeCloseTo(Math.PI / 2, 1);
  });

  it('triggers warrior skills cleanly without animation freeze or locking', async () => {
    const player = await createTestPlayer();

    for (const skill of WARRIOR_SKILLS) {
      expect(player.tryStartSkillAttack(skill.id)).toBe(true);
      expect(player.isAttackInSwing()).toBe(true);
      expect(player.activeWarriorAttackId).toBe(skill.id);

      // Advance through the entire skill duration
      for (let step = 0; step < 25; step++) {
        player.update(0.1);
      }

      // After skill finishes, player must not be swinging or stuck
      expect(player.isAttackInSwing()).toBe(false);
      expect(player.activeWarriorAttackId).toBeNull();
      expect(player.isDead).toBe(false);
    }
  });
});
