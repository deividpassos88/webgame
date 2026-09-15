import * as THREE from 'three';
import type {
  EquipmentId,
  WeaponDefinition,
} from './EquipmentCatalog';

export interface WeaponAttachment {
  socket: THREE.Bone;
  pivot: THREE.Group;
  model: THREE.Group;
}

export function findBone(
  root: THREE.Object3D,
  name: string
): THREE.Bone | null {
  let result: THREE.Bone | null = null;
  const normalizedTarget = name.replace(/[:_\-\s]/g, '').toLowerCase();
  root.traverse((object) => {
    const normalizedName = object.name.replace(/[:_\-\s]/g, '').toLowerCase();
    if (
      !result &&
      (object as THREE.Bone).isBone &&
      normalizedName === normalizedTarget
    ) {
      result = object as THREE.Bone;
    }
  });
  return result;
}

export function attachWeaponToSocket(
  character: THREE.Object3D,
  model: THREE.Group,
  definition: WeaponDefinition
): WeaponAttachment | null {
  const socket = findBone(character, definition.socketName);
  if (!socket) return null;

  character.updateMatrixWorld(true);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) return null;

  const size = bounds.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longest) || longest <= 0) return null;

  const axis: 'x' | 'y' | 'z' =
    size.x >= size.y && size.x >= size.z
      ? 'x'
      : size.y >= size.z
        ? 'y'
        : 'z';
  const grip = bounds.getCenter(new THREE.Vector3());
  grip[axis] = bounds.min[axis] + size[axis] * definition.gripFraction;
  model.position.sub(grip);

  const socketWorldScale = socket.getWorldScale(new THREE.Vector3());
  const normalizedScale = definition.desiredLength / longest;
  const pivot = new THREE.Group();
  pivot.name = `equipped-weapon:${definition.id}`;
  pivot.userData.isEquippedWeapon = true;
  pivot.scale.set(
    normalizedScale / Math.max(Math.abs(socketWorldScale.x), 0.0001),
    normalizedScale / Math.max(Math.abs(socketWorldScale.y), 0.0001),
    normalizedScale / Math.max(Math.abs(socketWorldScale.z), 0.0001)
  );
  pivot.rotation.set(...definition.rotation);
  pivot.position.set(...definition.offset);

  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  pivot.add(model);
  socket.add(pivot);
  character.updateMatrixWorld(true);
  return { socket, pivot, model };
}

export class WeaponEquipment {
  private attachment: WeaponAttachment | null = null;
  private currentId: EquipmentId | null = null;

  public get equippedWeaponId(): EquipmentId | null {
    return this.currentId;
  }

  /** The currently attached model, exposed read-only for visual effects. */
  public get equippedObject(): THREE.Group | null {
    return this.attachment?.model ?? null;
  }

  public equip(
    character: THREE.Object3D,
    model: THREE.Group,
    definition: WeaponDefinition
  ): boolean {
    const next = attachWeaponToSocket(character, model, definition);
    if (!next) return false;

    this.detachAttachedModel();
    this.attachment = next;
    this.currentId = definition.id;
    return true;
  }

  /**
   * Record an equipped weapon whose renderable geometry is already part of a
   * runtime character. Unlike `equip`, this deliberately does not take or
   * retain a fallback Group, so the caller remains its sole owner.
   */
  public equipVirtual(id: EquipmentId): boolean {
    this.detachAttachedModel();
    this.attachment = null;
    this.currentId = id;
    return true;
  }

  public unequip(): boolean {
    if (!this.attachment && this.currentId === null) return false;

    this.detachAttachedModel();
    this.attachment = null;
    this.currentId = null;
    return true;
  }

  private detachAttachedModel(): void {
    if (!this.attachment) return;
    this.attachment.model.removeFromParent();
    this.attachment.pivot.removeFromParent();
  }
}
