import * as THREE from 'three';

const ARRIVAL_DISTANCE = 0.2;

export interface HealthPlasmaResources {
  readonly coreGeometry: THREE.SphereGeometry;
  readonly haloGeometry: THREE.SphereGeometry;
  readonly tailGeometry: THREE.ConeGeometry;
  readonly coreMaterial: THREE.MeshBasicMaterial;
  readonly haloMaterial: THREE.MeshBasicMaterial;
  readonly tailMaterial: THREE.MeshBasicMaterial;
}

export function createHealthPlasmaResources(): HealthPlasmaResources {
  const size = 0.1;
  const tailLength = size * 3.6;
  const tailGeometry = new THREE.ConeGeometry(size * 0.18, tailLength, 10, 1, true);
  tailGeometry.translate(0, tailLength / 2, 0);
  tailGeometry.rotateX(-Math.PI / 2);
  return {
    coreGeometry: new THREE.SphereGeometry(size, 16, 12),
    haloGeometry: new THREE.SphereGeometry(size * 1.35, 16, 12),
    tailGeometry,
    coreMaterial: new THREE.MeshBasicMaterial({ color: 0x55d7ff }),
    haloMaterial: new THREE.MeshBasicMaterial({
      color: 0xb9f3ff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    tailMaterial: new THREE.MeshBasicMaterial({
      color: 0x8fe9ff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  };
}

export function disposeHealthPlasmaResources(resources: HealthPlasmaResources): void {
  resources.coreGeometry.dispose();
  resources.haloGeometry.dispose();
  resources.tailGeometry.dispose();
  resources.coreMaterial.dispose();
  resources.haloMaterial.dispose();
  resources.tailMaterial.dispose();
}

export class HealthPlasma {
  public readonly root = new THREE.Group();
  public readonly healAmount: number;
  public arrived = false;

  private elapsed = 0;
  private readonly tail: THREE.Mesh;
  private readonly ownsResources: boolean;
  private readonly resources: HealthPlasmaResources;

  public constructor(
    source: THREE.Vector3,
    healAmount: number,
    sharedResources?: HealthPlasmaResources
  ) {
    this.healAmount = healAmount;
    this.root.name = 'health-plasma';
    this.root.position.copy(source);

    this.ownsResources = sharedResources === undefined;
    this.resources = sharedResources ?? createHealthPlasmaResources();
    const sizeScale = healAmount >= 7 ? 1.2 : 1;
    const core = new THREE.Mesh(this.resources.coreGeometry, this.resources.coreMaterial);
    core.name = 'health-plasma-head';
    core.scale.set(0.82 * sizeScale, 0.82 * sizeScale, 1.18 * sizeScale);
    const halo = new THREE.Mesh(this.resources.haloGeometry, this.resources.haloMaterial);
    halo.scale.set(0.8 * sizeScale, 0.8 * sizeScale, 1.1 * sizeScale);
    this.tail = new THREE.Mesh(this.resources.tailGeometry, this.resources.tailMaterial);
    this.tail.scale.setScalar(sizeScale);
    this.tail.name = 'health-plasma-tail';
    // Os materiais emissivos já deixam o plasma legível. Evitar uma PointLight
    // por gota mantém a contagem de luzes estável durante ondas com muitos drops.
    this.root.add(this.tail, halo, core);
  }

  public update(delta: number, playerBody: THREE.Vector3): boolean {
    if (this.arrived) return true;

    const elapsed = Math.max(0, delta);
    this.elapsed += elapsed;
    const distance = this.root.position.distanceTo(playerBody);
    if (distance <= ARRIVAL_DISTANCE) {
      this.arrived = true;
      return true;
    }

    const homingSpeed = 5.5 + Math.min(8, this.elapsed * 5);
    const progress = 1 - Math.exp(-homingSpeed * elapsed);
    this.root.lookAt(playerBody);
    this.root.position.lerp(playerBody, progress);
    this.tail.rotation.z = Math.sin(this.elapsed * 13) * 0.12;
    const pulse = 1 + Math.sin(this.elapsed * 14) * 0.12;
    this.root.scale.setScalar(pulse);

    if (this.root.position.distanceTo(playerBody) <= ARRIVAL_DISTANCE) {
      this.arrived = true;
    }
    return this.arrived;
  }

  public dispose(): void {
    this.root.removeFromParent();
    if (this.ownsResources) disposeHealthPlasmaResources(this.resources);
  }
}
