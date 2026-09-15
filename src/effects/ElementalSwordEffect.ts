import * as THREE from 'three';
import type { ElementalType } from '../combat/ElementalStatus';

const PARTICLE_COUNT = 14;

/** Small procedural fire/ice sheath that follows the equipped sword. */
export class ElementalSwordEffect {
  public readonly object = new THREE.Group();
  public element: ElementalType | null = null;

  private readonly bladeGroup = new THREE.Group();
  private readonly coreGeometry = new THREE.CylinderGeometry(0.025, 0.035, 1, 8, 1, true);
  private readonly auraGeometry = new THREE.CylinderGeometry(0.055, 0.075, 1, 10, 1, true);
  private readonly coreMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly auraMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly core = new THREE.Mesh(this.coreGeometry, this.coreMaterial);
  private readonly aura = new THREE.Mesh(this.auraGeometry, this.auraMaterial);
  private readonly particleGeometry = new THREE.BufferGeometry();
  private readonly particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  private readonly particleMaterial = new THREE.PointsMaterial({
    size: 0.055,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  private readonly particles = new THREE.Points(this.particleGeometry, this.particleMaterial);
  private elapsed = 0;
  private bladeLength = 1.4;
  private disposed = false;

  public constructor() {
    this.object.name = 'RuntimeWarrior_ElementalSword';
    this.core.name = 'ElementalSword_Core';
    this.aura.name = 'ElementalSword_Aura';
    this.particles.name = 'ElementalSword_Particles';
    this.particleGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.particlePositions, 3)
    );
    this.bladeGroup.add(this.aura, this.core, this.particles);
    this.object.add(this.bladeGroup);
    this.object.visible = false;
    this.seedParticles();
  }

  public get renderableCount(): number {
    let count = 0;
    this.object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh || (child as THREE.Points).isPoints) count += 1;
    });
    return count;
  }

  public get particleCount(): number {
    return PARTICLE_COUNT;
  }

  public attach(weapon: THREE.Object3D): void {
    if (this.disposed) return;
    this.object.removeFromParent();
    weapon.add(this.object);
    weapon.updateMatrixWorld(true);
    const baseAnchor = weapon.getObjectByName('VFX_SwordBase');
    const tipAnchor = weapon.getObjectByName('VFX_SwordTip');
    const base = baseAnchor
      ? weapon.worldToLocal(baseAnchor.getWorldPosition(new THREE.Vector3()))
      : new THREE.Vector3(0, 0.12, 0);
    const tip = tipAnchor
      ? weapon.worldToLocal(tipAnchor.getWorldPosition(new THREE.Vector3()))
      : new THREE.Vector3(0, 1.48, 0);
    const direction = tip.clone().sub(base);
    this.bladeLength = Math.max(0.2, direction.length());
    direction.normalize();
    this.bladeGroup.position.copy(base).add(tip).multiplyScalar(0.5);
    this.bladeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    this.bladeGroup.scale.set(1, this.bladeLength, 1);
    this.seedParticles();
    this.clear();
  }

  public activate(element: ElementalType | null): void {
    if (this.disposed || !this.object.parent || element === null) {
      this.clear();
      return;
    }
    this.element = element;
    const fire = element === 'fire';
    this.coreMaterial.color.setHex(fire ? 0xfff0a3 : 0xd9f7ff);
    this.auraMaterial.color.setHex(fire ? 0xff5a16 : 0x42bfff);
    this.particleMaterial.color.setHex(fire ? 0xff8a25 : 0x8de7ff);
    this.particleMaterial.size = fire ? 0.07 : 0.045;
    this.object.visible = true;
  }

  public update(delta = 0): void {
    if (!this.object.visible || !this.element) return;
    this.elapsed += Math.max(0, Number.isFinite(delta) ? delta : 0);
    const pulse = 0.86 + Math.sin(this.elapsed * (this.element === 'fire' ? 18 : 7)) * 0.12;
    this.auraMaterial.opacity = (this.element === 'fire' ? 0.38 : 0.3) * pulse;
    this.coreMaterial.opacity = 0.76 + pulse * 0.16;
    const position = this.particleGeometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const offset = index * 3;
      const phase = index * 1.73 + this.elapsed * (this.element === 'fire' ? 2.8 : 0.65);
      this.particlePositions[offset] = Math.sin(phase * 2.1) * (this.element === 'fire' ? 0.07 : 0.045);
      this.particlePositions[offset + 1] = ((index / (PARTICLE_COUNT - 1) + this.elapsed * 0.32) % 1) - 0.5;
      this.particlePositions[offset + 2] = Math.cos(phase * 1.7) * (this.element === 'fire' ? 0.06 : 0.04);
    }
    position.needsUpdate = true;
  }

  public clear(): void {
    this.element = null;
    this.object.visible = false;
  }

  public detach(): void {
    this.clear();
    this.object.removeFromParent();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detach();
    this.coreGeometry.dispose();
    this.auraGeometry.dispose();
    this.particleGeometry.dispose();
    this.coreMaterial.dispose();
    this.auraMaterial.dispose();
    this.particleMaterial.dispose();
  }

  private seedParticles(): void {
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const offset = index * 3;
      const phase = index * 2.399;
      this.particlePositions[offset] = Math.sin(phase) * 0.05;
      this.particlePositions[offset + 1] = index / (PARTICLE_COUNT - 1) - 0.5;
      this.particlePositions[offset + 2] = Math.cos(phase) * 0.05;
    }
    (this.particleGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
