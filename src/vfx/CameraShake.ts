import * as THREE from 'three';

export class CameraShake {
  private remaining = 0;
  private duration = 0;
  private intensity = 0;
  private readonly offset = new THREE.Vector3();

  public add(intensity: number, duration: number): void {
    if (!Number.isFinite(intensity) || !Number.isFinite(duration)) return;
    if (intensity <= 0 || duration <= 0) return;
    this.intensity = Math.max(this.intensity, intensity);
    this.duration = Math.max(this.duration, duration);
    this.remaining = Math.max(this.remaining, duration);
  }

  /** Apply after the normal CameraController update so the offset never persists. */
  public apply(camera: THREE.Camera, delta: number): void {
    if (this.remaining <= 0) return;
    this.remaining = Math.max(0, this.remaining - Math.max(0, delta));
    const progress = this.duration > 0 ? this.remaining / this.duration : 0;
    const amplitude = this.intensity * progress * progress;
    this.offset.set(
      (Math.random() - 0.5) * amplitude,
      (Math.random() - 0.5) * amplitude * 0.65,
      (Math.random() - 0.5) * amplitude
    );
    camera.position.add(this.offset);
    if (this.remaining <= 0) {
      this.intensity = 0;
      this.duration = 0;
      this.offset.set(0, 0, 0);
    }
  }

  public clear(): void {
    this.remaining = 0;
    this.duration = 0;
    this.intensity = 0;
    this.offset.set(0, 0, 0);
  }
}
