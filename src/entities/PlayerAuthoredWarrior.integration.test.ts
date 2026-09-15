import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterAssetStore } from '../characters/CharacterAssetStore';
import { getWeaponDefinition } from '../equipment/EquipmentCatalog';

const runtimeFactory = vi.hoisted(() => ({
  mountRuntimeWarrior: vi.fn(() => {
    throw new Error('The authored warrior GLB must not be replaced at runtime.');
  }),
}));

vi.mock('../characters/RuntimeWarriorFactory', () => runtimeFactory);

import { Player } from './Player';

function clip(name: string): THREE.AnimationClip {
  return new THREE.AnimationClip(name, 1, []);
}

describe('Player authored warrior visual', () => {
  it('keeps the Blender GLB as the gameplay visual instead of mounting the procedural warrior', async () => {
    const model = new THREE.Group();
    const hand = new THREE.Bone();
    hand.name = 'mixamorigRightHand';
    const sword = new THREE.Group();
    sword.name = 'sword';
    hand.add(sword);
    model.add(hand);

    const assets = {
      createModel: () => model,
      getAnimations: () => [
        clip('idle_sword'),
        clip('caminhando'),
        clip('correndo'),
        clip('ataque_basico'),
        clip('recebe_dano'),
        clip('morte'),
      ],
      getBoneNames: () => new Set<string>(),
    } as unknown as CharacterAssetStore;

    const player = new Player('paladin', assets);
    await expect(player.load()).resolves.toBeUndefined();

    expect(runtimeFactory.mountRuntimeWarrior).not.toHaveBeenCalled();
    expect(player.root.getObjectByName('sword')).toBe(sword);
  });

  it('keeps combat equipment functional without attaching Warrior elemental VFX', async () => {
    const model = new THREE.Group();
    const hand = new THREE.Bone();
    hand.name = 'mixamorigRightHand';
    const sword = new THREE.Group();
    sword.name = 'sword';
    hand.add(sword);
    model.add(hand);
    const assets = {
      createModel: () => model,
      getAnimations: () => [
        clip('idle_sword'), clip('caminhando'), clip('correndo'),
        clip('ataque_basico'), clip('recebe_dano'), clip('morte'),
      ],
      getBoneNames: () => new Set<string>(),
    } as unknown as CharacterAssetStore;
    const player = new Player('paladin', assets);

    await player.load();
    expect(player.equipWeapon(getWeaponDefinition('sword')!, new THREE.Group())).toBe(true);

    expect(player.equippedWeaponId).toBe('sword');
    expect(player.root.getObjectByName('RuntimeWarrior_ElementalSword')).toBeUndefined();
    expect(player.root.getObjectByName('RuntimeWarrior_AttackVfx')).toBeUndefined();
  });
});
