import * as THREE from 'three';
import {
  MINI_BOSS_SKILL_GEOMETRY,
  type MiniBossSkillEvent,
} from '../combat/MiniBossSkillController';
import {
  RECT_BLAST_SWEEP_SECONDS,
  createBlastWallMaterial,
  createCircleImpactMaterial,
  createCircleScorchMaterial,
  createCircleTelegraphMaterial,
  createDomeMaterial,
  createFireColumnMaterial,
  createRectImpactMaterial,
  createRectScorchMaterial,
  createRectTelegraphMaterial,
} from './MiniBossSkillShaders';
import { createParticleBurst, smooth, type ParticleSpec } from './SkillParticles';

/** Footprint of the skills a renderer draws (mini-boss by default, boss is 2x). */
export interface SkillEffectGeometry {
  readonly circleRadius: number;
  readonly rectangleLength: number;
  readonly rectangleWidth: number;
}

export interface SkillEffectsOptions {
  readonly geometry?: SkillEffectGeometry;
  /** Multiplies how long the impact lingers (heavier skills last longer). */
  readonly durationScale?: number;
}

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
  /** Per-frame animation hook (shader uniforms, particles). */
  tick: ((age: number, progress: number) => void) | null;
}

/** Impact effects linger to show scorch marks cooling down. */
export const IMPACT_DURATIONS: Readonly<Record<MiniBossSkillEvent['skill'], number>> = {
  circle: 1.9,
  rectangle: 1.7,
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
  /** Fired once per impact so the game can shake the camera, play audio, etc. */
  public onImpact: ((event: MiniBossSkillEvent) => void) | null = null;

  private readonly geometry: SkillEffectGeometry;
  private readonly durationScale: number;

  public constructor(private readonly scene: THREE.Scene, options: SkillEffectsOptions = {}) {
    this.geometry = options.geometry ?? MINI_BOSS_SKILL_GEOMETRY;
    this.durationScale = options.durationScale ?? 1;
  }

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
    if (event.type === 'impact') this.onImpact?.(event);
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

      effect.tick?.(effect.age, progress);

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
    const material = event.skill === 'circle'
      ? createCircleTelegraphMaterial()
      : createRectTelegraphMaterial();
    effect.materials.add(material);
    const uniforms = material.uniforms;
    // Gentle random phase so several telegraphs never pulse in lockstep.
    const phase = Math.random() * 10;
    effect.tick = (age) => {
      uniforms.uTime.value = age + phase;
      uniforms.uProgress.value = THREE.MathUtils.clamp(age / Math.max(effect.duration, 1e-3), 0, 1);
      uniforms.uIntro.value = smooth(0, 0.28, age);
    };
    effect.tick(0, 0);

    if (event.skill === 'circle') {
      const geometry = new THREE.CircleGeometry(this.geometry.circleRadius, 96);
      effect.geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'mini-boss-skill-warning-circle';
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(event.target.x, event.target.y + 0.05, event.target.z);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 3;
      effect.group.add(mesh);
      effect.telegraphCircle = mesh;
      return;
    }

    const geometry = new THREE.PlaneGeometry(
      this.geometry.rectangleWidth,
      this.geometry.rectangleLength
    );
    effect.geometries.add(geometry);
    const group = this.createOrientedGroundGroup(event.origin, event.target);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'mini-boss-skill-warning-rectangle';
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 3;
    group.add(mesh);
    effect.group.add(group);
    effect.telegraphRectangle = group;
  }

  private createImpact(effect: ActiveEffect, event: MiniBossSkillEvent): void {
    if (event.skill === 'circle') this.createCircleImpact(effect, event);
    else this.createRectangleImpact(effect, event);
  }

  /**
   * Circle: white-hot flash, two shockwave rings, glowing lava cracks, fireball
   * column, fresnel dome, sparks / embers / smoke and a lingering scorch mark.
   */
  private createCircleImpact(effect: ActiveEffect, event: MiniBossSkillEvent): void {
    const radius = this.geometry.circleRadius;
    const k = radius / MINI_BOSS_SKILL_GEOMETRY.circleRadius;
    const duration = effect.duration;
    const seed = Math.random() * 40;
    const flashRadius = radius * 1.12;

    const scorchMaterial = createCircleScorchMaterial(duration, seed);
    const scorchGeometry = new THREE.CircleGeometry(radius * 1.05, 64);
    const scorch = new THREE.Mesh(scorchGeometry, scorchMaterial);
    scorch.name = 'mini-boss-skill-scorch';
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(event.target.x, event.target.y + 0.06, event.target.z);
    scorch.renderOrder = 1;

    const flashMaterial = createCircleImpactMaterial(flashRadius / k, seed);
    const flashGeometry = new THREE.CircleGeometry(flashRadius, 96);
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.name = 'mini-boss-skill-impact';
    flash.rotation.x = -Math.PI / 2;
    flash.position.set(event.target.x, event.target.y + 0.08, event.target.z);
    flash.renderOrder = 4;

    const domeMaterial = createDomeMaterial();
    const domeGeometry = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeometry, domeMaterial);
    dome.name = 'mini-boss-skill-dome';
    dome.position.set(event.target.x, event.target.y, event.target.z);
    dome.scale.setScalar(0.01);
    dome.renderOrder = 5;

    const columnMaterial = createFireColumnMaterial(seed);
    const columnGeometry = new THREE.CylinderGeometry(1, 1.55, 1, 40, 1, true);
    columnGeometry.translate(0, 0.5, 0);
    const column = new THREE.Mesh(columnGeometry, columnMaterial);
    column.name = 'mini-boss-skill-fire-column';
    column.position.set(event.target.x, event.target.y, event.target.z);
    column.renderOrder = 5;

    effect.geometries.add(scorchGeometry);
    effect.geometries.add(flashGeometry);
    effect.geometries.add(domeGeometry);
    effect.geometries.add(columnGeometry);
    effect.materials.add(scorchMaterial);
    effect.materials.add(flashMaterial);
    effect.materials.add(domeMaterial);
    effect.materials.add(columnMaterial);
    effect.group.add(scorch, flash, dome, column);

    const particleRoot = new THREE.Group();
    particleRoot.position.set(event.target.x, event.target.y, event.target.z);
    effect.group.add(particleRoot);
    const updaters = [
      this.burst(effect, particleRoot, k, {
        count: 120,
        size: 0.5,
        color: 0xffa23a,
        additive: true,
        opacity: 1,
        life: [0.7, 1.5],
        gravity: 22,
        drag: 0.9,
        spawn: (_i, out) => {
          const angle = Math.random() * Math.PI * 2;
          const ring = Math.random() * 2.2;
          const speed = 7 + Math.random() * 17;
          out.position.set(Math.cos(angle) * ring, 0.2, Math.sin(angle) * ring);
          out.velocity.set(Math.cos(angle) * speed, 6 + Math.random() * 15, Math.sin(angle) * speed);
          out.delay = Math.random() * 0.08;
        },
      }),
      this.burst(effect, particleRoot, k, {
        count: 80,
        size: 0.32,
        color: 0xffd47a,
        additive: true,
        opacity: 1,
        life: [1.1, 1.9],
        gravity: -1.6,
        drag: 0.45,
        spawn: (_i, out) => {
          const angle = Math.random() * Math.PI * 2;
          const distance = Math.sqrt(Math.random()) * radius * 0.9;
          out.position.set(Math.cos(angle) * distance, 0.1, Math.sin(angle) * distance);
          out.velocity.set((Math.random() - 0.5) * 2.4, 2.2 + Math.random() * 4.6, (Math.random() - 0.5) * 2.4);
          out.delay = 0.05 + Math.random() * 0.45;
        },
      }),
      this.burst(effect, particleRoot, k, {
        count: 30,
        size: 5.5,
        growth: 0.7,
        color: 0x3a312e,
        additive: false,
        opacity: 0.55,
        life: [1.3, 1.85],
        gravity: -0.35,
        drag: 1.4,
        spawn: (_i, out) => {
          const angle = Math.random() * Math.PI * 2;
          const distance = 1.5 + Math.random() * radius * 0.75;
          out.position.set(Math.cos(angle) * distance, 0.4, Math.sin(angle) * distance);
          out.velocity.set(Math.cos(angle) * (1.5 + Math.random() * 3), 1.5 + Math.random() * 2.2, Math.sin(angle) * (1.5 + Math.random() * 3));
          out.delay = 0.05 + Math.random() * 0.25;
        },
      }),
    ];

    effect.tick = (age) => {
      flashMaterial.uniforms.uAge.value = age;
      scorchMaterial.uniforms.uAge.value = age;
      domeMaterial.uniforms.uAge.value = age;
      columnMaterial.uniforms.uAge.value = age;
      dome.scale.setScalar(Math.max(0.01, radius * 0.95 * (1 - Math.exp(-age * 6.5))));
      column.scale.set(
        3.1 * k * (1 + age * 0.7),
        12 * Math.pow(k, 0.8) * (0.5 + 0.5 * smooth(0, 0.12, age)),
        3.1 * k * (1 + age * 0.7)
      );
      for (const update of updaters) update(age);
    };
    effect.tick(0, 0);
  }

  /**
   * Rectangle: a blast front sweeps the zone from the boss outwards leaving
   * white-hot -> orange -> red heat with glowing cracks, blast walls rise on
   * both edges, sparks / embers / smoke follow the front and the ground stays
   * scorched.
   */
  private createRectangleImpact(effect: ActiveEffect, event: MiniBossSkillEvent): void {
    const width = this.geometry.rectangleWidth;
    const length = this.geometry.rectangleLength;
    const k = width / MINI_BOSS_SKILL_GEOMETRY.rectangleWidth;
    const duration = effect.duration;
    const seed = Math.random() * 40;
    const group = this.createOrientedGroundGroup(event.origin, event.target);

    const scorchMaterial = createRectScorchMaterial(duration, seed);
    const scorchGeometry = new THREE.PlaneGeometry(width, length);
    const scorch = new THREE.Mesh(scorchGeometry, scorchMaterial);
    scorch.name = 'mini-boss-skill-scorch';
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = -0.012;
    scorch.renderOrder = 1;

    const blastMaterial = createRectImpactMaterial(seed);
    const blastGeometry = new THREE.PlaneGeometry(width, length);
    const blast = new THREE.Mesh(blastGeometry, blastMaterial);
    blast.name = 'mini-boss-skill-impact';
    blast.rotation.x = -Math.PI / 2;
    blast.renderOrder = 4;

    const wallHeight = 3.8;
    const wallGeometry = new THREE.PlaneGeometry(length, wallHeight);
    wallGeometry.rotateY(Math.PI / 2);
    const wallMaterial = createBlastWallMaterial(seed);
    const walls: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(wallGeometry, wallMaterial);
      wall.name = 'mini-boss-skill-blast-wall';
      wall.position.set(side * (width * 0.5 - 0.15), wallHeight / 2, 0);
      wall.renderOrder = 5;
      walls.push(wall);
    }

    effect.geometries.add(scorchGeometry);
    effect.geometries.add(blastGeometry);
    effect.geometries.add(wallGeometry);
    effect.materials.add(scorchMaterial);
    effect.materials.add(blastMaterial);
    effect.materials.add(wallMaterial);
    group.add(scorch, blast, ...walls);
    effect.group.add(group);

    const sweepSpeed = length / RECT_BLAST_SWEEP_SECONDS;
    const frontDelay = (z: number): number => (z + length / 2) / sweepSpeed;
    const updaters = [
      this.burst(effect, group, k, {
        count: 170,
        size: 0.5,
        color: 0xffa23a,
        additive: true,
        opacity: 1,
        life: [0.6, 1.3],
        gravity: 24,
        drag: 0.9,
        spawn: (_i, out) => {
          const z = (Math.random() - 0.5) * length;
          const edgeBias = Math.random() < 0.55;
          const x = edgeBias
            ? (Math.random() < 0.5 ? -1 : 1) * (width * 0.5 - Math.random() * 1.2)
            : (Math.random() - 0.5) * width;
          out.position.set(x, 0.2, z);
          out.velocity.set((Math.random() - 0.5) * 9, 6 + Math.random() * 15, 3 + Math.random() * 9);
          out.delay = frontDelay(z);
        },
      }),
      this.burst(effect, group, k, {
        count: 100,
        size: 0.32,
        color: 0xffd47a,
        additive: true,
        opacity: 1,
        life: [1.0, 1.8],
        gravity: -1.4,
        drag: 0.45,
        spawn: (_i, out) => {
          const z = (Math.random() - 0.5) * length;
          out.position.set((Math.random() - 0.5) * width, 0.1, z);
          out.velocity.set((Math.random() - 0.5) * 2.2, 2 + Math.random() * 4.4, (Math.random() - 0.5) * 2);
          out.delay = frontDelay(z) + Math.random() * 0.3;
        },
      }),
      this.burst(effect, group, k, {
        count: 36,
        size: 4.8,
        growth: 0.7,
        color: 0x3a312e,
        additive: false,
        opacity: 0.5,
        life: [1.2, 1.7],
        gravity: -0.35,
        drag: 1.4,
        spawn: (_i, out) => {
          const z = (Math.random() - 0.5) * length;
          out.position.set((Math.random() - 0.5) * (width - 2), 0.4, z);
          out.velocity.set((Math.random() - 0.5) * 3.2, 1.4 + Math.random() * 2.2, (Math.random() - 0.5) * 2);
          out.delay = frontDelay(z) + Math.random() * 0.1;
        },
      }),
    ];

    effect.tick = (age) => {
      blastMaterial.uniforms.uAge.value = age;
      scorchMaterial.uniforms.uAge.value = age;
      wallMaterial.uniforms.uAge.value = age;
      for (const update of updaters) update(age);
    };
    effect.tick(0, 0);
  }

  /** Particle burst whose count, size and speed grow with the skill footprint. */
  private burst(
    effect: ActiveEffect,
    parent: THREE.Object3D,
    k: number,
    spec: ParticleSpec
  ): (age: number) => void {
    const extra = Math.max(0, k - 1);
    const speed = 1 + 0.4 * extra;
    return createParticleBurst(effect, parent, {
      ...spec,
      count: Math.round(spec.count * (1 + 0.6 * extra)),
      size: spec.size * (1 + 0.5 * extra),
      spawn: (index, out) => {
        spec.spawn(index, out);
        out.velocity.multiplyScalar(speed);
      },
    });
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
        : IMPACT_DURATIONS[event.skill] * this.durationScale,
      baseOpacity: event.type === 'telegraph' ? 0.24 : 0.56,
      geometries: new Set(),
      materials: new Set(),
      tick: null,
    };
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
      this.geometry.rectangleLength * 0.5
    );
    group.position.y += 0.05;
    group.rotation.y = Math.atan2(direction.x, direction.z);
  }

  private disposeAt(index: number): void {
    const [effect] = this.active.splice(index, 1);
    effect.group.removeFromParent();
    effect.geometries.forEach((geometry) => geometry.dispose());
    effect.materials.forEach((material) => material.dispose());
  }
}
