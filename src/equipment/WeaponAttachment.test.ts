import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { WeaponDefinition } from './EquipmentCatalog';
import { WeaponEquipment, attachWeaponToSocket } from './WeaponAttachment';

const sword: WeaponDefinition = {
  id: 'sword',
  label: 'Espada',
  assetLabel: 'Sword',
  modelPath: '/models/sword.glb',
  slot: 'weapon',
  socketName: 'mixamorigRightHand',
  desiredLength: 2,
  gripFraction: 0,
  rotation: [0, 0, 0],
  offset: [0, 0, 0],
  attackRange: 2.6,
  attackDamage: 18,
  attackCooldownTime: 0.9,
  killHealFraction: { regular: 0.03, miniBoss: 0.06 },
  regularDefenseChance: 0.03,
};

function characterWithHand(scale = 1, handName = 'mixamorigRightHand') {
  const character = new THREE.Group();
  character.scale.setScalar(scale);
  const hand = new THREE.Bone();
  hand.name = handName;
  character.add(hand);
  character.updateMatrixWorld(true);
  return { character, hand };
}

function weaponModel() {
  const root = new THREE.Group();
  root.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 2, 0.2),
      new THREE.MeshBasicMaterial()
    )
  );
  return root;
}

describe('attachWeaponToSocket', () => {
  it('normalizes world length and places the grip at the hand origin', () => {
    const { character, hand } = characterWithHand(0.5);
    const attachment = attachWeaponToSocket(character, weaponModel(), sword);

    expect(attachment).not.toBeNull();
    expect(attachment!.pivot.parent).toBe(hand);
    character.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(attachment!.pivot).getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(2, 5);
    expect(attachment!.model.position.y).toBeCloseTo(1, 5);
  });

  it('does not modify the weapon when the hand socket is missing', () => {
    const character = new THREE.Group();
    const model = weaponModel();

    expect(attachWeaponToSocket(character, model, sword)).toBeNull();
    expect(model.parent).toBeNull();
  });

  it('accepts the colon used by Blender Mixamo bone names', () => {
    const { character, hand } = characterWithHand(1, 'mixamorig:RightHand');
    const attachment = attachWeaponToSocket(character, weaponModel(), sword);

    expect(attachment?.socket).toBe(hand);
    expect(attachment?.pivot.parent).toBe(hand);
  });
});

describe('WeaponEquipment', () => {
  it('marks a virtual weapon without attaching or disposing the caller-owned fallback model', () => {
    const { character, hand } = characterWithHand();
    const equipment = new WeaponEquipment();
    const model = weaponModel();
    const geometry = (model.children[0] as THREE.Mesh).geometry;
    let disposalCount = 0;
    geometry.addEventListener('dispose', () => disposalCount += 1);

    expect(equipment.equip(character, model, sword)).toBe(true);
    const attachedPivot = hand.children[0];

    expect(equipment.equipVirtual('sword')).toBe(true);
    expect(equipment.equippedWeaponId).toBe('sword');
    expect(equipment.equippedObject).toBeNull();
    expect(attachedPivot.parent).toBeNull();
    expect(model.parent).toBeNull();
    expect(disposalCount).toBe(0);

    expect(equipment.unequip()).toBe(true);
    expect(equipment.equippedWeaponId).toBeNull();
    expect(equipment.equippedObject).toBeNull();
  });

  it('replaces the previous weapon instead of stacking both in the hand', () => {
    const { character, hand } = characterWithHand();
    const equipment = new WeaponEquipment();
    const axe = { ...sword, id: 'axe', label: 'Machado', assetLabel: 'Axe' } as const;

    expect(equipment.equip(character, weaponModel(), sword)).toBe(true);
    const swordPivot = hand.children[0];
    expect(equipment.equip(character, weaponModel(), axe)).toBe(true);

    expect(equipment.equippedWeaponId).toBe('axe');
    expect(hand.children).toHaveLength(1);
    expect(swordPivot.parent).toBeNull();
  });

  it('removes the equipped weapon once and allows a different weapon afterward', () => {
    const { character, hand } = characterWithHand();
    const equipment = new WeaponEquipment();
    const axe = { ...sword, id: 'axe', label: 'Machado', assetLabel: 'Axe' } as const;

    const swordModel = weaponModel();
    expect(equipment.equip(character, swordModel, sword)).toBe(true);
    expect(equipment.equippedObject).toBe(swordModel);
    const swordPivot = hand.children[0];

    expect(equipment.unequip()).toBe(true);
    expect(swordPivot.parent).toBeNull();
    expect(equipment.equippedWeaponId).toBeNull();
    expect(equipment.equippedObject).toBeNull();
    expect(equipment.unequip()).toBe(false);
    expect(equipment.equip(character, weaponModel(), axe)).toBe(true);
    expect(equipment.equippedWeaponId).toBe('axe');
  });
});
