import * as THREE from 'three';
import type { EnemyRangedAttack } from '../entities/Enemy';

export interface ArcherProjectileHit {
  damage: number;
  distance: number;
}

interface ActiveArrow {
  root: THREE.Group;
  origin: THREE.Vector3;
  target: THREE.Vector3;
  elapsed: number;
  duration: number;
  damage: number;
  distance: number;
}

export class ArcherProjectileSystem {
  private readonly active: ActiveArrow[] = [];

  public constructor(private readonly scene: THREE.Scene) {}

  public fire(attack: EnemyRangedAttack): void {
    const direction = attack.target.clone().sub(attack.origin);
    const distance = direction.length();
    if (distance <= 1e-6) return;

    const root = this.createArrowVisual(direction);
    root.position.copy(attack.origin);
    this.scene.add(root);
    this.active.push({
      root,
      origin: attack.origin.clone(),
      target: attack.target.clone(),
      elapsed: 0,
      duration: THREE.MathUtils.clamp(distance / 24, 0.18, 0.62),
      damage: attack.damage,
      distance: attack.distance,
    });
  }

  public update(delta: number, onHit: (hit: ArcherProjectileHit) => void): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const arrow = this.active[index];
      arrow.elapsed += Math.max(0, delta);
      const progress = Math.min(1, arrow.elapsed / arrow.duration);
      arrow.root.position.lerpVectors(arrow.origin, arrow.target, progress);
      arrow.root.position.y += Math.sin(progress * Math.PI) * 0.25;
      if (progress < 1) continue;
      onHit({ damage: arrow.damage, distance: arrow.distance });
      this.disposeArrow(arrow);
      this.active.splice(index, 1);
    }
  }

  public clear(): void {
    this.active.forEach((arrow) => this.disposeArrow(arrow));
    this.active.length = 0;
  }

  public get count(): number {
    return this.active.length;
  }

  private createArrowVisual(direction: THREE.Vector3): THREE.Group {
    const root = new THREE.Group();
    const forward = direction.normalize();
    const length = 0.95;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, length, 6),
      new THREE.MeshBasicMaterial({ color: 0xffdf88 })
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = -length * 0.5;
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.065, 0.18, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff4ca })
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = -length;
    const trail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0.1),
        new THREE.Vector3(0, 0, length * 1.7),
      ]),
      new THREE.LineBasicMaterial({
        color: 0x78d8ff,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    root.add(shaft, tip, trail);
    root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), forward);
    return root;
  }

  private disposeArrow(arrow: ActiveArrow): void {
    arrow.root.traverse((object) => {
      const renderable = object as THREE.Mesh | THREE.Line;
      renderable.geometry?.dispose();
      const material = renderable.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose();
    });
    arrow.root.removeFromParent();
  }
}
