import * as THREE from 'three';
import {
  MINI_BOSS_SKILL_GEOMETRY,
  type MiniBossSkillEvent,
} from '../combat/MiniBossSkillController';

interface ActiveEffect {
  kind: MiniBossSkillEvent['type'];
  skill: MiniBossSkillEvent['skill'];
  ownerId?: string;
  origin: THREE.Vector3;
  target: THREE.Vector3;
  group: THREE.Group;
  telegraphCircle: THREE.Mesh | null;
  telegraphRectangle: THREE.Group | null;
  fresh: boolean;
  age: number;
  duration: number;
  baseOpacity: number;
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
}

const WARNING_COLOR = 0xff1f16;
const IMPACT_COLOR = 0xff7a1a;
const IMPACT_DURATIONS: Readonly<Record<MiniBossSkillEvent['skill'], number>> = {
  circle: 0.48,
  rectangle: 0.36,
};

/**
 * Lightweight runtime telegraphs for mini-boss abilities.
 *
 * Effects are keyed by owner and skill. Retarget events mutate the existing
 * warning transform, which allows one shared renderer to display independent
 * mini-boss controllers without allocating a mesh every frame. Use
 * `clear(ownerId)` when removing one mini-boss or `clear()` when tearing down
 * the whole encounter.
 */
export class MiniBossSkillEffects {
  private readonly active: ActiveEffect[] = [];

  public constructor(private readonly scene: THREE.Scene) {}

  public get activeObjectCount(): number {
    return this.active.length;
  }

  public handle(event: MiniBossSkillEvent): void {
    if (event.type === 'retarget') {
      this.retargetTelegraph(event);
      return;
    }

    const existingTelegraph = this.active.find((effect) =>
      effect.kind === 'telegraph'
      && effect.skill === event.skill
      && effect.ownerId === event.ownerId
    );
    if (existingTelegraph) {
      existingTelegraph.origin.copy(event.origin);
      existingTelegraph.target.copy(event.target);
      this.applyTelegraphTransform(existingTelegraph);
      if (event.type === 'telegraph') {
        existingTelegraph.duration = Math.max(
          existingTelegraph.age,
          event.secondsUntilImpact
        );
        return;
      }
    }

    const effect = this.createEffect(event);
    if (event.type === 'telegraph') this.createTelegraph(effect, event);
    else this.createImpact(effect, event);
    this.scene.add(effect.group);
    this.active.push(effect);
  }

  public update(delta: number): void {
    const elapsed = Number.isFinite(delta) && delta > 0 ? delta : 0;
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const effect = this.active[index];
      if (effect.fresh) {
        effect.fresh = false;
        continue;
      }
      effect.age += elapsed;
      const progress = THREE.MathUtils.clamp(effect.age / effect.duration, 0, 1);

      if (effect.kind === 'telegraph') {
        this.updateTelegraph(effect);
      } else {
        effect.group.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.scale.setScalar(1 + progress * 0.2);
        });
        this.setOpacity(effect, effect.baseOpacity * (1 - progress));
      }

      if (effect.age >= effect.duration) this.disposeAt(index);
    }
  }

  public clear(ownerId?: string): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      if (ownerId !== undefined && this.active[index].ownerId !== ownerId) continue;
      this.disposeAt(index);
    }
  }

  public dispose(): void {
    this.clear();
  }

  private createTelegraph(effect: ActiveEffect, event: MiniBossSkillEvent): void {
    const material = new THREE.MeshBasicMaterial({
      color: WARNING_COLOR,
      transparent: true,
      opacity: effect.baseOpacity,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    effect.materials.add(material);

    if (event.skill === 'circle') {
      const geometry = new THREE.CircleGeometry(MINI_BOSS_SKILL_GEOMETRY.circleRadius, 32);
      effect.geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'mini-boss-skill-warning-circle';
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(event.target.x, event.target.y + 0.05, event.target.z);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      effect.group.add(mesh);
      effect.telegraphCircle = mesh;
      return;
    }

    const geometry = new THREE.PlaneGeometry(
      MINI_BOSS_SKILL_GEOMETRY.rectangleWidth,
      MINI_BOSS_SKILL_GEOMETRY.rectangleLength
    );
    effect.geometries.add(geometry);
    const group = this.createOrientedGroundGroup(event.origin, event.target);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'mini-boss-skill-warning-rectangle';
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    effect.group.add(group);
    effect.telegraphRectangle = group;
  }

  private createImpact(effect: ActiveEffect, event: MiniBossSkillEvent): void {
    const material = new THREE.MeshBasicMaterial({
      color: IMPACT_COLOR,
      transparent: true,
      opacity: effect.baseOpacity,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    effect.materials.add(material);

    if (event.skill === 'circle') {
      const geometry = new THREE.RingGeometry(0.6, 1.8, 24);
      effect.geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'mini-boss-skill-impact';
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(event.target.x, event.target.y + 0.08, event.target.z);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      effect.group.add(mesh);
      return;
    }

    const geometry = new THREE.PlaneGeometry(
      MINI_BOSS_SKILL_GEOMETRY.rectangleWidth,
      MINI_BOSS_SKILL_GEOMETRY.rectangleLength
    );
    effect.geometries.add(geometry);
    const group = this.createOrientedGroundGroup(event.origin, event.target);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'mini-boss-skill-impact';
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(0.96);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    effect.group.add(group);
  }

  private createOrientedGroundGroup(
    origin: THREE.Vector3,
    target: THREE.Vector3
  ): THREE.Group {
    const group = new THREE.Group();
    this.updateOrientedGroundGroup(group, origin, target);
    return group;
  }

  private createEffect(event: MiniBossSkillEvent): ActiveEffect {
    return {
      kind: event.type,
      skill: event.skill,
      ...(event.ownerId === undefined ? {} : { ownerId: event.ownerId }),
      origin: event.origin.clone(),
      target: event.target.clone(),
      group: new THREE.Group(),
      telegraphCircle: null,
      telegraphRectangle: null,
      fresh: true,
      age: 0,
      duration: event.type === 'telegraph'
        ? Math.max(0, event.secondsUntilImpact)
        : IMPACT_DURATIONS[event.skill],
      baseOpacity: event.type === 'telegraph' ? 0.24 : 0.56,
      geometries: new Set(),
      materials: new Set(),
    };
  }

  private updateTelegraph(effect: ActiveEffect): void {
    const pulse = 0.68 + (Math.sin(effect.age * 7) + 1) * 0.16;
    this.setOpacity(effect, effect.baseOpacity * pulse);
  }

  private retargetTelegraph(event: MiniBossSkillEvent): void {
    const effect = this.active.find((candidate) =>
      candidate.kind === 'telegraph'
      && candidate.skill === event.skill
      && candidate.ownerId === event.ownerId
    );
    if (!effect) return;
    effect.origin.copy(event.origin);
    effect.target.copy(event.target);
    this.applyTelegraphTransform(effect);
  }

  private applyTelegraphTransform(effect: ActiveEffect): void {
    if (effect.telegraphCircle) {
      effect.telegraphCircle.position.set(
        effect.target.x,
        effect.target.y + 0.05,
        effect.target.z
      );
    }
    if (effect.telegraphRectangle) {
      this.updateOrientedGroundGroup(
        effect.telegraphRectangle,
        effect.origin,
        effect.target
      );
    }
  }

  private updateOrientedGroundGroup(
    group: THREE.Group,
    origin: THREE.Vector3,
    target: THREE.Vector3
  ): void {
    const direction = new THREE.Vector3().subVectors(target, origin);
    direction.y = 0;
    if (direction.lengthSq() < 1e-9) direction.set(0, 0, 1);
    direction.normalize();
    group.position.copy(origin).addScaledVector(
      direction,
      MINI_BOSS_SKILL_GEOMETRY.rectangleLength * 0.5
    );
    group.position.y += 0.05;
    group.rotation.y = Math.atan2(direction.x, direction.z);
  }

  private setOpacity(effect: ActiveEffect, opacity: number): void {
    effect.materials.forEach((material) => {
      if ('opacity' in material) {
        (material as THREE.Material & { opacity: number }).opacity = opacity;
      }
    });
  }

  private disposeAt(index: number): void {
    const [effect] = this.active.splice(index, 1);
    effect.group.removeFromParent();
    effect.geometries.forEach((geometry) => geometry.dispose());
    effect.materials.forEach((material) => material.dispose());
  }
}
