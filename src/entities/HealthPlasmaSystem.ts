import * as THREE from 'three';
import {
  HealthPlasma,
  createHealthPlasmaResources,
} from './HealthPlasma';

export class HealthPlasmaSystem {
  private readonly active: HealthPlasma[] = [];
  private readonly sharedResources = createHealthPlasmaResources();

  public constructor(private readonly scene: THREE.Scene) {}

  public get activeCount(): number {
    return this.active.length;
  }

  public spawn(source: THREE.Vector3, healAmount: number): void {
    if (healAmount <= 0) return;
    const plasma = new HealthPlasma(source, healAmount, this.sharedResources);
    this.active.push(plasma);
    this.scene.add(plasma.root);
  }

  public update(
    delta: number,
    playerBody: THREE.Vector3,
    onArrive: (healAmount: number) => void
  ): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const plasma = this.active[index];
      if (!plasma.update(delta, playerBody)) continue;
      onArrive(plasma.healAmount);
      plasma.dispose();
      this.active.splice(index, 1);
    }
  }

  public clear(): void {
    for (const plasma of this.active) plasma.dispose();
    this.active.length = 0;
  }
}
