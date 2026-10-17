import * as THREE from 'three';
import { MAGE_WARD_DURATION_SECONDS } from '../combat/MageWardBarrier';

/**
 * Invisible collision ward for the Mage's skill 4 (Raio Prismático).
 * Only the game-enforced collision boundary exists: no ring, shield, glow,
 * shaders, visible meshes or GPU resources are created.
 *
 * The historical class name is retained for compatibility with Game.
 */
export class MageWardVFX {
  /** Logical anchor only; deliberately never added to the game scene. */
  public readonly group = new THREE.Group();
  private remaining = 0;

  public constructor() {
    this.group.name = 'MageInvisibleLaserWard';
    this.group.visible = false;
  }

  public get active(): boolean { return this.remaining > 0; }
  public get timeRemaining(): number { return this.remaining; }

  public activate(position: THREE.Vector3): void {
    this.remaining = MAGE_WARD_DURATION_SECONDS;
    this.group.position.copy(position);
    this.group.visible = false;
  }

  public update(delta: number, position: THREE.Vector3): void {
    if (!this.active) return;
    this.remaining = Math.max(0, this.remaining - Math.max(0, delta));
    this.group.position.copy(position);
    this.group.visible = false;
  }

  public reset(): void {
    this.remaining = 0;
    this.group.visible = false;
  }

  public dispose(): void {
    this.reset();
    this.group.removeFromParent();
  }
}
