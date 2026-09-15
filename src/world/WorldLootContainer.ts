import * as THREE from 'three';
import { LootContainerState } from '../inventory/LootContainerState';

export class WorldLootContainer {
  public readonly root = new THREE.Group();
  public readonly state = new LootContainerState('field-cache-1', [
    { itemId: 'runic-crystal', quantity: 4 },
    { itemId: 'iron-shard', quantity: 6 },
    { itemId: 'ancient-cloth', quantity: 3 },
    { itemId: 'health-tonic', quantity: 2 },
  ]);
  public readonly interactionRadius = 2.8;
  private readonly ringGeometry = new THREE.RingGeometry(0.9, 1.0, 32);
  private readonly ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb800,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  public constructor(model: THREE.Group, position: THREE.Vector3) {
    this.root.name = 'WorldLootContainer';
    this.root.userData.isLootContainer = true;
    this.root.position.copy(position);
    model.name = 'WorldLootContainerModel';
    model.scale.multiplyScalar(0.65);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    if (!bounds.isEmpty()) model.position.y -= bounds.min.y;
    this.root.add(model);
    const ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
    ring.name = 'WorldLootInteractionRing';
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.035;
    this.root.add(ring);
  }

  public canInteractFrom(position: THREE.Vector3): boolean {
    return this.root.position.distanceTo(position) <= this.interactionRadius;
  }

  public update(elapsed: number): void {
    this.ringMaterial.opacity = 0.48 + Math.sin(elapsed * 2.4) * 0.14;
  }

  public dispose(): void {
    this.root.removeFromParent();
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
  }
}
