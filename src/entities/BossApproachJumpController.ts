import * as THREE from 'three';

const MINIMUM_DISTANCE = 15;
const LANDING_DISTANCE = 2.5;
const JUMP_CHANCE = 0.25;
const COOLDOWN = 12;

export class BossApproachJumpController {
  private cooldownRemaining = 0;

  public constructor(private readonly random: () => number = Math.random) {}

  public update(delta: number): void {
    this.cooldownRemaining = Math.max(
      0,
      this.cooldownRemaining - Math.max(0, delta)
    );
  }

  public tryStart(
    bossPosition: THREE.Vector3,
    playerPosition: THREE.Vector3
  ): THREE.Vector3 | null {
    const offset = new THREE.Vector3().subVectors(playerPosition, bossPosition);
    offset.y = 0;
    if (
      this.cooldownRemaining > 0
      || offset.length() <= MINIMUM_DISTANCE
      || this.random() >= JUMP_CHANCE
    ) {
      return null;
    }

    offset.normalize();
    this.cooldownRemaining = COOLDOWN;
    return playerPosition.clone().addScaledVector(offset, -LANDING_DISTANCE);
  }

  public reset(): void {
    this.cooldownRemaining = 0;
  }
}
