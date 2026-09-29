import * as THREE from 'three';

export interface ParticleSlashOptions {
  count?: number;
  color?: THREE.ColorRepresentation;
  size?: number;
  map?: THREE.Texture | null;
}

export class SlashSparksSystem {
  public readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly lifetimes: Float32Array;
  private readonly maxLifetimes: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly material: THREE.PointsMaterial;
  private activeCount = 0;
  private readonly maxParticles: number;
  private readonly tmpColor = new THREE.Color();

  public constructor(options: ParticleSlashOptions = {}) {
    this.maxParticles = options.count ?? 64;
    this.positions = new Float32Array(this.maxParticles * 3);
    this.velocities = new Float32Array(this.maxParticles * 3);
    this.lifetimes = new Float32Array(this.maxParticles);
    this.maxLifetimes = new Float32Array(this.maxParticles);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    this.material = new THREE.PointsMaterial({
      vertexColors: true,
      size: options.size ?? 0.28,
      map: options.map ?? null,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  public setMap(texture: THREE.Texture | null): void {
    this.material.map = texture;
    this.material.needsUpdate = true;
  }

  public emitFromArc(
    center: THREE.Vector3,
    direction: THREE.Vector3,
    radius: number,
    angleStart: number,
    angleEnd: number,
    count: number,
    color?: THREE.ColorRepresentation
  ): void {
    if (color !== undefined) {
      this.tmpColor.set(color);
    } else {
      this.tmpColor.set(0xffaa22);
    }

    const right = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const forward = direction.clone().normalize();

    for (let i = 0; i < count; i++) {
      if (this.activeCount >= this.maxParticles) break;
      const idx = this.activeCount;
      const t = Math.random();
      const angle = THREE.MathUtils.lerp(angleStart, angleEnd, t);
      const r = radius * (0.85 + Math.random() * 0.3);

      const px = center.x + right.x * Math.sin(angle) * r + forward.x * Math.cos(angle) * r;
      const pz = center.z + right.z * Math.sin(angle) * r + forward.z * Math.cos(angle) * r;
      const py = center.y + (Math.random() - 0.5) * 0.25;

      this.positions[idx * 3] = px;
      this.positions[idx * 3 + 1] = py;
      this.positions[idx * 3 + 2] = pz;

      // Soft drifting flame/energy ember velocity
      const tangentX = -Math.sin(angle) * 1.8 + (Math.random() - 0.5) * 1.2;
      const tangentZ = Math.cos(angle) * 1.8 + (Math.random() - 0.5) * 1.2;
      this.velocities[idx * 3] = right.x * tangentX + forward.x * tangentZ;
      this.velocities[idx * 3 + 1] = 0.2 + Math.random() * 0.8;
      this.velocities[idx * 3 + 2] = right.z * tangentX + forward.z * tangentZ;

      // Color tint with warm/vibrant variation (never harsh raw white)
      this.colors[idx * 3] = this.tmpColor.r * (0.8 + Math.random() * 0.2);
      this.colors[idx * 3 + 1] = this.tmpColor.g * (0.75 + Math.random() * 0.25);
      this.colors[idx * 3 + 2] = this.tmpColor.b * (0.6 + Math.random() * 0.4);

      const lifetime = 0.3 + Math.random() * 0.3;
      this.lifetimes[idx] = lifetime;
      this.maxLifetimes[idx] = lifetime;
      this.sizes[idx] = 1.0;
      this.activeCount++;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  public update(delta: number): void {
    if (this.activeCount === 0) return;

    let aliveIndex = 0;
    for (let i = 0; i < this.activeCount; i++) {
      this.lifetimes[i] -= delta;
      if (this.lifetimes[i] > 0) {
        const pIdx = i * 3;
        const targetIdx = aliveIndex * 3;

        this.positions[targetIdx] = this.positions[pIdx] + this.velocities[pIdx] * delta;
        this.positions[targetIdx + 1] = this.positions[pIdx + 1] + this.velocities[pIdx + 1] * delta;
        this.positions[targetIdx + 2] = this.positions[pIdx + 2] + this.velocities[pIdx + 2] * delta;

        this.velocities[targetIdx] = this.velocities[pIdx] * 0.92;
        this.velocities[targetIdx + 1] = this.velocities[pIdx + 1] * 0.92;
        this.velocities[targetIdx + 2] = this.velocities[pIdx + 2] * 0.92;

        const lifeRatio = this.lifetimes[i] / this.maxLifetimes[i];
        this.colors[targetIdx] = this.colors[pIdx] * lifeRatio;
        this.colors[targetIdx + 1] = this.colors[pIdx + 1] * lifeRatio;
        this.colors[targetIdx + 2] = this.colors[pIdx + 2] * lifeRatio;

        this.lifetimes[aliveIndex] = this.lifetimes[i];
        this.maxLifetimes[aliveIndex] = this.maxLifetimes[i];
        this.sizes[aliveIndex] = lifeRatio * 1.1;
        aliveIndex++;
      }
    }
    this.activeCount = aliveIndex;

    // Reset unused positions out of sight
    for (let i = this.activeCount; i < this.maxParticles; i++) {
      this.positions[i * 3 + 1] = -9999;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    if (this.geometry.attributes.size) {
      this.geometry.attributes.size.needsUpdate = true;
    }
  }

  public reset(): void {
    this.activeCount = 0;
    for (let i = 0; i < this.maxParticles; i++) {
      this.positions[i * 3 + 1] = -9999;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
