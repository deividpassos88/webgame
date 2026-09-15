import * as THREE from 'three';
import { getChestPulseFrame, getCollapseFrame } from '../effects/ChestStyleEffect';

const OPEN_DURATION = 0.7;
const FADE_DURATION = 0.45;

export class RewardChest {
  public readonly root = new THREE.Group();
  public readonly interactionRadius = 2.2;
  public readonly collisionRadius: number;

  private readonly modelPivot = new THREE.Group();
  private readonly fadeMaterials: THREE.Material[] = [];
  private readonly glowMaterials: Array<{
    material: THREE.MeshStandardMaterial;
    baseEmissiveIntensity: number;
  }> = [];
  private glowStrength = 2.2;
  private opening = false;
  private opened = false;
  private claimed = false;
  private removeReady = false;
  private openingElapsed = 0;
  private fadeElapsed = 0;

  constructor(model: THREE.Group) {
    this.root.userData.isRewardChestRoot = true;
    this.root.name = 'initial-equipment-chest';

    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const cloned = materials.map((material) => {
        const copy = material.clone();
        this.fadeMaterials.push(copy);
        if (copy instanceof THREE.MeshStandardMaterial) {
          copy.emissive.lerp(new THREE.Color(0xffb800), 0.22);
          const baseEmissiveIntensity = Math.max(copy.emissiveIntensity, 0.12);
          copy.emissiveIntensity = baseEmissiveIntensity;
          this.glowMaterials.push({ material: copy, baseEmissiveIntensity });
        }
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
    });

    model.scale.multiplyScalar(0.65);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    if (!bounds.isEmpty()) {
      const size = bounds.getSize(new THREE.Vector3());
      this.collisionRadius = Math.max(size.x, size.z) * 0.5;
      model.position.y -= bounds.min.y;
    } else {
      this.collisionRadius = 0.65;
    }

    this.modelPivot.add(model);
    this.root.add(this.modelPivot);
    this.root.updateMatrixWorld(true);
  }

  public get openingComplete(): boolean {
    return this.opened;
  }

  public get removable(): boolean {
    return this.removeReady;
  }

  public get glowIntensity(): number {
    return this.glowStrength;
  }

  public beginOpening(): boolean {
    if (this.opening || this.opened || this.claimed) return false;
    this.opening = true;
    return true;
  }

  public claim(): void {
    if (this.claimed) return;
    this.claimed = true;
    this.opening = false;
  }

  public update(delta: number): void {
    // O pulso é mantido como estado visual sem acrescentar uma PointLight à cena.
    if (!this.opening && !this.claimed) {
      const pulse = 2.2 + Math.sin(performance.now() * 0.003) * 0.7;
      this.setGlowStrength(pulse);
    }

    if (this.opening) {
      this.openingElapsed = Math.min(
        OPEN_DURATION,
        this.openingElapsed + Math.max(0, delta)
      );
      const progress = this.openingElapsed / OPEN_DURATION;
      const frame = getChestPulseFrame(progress);
      this.root.rotation.z = frame.rotationZ;
      this.root.scale.set(frame.scaleXZ, frame.scaleY, frame.scaleXZ);
      this.modelPivot.position.y = frame.lift;
      this.setGlowStrength(frame.lightIntensity);

      if (progress >= 1) {
        this.opening = false;
        this.opened = true;
        this.root.rotation.z = 0;
        this.root.scale.setScalar(1);
      }
    }

    if (this.claimed && !this.removeReady) {
      this.fadeElapsed = Math.min(
        FADE_DURATION,
        this.fadeElapsed + Math.max(0, delta)
      );
      const frame = getCollapseFrame(this.fadeElapsed / FADE_DURATION);
      for (const material of this.fadeMaterials) {
        material.transparent = true;
        material.opacity = frame.opacity;
      }
      this.setGlowStrength(this.glowStrength * frame.opacity);
      this.root.scale.setScalar(frame.scale);
      if (frame.complete) this.removeReady = true;
    }
  }

  public dispose(): void {
    for (const material of this.fadeMaterials) material.dispose();
    this.root.removeFromParent();
  }

  private setGlowStrength(value: number): void {
    this.glowStrength = Math.max(0, value);
    const multiplier = THREE.MathUtils.clamp(this.glowStrength / 2.2, 0, 3);
    for (const { material, baseEmissiveIntensity } of this.glowMaterials) {
      material.emissiveIntensity = baseEmissiveIntensity * multiplier;
    }
  }
}
