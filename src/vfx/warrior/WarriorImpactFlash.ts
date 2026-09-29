import * as THREE from 'three';

export class WarriorImpactFlash {
  public readonly group = new THREE.Group();
  private readonly flashes: {
    mesh: THREE.Mesh;
    elapsed: number;
    duration: number;
  }[] = [];

  private readonly geometry: THREE.PlaneGeometry;
  private readonly texture: THREE.Texture;

  public constructor() {
    this.group.name = 'WarriorImpactFlashRoot';
    this.geometry = new THREE.PlaneGeometry(1.4, 1.4);
    this.texture = new THREE.TextureLoader().load('/vfx/warrior/impact-flare.png');
  }

  public triggerImpact(position: THREE.Vector3, color: THREE.ColorRepresentation = 0x66ddff): void {
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      color: new THREE.Color(color),
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(this.geometry, mat);
    mesh.position.copy(position);
    mesh.position.y += 0.9;
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(0.7);

    this.group.add(mesh);
    this.flashes.push({
      mesh,
      elapsed: 0,
      duration: 0.18,
    });
  }

  public update(delta: number): void {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.elapsed += delta;
      const progress = f.elapsed / f.duration;

      if (progress >= 1.0) {
        this.group.remove(f.mesh);
        if (Array.isArray(f.mesh.material)) {
          f.mesh.material.forEach((m) => m.dispose());
        } else {
          f.mesh.material.dispose();
        }
        this.flashes.splice(i, 1);
        continue;
      }

      // Quick burst scale + fast fade
      f.mesh.scale.setScalar(0.7 + progress * 1.1);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1.0 - progress);
    }
  }

  public reset(): void {
    for (const f of this.flashes) {
      this.group.remove(f.mesh);
      if (Array.isArray(f.mesh.material)) {
        f.mesh.material.forEach((m) => m.dispose());
      } else {
        f.mesh.material.dispose();
      }
    }
    this.flashes.length = 0;
  }

  public dispose(): void {
    this.reset();
    this.geometry.dispose();
    this.texture.dispose();
  }
}
