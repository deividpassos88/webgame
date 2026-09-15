import * as THREE from 'three';

export class BossDashMotion {
  readonly position: THREE.Vector3;
  private elapsed = 0;

  constructor(
    private readonly start: THREE.Vector3,
    private readonly end: THREE.Vector3,
    private readonly duration: number
  ) {
    this.start = start.clone();
    this.end = end.clone();
    this.position = start.clone();
  }

  update(delta: number): { completed: boolean } {
    this.elapsed = Math.min(this.duration, this.elapsed + Math.max(0, delta));
    const progress = this.duration <= 0 ? 1 : this.elapsed / this.duration;
    this.position.lerpVectors(this.start, this.end, progress);
    return { completed: progress >= 1 };
  }
}
