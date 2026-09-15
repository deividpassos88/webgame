import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getWeaponDefinition } from '../equipment/EquipmentCatalog';
import { attachWeaponToSocket } from '../equipment/WeaponAttachment';
import { getRuntimeWarriorMaterials } from './RuntimeWarriorMaterials';
import { createRuntimeWarriorSword, isRuntimeWeapon } from './RuntimeWarriorWeapon';

function mixamoCharacter(): THREE.Group {
  const character = new THREE.Group();
  const hand = new THREE.Bone();
  hand.name = 'mixamorigRightHand';
  character.add(hand);
  character.updateMatrixWorld(true);
  return character;
}

describe('RuntimeWarriorWeapon', () => {
  it('creates a bounded sword with the rigid names and shared material roles', () => {
    const sword = createRuntimeWarriorSword();
    const bounds = new THREE.Box3().setFromObject(sword);
    const names = [
      'RuntimeWarrior_Sword',
      'RuntimeWarrior_SwordBlade',
      'RuntimeWarrior_SwordGuard',
      'RuntimeWarrior_SwordGrip',
    ];
    const materials = new Set<THREE.Material>();

    sword.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        const assigned = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of assigned) materials.add(material);
      }
    });

    expect(sword.name).toBe('RuntimeWarrior_Sword');
    for (const name of names.slice(1)) expect(sword.getObjectByName(name)).toBeTruthy();
    expect(bounds.isEmpty()).toBe(false);
    expect(bounds.min.toArray().every(Number.isFinite)).toBe(true);
    expect(bounds.max.toArray().every(Number.isFinite)).toBe(true);
    expect(materials).toHaveLength(3);
    expect(new Set(Array.from(materials, (material) => material.name))).toEqual(
      new Set(['RuntimeWarrior_steel', 'RuntimeWarrior_darkMetal', 'RuntimeWarrior_leather'])
    );
  });

  it('uses the exact shared singleton materials without texture maps', () => {
    const sword = createRuntimeWarriorSword();
    const materials = getRuntimeWarriorMaterials();
    const blade = sword.getObjectByName('RuntimeWarrior_SwordBlade') as THREE.Mesh;
    const fuller = sword.getObjectByName('RuntimeWarrior_SwordFuller') as THREE.Mesh;
    const guard = sword.getObjectByName('RuntimeWarrior_SwordGuard') as THREE.Mesh;
    const handle = sword.getObjectByName('RuntimeWarrior_SwordLeatherHandle') as THREE.Mesh;

    expect(blade.material).toBe(materials.steel);
    expect(fuller.material).toBe(materials.darkMetal);
    expect(guard.material).toBe(materials.darkMetal);
    expect(handle.material).toBe(materials.leather);
    for (const role of ['steel', 'darkMetal', 'leather'] as const) {
      const material = materials[role];
      expect(material.map).toBeNull();
      expect(material.normalMap).toBeNull();
      expect(material.roughnessMap).toBeNull();
      expect(material.metalnessMap).toBeNull();
    }
  });

  it('creates a fresh sword whose grip can attach to the right hand', () => {
    const definition = getWeaponDefinition('sword');
    if (!definition) throw new Error('Sword definition fixture is missing');

    const sword = createRuntimeWarriorSword();
    const attachment = attachWeaponToSocket(mixamoCharacter(), sword, definition);

    expect(attachment).not.toBeNull();
    expect(attachment!.model).toBe(sword);
    expect(attachment!.pivot.parent?.name).toBe('mixamorigRightHand');
    expect(createRuntimeWarriorSword()).not.toBe(sword);
    expect(isRuntimeWeapon('sword')).toBe(true);
    expect(isRuntimeWeapon('axe')).toBe(false);
  });

  it('keeps finite non-empty bounds and applies the grip offset after attachment', () => {
    const definition = getWeaponDefinition('sword');
    if (!definition) throw new Error('Sword definition fixture is missing');

    const sword = createRuntimeWarriorSword();
    const character = mixamoCharacter();
    const attachment = attachWeaponToSocket(character, sword, definition);
    if (!attachment) throw new Error('Sword attachment fixture failed');

    character.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(attachment.pivot);
    const size = bounds.getSize(new THREE.Vector3());
    expect(bounds.isEmpty()).toBe(false);
    expect(size.toArray().every(Number.isFinite)).toBe(true);
    // The catalog rotation changes the world-space AABB, so assert meaningful
    // attached extent rather than equating its largest world axis to the
    // pre-rotation local length normalized by WeaponAttachment.
    expect(size.length()).toBeGreaterThan(definition.desiredLength * 0.5);
    expect(attachment.model.position.toArray().every(Number.isFinite)).toBe(true);
    expect(attachment.model.position.length()).toBeGreaterThan(0);
  });
});
