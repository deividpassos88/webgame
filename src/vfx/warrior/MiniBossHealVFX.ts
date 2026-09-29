import * as THREE from 'three';

export interface MiniBossHealPillarConfig {
  duration?: number;
  radius?: number;
  height?: number;
}

/**
 * Creates the exact healing pillar from Image 1:
 * - A glowing neon green ground ring at the player's feet
 * - A cylindrical translucent light field around the character
 * - Floating medical plus/cross (+) health symbols rising upwards
 * - Fully transparent and non-intrusive around the character body
 */
export class MiniBossHealVFX {
  public readonly group = new THREE.Group();
  private readonly container = new THREE.Group();
  private readonly cylinderMesh: THREE.Mesh;
  private readonly ringMesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private active = false;
  private elapsed = 0;
  private duration = 1.4;
  private targetPlayer: THREE.Object3D | null = null;

  public constructor() {
    this.group.name = 'MiniBossHealVFXGroup';
    this.container.name = 'MiniBossHealContainer';

    // Cylinder geometry surrounding player (open ended)
    const radius = 1.35;
    const height = 2.4;
    const geom = new THREE.CylinderGeometry(radius, radius, height, 32, 1, true);
    geom.translate(0, height / 2, 0);

    const texture = new THREE.TextureLoader().load('/vfx/warrior/heal-cylinder.png', (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
    });

    this.material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.cylinderMesh = new THREE.Mesh(geom, this.material);
    this.cylinderMesh.frustumCulled = false;

    // Floor neon ring
    const ringGeom = new THREE.RingGeometry(radius * 0.88, radius * 1.05, 48);
    ringGeom.rotateX(-Math.PI / 2);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x33ff77,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ringMesh = new THREE.Mesh(ringGeom, this.ringMaterial);
    this.ringMesh.position.y = 0.04;
    this.ringMesh.frustumCulled = false;

    this.container.add(this.cylinderMesh, this.ringMesh);
  }

  /**
   * Triggers the healing pillar when a mini-boss dies and restores a large amount of HP.
   */
  public triggerHeal(playerRoot: THREE.Object3D, config: MiniBossHealPillarConfig = {}): void {
    this.targetPlayer = playerRoot;
    this.duration = config.duration ?? 1.4;
    this.elapsed = 0;
    this.active = true;
    if (!this.group.children.includes(this.container)) {
      this.group.add(this.container);
    }
    this.container.position.copy(playerRoot.position);
    this.material.opacity = 1;
    this.ringMaterial.opacity = 1;
    this.cylinderMesh.rotation.y = 0;
  }

  public update(delta: number): void {
    if (!this.active) return;
    this.elapsed += delta;
    const progress = Math.min(1.0, this.elapsed / this.duration);

    // Follow player if moving
    if (this.targetPlayer) {
      this.container.position.copy(this.targetPlayer.position);
    }

    // Slow rotation of cylinder for dynamic floating crosses effect
    this.cylinderMesh.rotation.y += delta * 1.1;

    // Upward UV scroll so health crosses rise into the air
    if (this.material.map) {
      this.material.map.offset.y = -progress * 0.45;
    }

    // Pulse + fade out
    // Enter quickly (0.0 to 0.15s), stay bright, then smoothly dissolve
    let alpha = 1.0;
    if (progress < 0.15) {
      alpha = progress / 0.15;
    } else if (progress > 0.6) {
      alpha = Math.max(0, 1.0 - (progress - 0.6) / 0.4);
    }

    this.material.opacity = alpha * 0.95;
    this.ringMaterial.opacity = alpha * 1.0;

    // Slight expansion as it dissipates
    const scale = 1.0 + progress * 0.15;
    this.cylinderMesh.scale.set(scale, 1.0 + progress * 0.25, scale);
    this.ringMesh.scale.setScalar(scale);

    if (progress >= 1.0) {
      this.active = false;
      this.group.remove(this.container);
      this.material.opacity = 0;
      this.ringMaterial.opacity = 0;
    }
  }

  public reset(): void {
    this.active = false;
    this.group.remove(this.container);
    this.material.opacity = 0;
    this.ringMaterial.opacity = 0;
  }

  public dispose(): void {
    this.reset();
    this.cylinderMesh.geometry.dispose();
    this.ringMesh.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
    this.ringMaterial.dispose();
  }
}
