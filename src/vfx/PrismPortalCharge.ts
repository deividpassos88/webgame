import * as THREE from 'three';
import type { PoolableVFX } from './VFXPool';
import type { MageVFXResources } from './MageVFXResources';

const NORMAL = new THREE.Vector3(0, 0, 1);
const POSITION = new THREE.Vector3();
const DIRECTION = new THREE.Vector3();

/**
 * Portal de carga EXCLUSIVO do Raio Prismático (Maga, tecla 4).
 * Ele precede o disparo: o portal se abre, pulsa e desaparece quando o
 * laser é lançado. Não é o MagicCircleVFX de nenhuma outra habilidade.
 */
export class PrismPortalCharge implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly rings: THREE.Mesh[] = [];
  private readonly glow: THREE.Sprite;
  private readonly core: THREE.Sprite;
  private readonly sparks: THREE.LineSegments;
  private originProvider: ((out: THREE.Vector3) => THREE.Vector3) | null = null;
  private readonly direction = new THREE.Vector3(0, 0, 1);
  private age = 0;

  public constructor(resources: MageVFXResources) {
    this.group.name = 'MagePrismChargePortalVFX';
    this.group.visible = false;
    for (const [radius, thickness, color] of [
      [0.96, 0.063, 0x1958ff],
      [0.79, 0.026, 0x61a4ff],
      [0.56, 0.012, 0xa1f2ff],
    ] as const) {
      const material = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0, depthWrite: false,
        depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 10, 72), material);
      mesh.name = 'MagePrismChargeRing';
      this.rings.push(mesh);
      this.group.add(mesh);
    }

    const spriteMaterial = (color: number) => new THREE.SpriteMaterial({
      map: resources.softGlow, color, transparent: true, opacity: 0,
      depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.glow = new THREE.Sprite(spriteMaterial(0x2d6fff));
    this.core = new THREE.Sprite(spriteMaterial(0xe5ffff));
    this.glow.name = 'MagePrismPortalBlueHalo';
    this.core.name = 'MagePrismChargeWhiteCore';
    this.glow.scale.set(3.6, 3.6, 1);
    this.core.scale.set(0.48, 0.48, 1);
    this.group.add(this.glow, this.core);

    const vertices: number[] = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI * 2) / 12;
      const radius = i % 3 === 0 ? 1.48 : 1.2;
      vertices.push(
        Math.cos(angle) * radius * 0.78, Math.sin(angle) * radius * 0.78, 0,
        Math.cos(angle) * radius, Math.sin(angle) * radius, 0
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    this.sparks = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      color: 0x94deff, transparent: true, opacity: 0, depthWrite: false,
      depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.sparks.name = 'MagePrismPortalSparks';
    this.group.add(this.sparks);
  }

  public play(originProvider: (out: THREE.Vector3) => THREE.Vector3, direction: THREE.Vector3): void {
    this.originProvider = originProvider;
    this.direction.copy(direction);
    if (this.direction.lengthSq() < 1e-8) this.direction.set(0, 0, 1);
    this.direction.normalize();
    this.age = 0;
    this.group.visible = true;
    this.update(0.016);
  }

  public update(delta: number): void {
    if (!this.originProvider) return;
    this.age += Math.max(0, delta);
    this.originProvider(POSITION);
    this.group.position.copy(POSITION);
    DIRECTION.copy(this.direction).normalize();
    this.group.quaternion.setFromUnitVectors(NORMAL, DIRECTION);

    const appear = THREE.MathUtils.smoothstep(this.age, 0, 0.16);
    const pulse = 1 + Math.sin(this.age * 22) * 0.06;
    this.group.scale.setScalar((0.53 + 0.47 * appear) * pulse);
    for (let i = 0; i < this.rings.length; i++) {
      const mesh = this.rings[i];
      (mesh.material as THREE.MeshBasicMaterial).opacity = (0.77 - i * 0.14) * appear;
      mesh.rotation.z = this.age * (i % 2 === 0 ? 0.33 : -0.28);
    }
    (this.glow.material as THREE.SpriteMaterial).opacity = 0.33 * appear;
    (this.core.material as THREE.SpriteMaterial).opacity = 0.94 * appear;
    (this.sparks.material as THREE.LineBasicMaterial).opacity =
      0.45 * appear * (0.5 + 0.5 * Math.sin(this.age * 31));
    this.sparks.rotation.z += Math.max(0, delta) * 1.4;
  }

  public reset(): void {
    this.originProvider = null;
    this.age = 0;
    this.group.visible = false;
    this.group.removeFromParent();
  }

  public dispose(): void {
    this.reset();
    for (const ring of this.rings) {
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
    }
    (this.glow.material as THREE.Material).dispose();
    (this.core.material as THREE.Material).dispose();
    this.sparks.geometry.dispose();
    (this.sparks.material as THREE.Material).dispose();
  }
}
