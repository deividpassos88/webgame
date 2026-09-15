import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CharacterAssetStore } from '../characters/CharacterAssetStore';
import { getWeaponDefinition } from '../equipment/EquipmentCatalog';
import { createRuntimeWarriorSword } from '../characters/RuntimeWarriorWeapon';
import { Player } from './Player';

function animation(name: string, duration = 0.2) {
  return new THREE.AnimationClip(name, duration, []);
}

async function loadedPlayer(attackDuration = 0.2, withHand = false) {
  const clips = [
    animation('Idle', 1),
    animation('running', 1),
    animation('ataque', attackDuration),
    animation('hit'),
    animation('morte'),
  ];
  const assets = {
    createModel: () => {
      const model = new THREE.Group();
      if (withHand) {
        const hand = new THREE.Bone();
        hand.name = 'mixamorigRightHand';
        model.add(hand);
      }
      return model;
    },
    getAnimations: () => clips,
    getBoneNames: () => new Set<string>(),
  } as unknown as CharacterAssetStore;
  const player = new Player('paladin', assets);
  await player.load();
  return player;
}

async function loadedPlayerWithSword(attackDuration = 0.2) {
  const player = await loadedPlayer(attackDuration, true);
  const sword = getWeaponDefinition('sword');
  if (!sword) throw new Error('Sword definition missing');
  expect(player.equipWeapon(sword, createRuntimeWarriorSword())).toBe(true);
  return player;
}

describe('Player animation preview integration', () => {
  it('reports no runtime budget when the GLB visual fallback remains active', async () => {
    const player = await loadedPlayer();

    expect(player.runtimeWarriorBudget).toBeNull();
  });

  it('does not move toward a marked enemy already inside the expanded base attack reach', async () => {
    const player = await loadedPlayer();
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 2.7);

    player.attackEnemy(enemy, () => undefined);
    player.update(0.1);

    expect(player.root.position.z).toBeCloseTo(0, 5);
    expect(player.attackTargetEnemy).toBe(enemy);
  });

  it('cancels a pending ground destination when navigation is explicitly cancelled', async () => {
    const player = await loadedPlayer();
    player.moveTo(new THREE.Vector3(0, 0, 8));

    player.cancelClickMovement();
    player.update(0.1);

    expect(player.root.position.z).toBeCloseTo(0, 5);
    expect(player.moveTarget).toBeNull();
    expect(player.state).toBe('idle');
  });

  it('lets attack input leave a preview after the attack cooldown expires', async () => {
    const player = await loadedPlayer();
    player.attackAtCursor();
    player.previewAnimation('running');

    player.update(1);
    player.attackAtCursor();

    expect(player.activeAnimationPreview).toBeNull();
    expect(player.state).toBe('attacking');
  });

  it('previews death and returns to idle without changing real health or death state', async () => {
    const player = await loadedPlayer();

    expect(player.previewAnimation('dead')).toBe(true);
    player.update(0.25);

    expect(player.hp).toBe(100);
    expect(player.isDead).toBe(false);
    expect(player.activeAnimationPreview).toBe('idle');
    expect(player.state).toBe('idle');
  });

  it('plays the one-second basic attack at the approved 1.45x rate', async () => {
    const player = await loadedPlayer(1);

    player.attackAtCursor();
    player.update(0.65);
    expect(player.state).toBe('attacking');

    player.update(0.05);
    expect(player.state).toBe('idle');
  });

  it('applies attack damage only after the combo damage window opens', async () => {
    const player = await loadedPlayerWithSword(1);
    const enemy = new THREE.Object3D();
    const hits: THREE.Object3D[] = [];

    player.attackEnemy(enemy, (target) => hits.push(target));
    player.update(0.01);
    expect(hits).toEqual([]);
    player.update(0.12);
    expect(hits).toEqual([enemy]);
  });

  it('moves during an active marked attack without cancelling the target or combo', async () => {
    const player = await loadedPlayerWithSword(1);
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 1);
    player.attackEnemy(enemy, () => undefined);
    player.update(0.01);

    player.moveByDirection(new THREE.Vector3(1, 0, 0), 0.1, true);

    expect(player.root.position.x).toBeGreaterThan(0);
    expect(player.isAttackInSwing()).toBe(true);
    expect(player.attackTargetEnemy).toBe(enemy);
    expect(player.state).toBe('attacking');
  });

  it('keeps attacking a clicked target while directional movement stays in range', async () => {
    const player = await loadedPlayerWithSword(1);
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 1);
    player.attackEnemy(enemy, () => undefined);
    player.update(0.01);

    player.moveByDirection(new THREE.Vector3(1, 0, 0), 0.1);

    expect(player.root.position.x).toBeGreaterThan(0);
    expect(player.isAttackInSwing()).toBe(true);
    expect(player.attackTargetEnemy).toBe(enemy);
  });

  it('keeps directional movement and stops attacking after leaving target range', async () => {
    const player = await loadedPlayerWithSword(1);
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 1);
    player.attackEnemy(enemy, () => undefined);
    player.update(0.01);

    player.moveByDirection(new THREE.Vector3(1, 0, 0), 1, true);
    const movedX = player.root.position.x;
    player.update(0.01);

    expect(movedX).toBeGreaterThan(0);
    expect(player.root.position.x).toBeCloseTo(movedX, 5);
    expect(player.attackTargetEnemy).toBeNull();
    expect(player.isAttackInSwing()).toBe(false);
    expect(player.state).toBe('running');
  });

  it('keeps moving without starting another strike while the target remains selected', async () => {
    const player = await loadedPlayer(1);
    const enemy = new THREE.Object3D();
    enemy.position.set(0, 0, 1);
    player.attackEnemy(enemy, () => undefined);
    player.update(0.01);
    player.update(0.34);

    player.moveByDirection(new THREE.Vector3(1, 0, 0), 0.1, true);
    player.update(0.01);

    expect(player.attackTargetEnemy).toBe(enemy);
    expect(player.state).toBe('running');
  });

  it('forces the hit animation and cancels an attack when a boss skill lands', async () => {
    const player = await loadedPlayer(1);
    player.attackAtCursor();
    expect(player.state).toBe('attacking');

    player.takeBossSkillDamage(23);

    expect(player.hp).toBe(77);
    expect(player.state).toBe('hit');
    expect(player.isAttackInSwing()).toBe(false);
  });

  it('does not let ordinary hit invulnerability cancel a boss skill impact', async () => {
    const player = await loadedPlayer();
    player.takeDamage(4);
    expect(player.hp).toBe(96);

    player.takeBossSkillDamage(9);

    expect(player.hp).toBe(87);
    expect(player.state).toBe('hit');
  });
});
