import * as THREE from 'three';
import type { WarriorSkillId } from '../combat/WarriorSkillCatalog';
import { getWarriorSkillArea } from '../combat/WarriorSkillArea';
import { getWarriorAttackVfxProfile } from './WarriorAttackVfxProfiles';

const SEGMENTS = 64;
const DURATION = 0.7;

/** Pooled ground decal whose geometry is driven by the real combat area policy. */
export class WarriorSkillAreaIndicator {
  public readonly object: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly positions = new Float32Array((SEGMENTS + 2) * 3);
  private readonly positionAttribute = new THREE.BufferAttribute(this.positions, 3);
  private remaining = 0;

  public constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', this.positionAttribute);
    const indices = new Uint16Array(SEGMENTS * 3);
    for (let index = 0; index < SEGMENTS; index += 1) {
      const offset = index * 3;
      indices[offset] = 0;
      indices[offset + 1] = index + 1;
      indices[offset + 2] = index + 2;
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    const material = new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.object = new THREE.Mesh(geometry, material);
    this.object.name = 'RuntimeWarrior_SkillArea';
    this.object.rotation.x = -Math.PI / 2;
    this.object.position.y = 0.045;
    this.object.visible = false;
    this.object.frustumCulled = false;
  }

  public show(id: WarriorSkillId, origin: THREE.Vector3, forward: THREE.Vector3): void {
    const area = getWarriorSkillArea(id);
    const flatForward = new THREE.Vector3(forward.x, 0, forward.z);
    if (flatForward.lengthSq() < 1e-8) flatForward.set(0, 0, 1);
    else flatForward.normalize();
    this.object.position.copy(origin);
    this.object.position.y += 0.045;
    if (area.shape === 'impact') {
      this.object.position.addScaledVector(flatForward, area.forwardOffset ?? 0);
    }
    this.object.rotation.set(-Math.PI / 2, 0, Math.atan2(flatForward.x, flatForward.z));
    this.positions.fill(0);
    const sweep = area.shape === 'arc'
      ? THREE.MathUtils.degToRad(area.angleDegrees ?? 360)
      : Math.PI * 2;
    const start = area.shape === 'arc' ? -sweep / 2 : 0;
    for (let index = 0; index <= SEGMENTS; index += 1) {
      const theta = start + sweep * (index / SEGMENTS);
      const offset = (index + 1) * 3;
      this.positions[offset] = Math.sin(theta) * area.radius;
      this.positions[offset + 1] = Math.cos(theta) * area.radius;
    }
    this.positionAttribute.needsUpdate = true;
    this.object.material.color.setHex(getWarriorAttackVfxProfile(id).secondary);
    this.object.material.opacity = 0.42;
    this.object.userData.area = area;
    this.remaining = DURATION;
    this.object.visible = true;
  }

  public update(delta: number): void {
    if (!this.object.visible) return;
    const elapsed = Number.isFinite(delta) && delta > 0 ? delta : 0;
    this.remaining = Math.max(0, this.remaining - elapsed);
    this.object.material.opacity = 0.42 * (this.remaining / DURATION);
    if (this.remaining === 0) this.clear();
  }

  public clear(): void {
    this.remaining = 0;
    this.object.visible = false;
    this.object.material.opacity = 0;
  }

  public dispose(): void {
    this.clear();
    this.object.removeFromParent();
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}
