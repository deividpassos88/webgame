import * as THREE from 'three';
import {
  BOSS_SKILL_GEOMETRY,
  type BossSkillEvent,
} from '../entities/BossSkillController';
import type { MiniBossSkillEvent } from '../combat/MiniBossSkillController';
import { MiniBossSkillEffects } from './MiniBossSkillEffects';
import {
  createCircleImpactMaterial,
  createCircleScorchMaterial,
  createCircleTelegraphMaterial,
  createFireColumnMaterial,
  createMeteorTrailMaterial,
} from './MiniBossSkillShaders';
import {
  createParticleBurst,
  getSoftParticleTexture,
  smooth,
} from './SkillParticles';

/** Meteors are the only skill drawn here; circle and rectangle share the mini-boss renderer. */
interface MeteorEffect {
  kind: 'warning' | 'impact';
  group: THREE.Group;
  age: number;
  duration: number;
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
  tick: ((age: number) => void) | null;
}

/** Seconds each impact stays on screen. */
const IMPACT_DURATIONS: Readonly<Record<BossSkillEvent['skill'], number>> = {
  circle: 2.4,
  rectangle: 2.1,
  meteors: 1.6,
};

const METEOR_START_HEIGHT = 11;
const METEOR_BLAST_RADIUS = 4.4;
/** Point light each skill flashes on impact: [peak intensity, reach in meters]. */
const IMPACT_LIGHT: Readonly<Record<BossSkillEvent['skill'], readonly [number, number]>> = {
  circle: [9, 55],
  rectangle: [6, 40],
  meteors: [5, 22],
};

export class BossSkillEffects {
  private readonly meteors: MeteorEffect[] = [];
  /**
   * The boss circle and rectangle are the mini-boss skills drawn at twice the
   * size, with heavier particles and a longer burn.
   */
  private readonly ground: MiniBossSkillEffects;
  // A luz permanece na cena, com intensidade zero quando não há impacto. Assim o
  // renderer não alterna a quantidade de PointLights e não recompila shaders na
  // primeira explosão de cada skill.
  private readonly impactLight = new THREE.PointLight(0xff4a10, 0, 40, 2);
  private lightPeak = 0;
  private lightAge = 0;
  private lightDuration = 1;

  /** Fired once per impact so the game can shake the camera, play audio, etc. */
  public onImpact: ((event: BossSkillEvent) => void) | null = null;

  public constructor(private readonly scene: THREE.Scene) {
    this.impactLight.castShadow = false;
    this.scene.add(this.impactLight);
    this.ground = new MiniBossSkillEffects(scene, {
      geometry: BOSS_SKILL_GEOMETRY,
      durationScale: 1.25,
    });
  }

  public get activeObjectCount(): number {
    return this.ground.activeObjectCount + this.meteors.length;
  }

  public handle(event: BossSkillEvent): void {
    this.clear();
    if (event.skill === 'meteors') {
      if (event.type === 'telegraph') this.createMeteorTelegraph(event);
      else this.createMeteorImpact(event);
    } else {
      this.ground.handle(this.toGroundEvent(event));
    }
    if (event.type === 'impact') {
      const [peak, reach] = IMPACT_LIGHT[event.skill];
      this.lightPeak = peak;
      this.lightAge = 0;
      this.lightDuration = IMPACT_DURATIONS[event.skill];
      this.impactLight.distance = reach;
      this.impactLight.position.copy(event.target).add(new THREE.Vector3(0, 1.4, 0));
      this.impactLight.intensity = peak;
      this.onImpact?.(event);
    }
  }

  public update(delta: number): void {
    const elapsed = Number.isFinite(delta) && delta > 0 ? delta : 0;
    this.ground.update(elapsed);

    for (let index = this.meteors.length - 1; index >= 0; index -= 1) {
      const effect = this.meteors[index];
      effect.age += elapsed;
      effect.tick?.(effect.age);
      if (effect.kind === 'impact' && effect.age >= effect.duration) this.disposeMeteor(index);
      // A warning disposes when the controller emits the impact event.
    }

    if (this.lightPeak > 0) {
      this.lightAge += elapsed;
      const progress = THREE.MathUtils.clamp(this.lightAge / this.lightDuration, 0, 1);
      // Hard flash that decays quickly, then a faint ember glow.
      const flicker = 1 + Math.sin(this.lightAge * 38) * 0.08;
      this.impactLight.intensity = this.lightPeak * Math.pow(1 - progress, 2.4) * flicker;
      if (progress >= 1) this.stopLight();
    }
  }

  public clear(): void {
    this.ground.clear();
    for (let index = this.meteors.length - 1; index >= 0; index -= 1) this.disposeMeteor(index);
    this.stopLight();
  }

  private stopLight(): void {
    this.lightPeak = 0;
    this.impactLight.intensity = 0;
  }

  private toGroundEvent(event: BossSkillEvent): MiniBossSkillEvent {
    return {
      type: event.type,
      skill: event.skill === 'rectangle' ? 'rectangle' : 'circle',
      secondsUntilImpact: event.secondsUntilImpact,
      origin: event.origin,
      target: event.target,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Meteors                                                           */
  /* ---------------------------------------------------------------- */

  private createMeteorEffect(kind: MeteorEffect['kind'], duration: number): MeteorEffect {
    return {
      kind,
      group: new THREE.Group(),
      age: 0,
      duration,
      geometries: new Set(),
      materials: new Set(),
      tick: null,
    };
  }

  /**
   * Warning: a glowing target ring under every meteor plus a fireball with a
   * flaming tail falling in sync with the countdown.
   */
  private createMeteorTelegraph(event: BossSkillEvent): void {
    const effect = this.createMeteorEffect('warning', event.secondsUntilImpact);
    const radius = BOSS_SKILL_GEOMETRY.meteorRadius;

    const ringMaterial = createCircleTelegraphMaterial();
    const ringGeometry = new THREE.CircleGeometry(radius, 40);
    const ringUniforms = ringMaterial.uniforms;
    effect.materials.add(ringMaterial);
    effect.geometries.add(ringGeometry);

    const coreGeometry = new THREE.SphereGeometry(0.34, 14, 10);
    const glowGeometry = new THREE.SphereGeometry(0.82, 14, 10);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff2c0,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff5a0c,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const trailMaterial = createMeteorTrailMaterial();
    const tailLength = 5.5;
    const trailGeometry = new THREE.ConeGeometry(0.82, tailLength, 18, 1, true);
    trailGeometry.translate(0, tailLength / 2, 0);
    effect.geometries.add(coreGeometry);
    effect.geometries.add(glowGeometry);
    effect.geometries.add(trailGeometry);
    effect.materials.add(coreMaterial);
    effect.materials.add(glowMaterial);
    effect.materials.add(trailMaterial);

    event.meteorPoints.forEach((point) => {
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.name = 'boss-meteor-warning';
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(point.x, point.y + 0.05, point.z);
      ring.castShadow = false;
      ring.receiveShadow = false;
      ring.renderOrder = 3;
      effect.group.add(ring);

      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      core.name = 'boss-meteor-core';
      core.position.set(point.x, METEOR_START_HEIGHT, point.z);
      core.userData.groundY = point.y + 0.25;
      core.castShadow = false;
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      glow.name = 'boss-meteor-fireball';
      glow.castShadow = false;
      const trail = new THREE.Mesh(trailGeometry, trailMaterial);
      trail.name = 'boss-meteor-trail';
      trail.castShadow = false;
      trail.frustumCulled = false;
      core.add(glow, trail);
      effect.group.add(core);
    });

    const smokeGeometry = new THREE.BufferGeometry();
    smokeGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(event.meteorPoints.length * 3 * 3), 3)
    );
    const smokeMaterial = new THREE.PointsMaterial({
      map: getSoftParticleTexture(),
      color: 0x5c4b48,
      size: 1.7,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const smoke = new THREE.Points(smokeGeometry, smokeMaterial);
    smoke.name = 'boss-meteor-smoke';
    smoke.frustumCulled = false;
    smoke.userData.meteorPoints = event.meteorPoints.map((point) => point.clone());
    effect.geometries.add(smokeGeometry);
    effect.materials.add(smokeMaterial);
    effect.group.add(smoke);

    const phase = Math.random() * 10;
    effect.tick = (age) => {
      const progress = THREE.MathUtils.clamp(age / Math.max(effect.duration, 1e-9), 0, 1);
      ringUniforms.uTime.value = age + phase;
      ringUniforms.uProgress.value = progress;
      ringUniforms.uIntro.value = smooth(0, 0.18, age);
      trailMaterial.uniforms.uTime.value = age;

      // Fireballs accelerate towards the ground and flare brighter as they land.
      const fall = progress * progress * 0.35 + progress * 0.65;
      coreMaterial.opacity = 0.7 + progress * 0.3;
      glowMaterial.opacity = 0.45 + progress * 0.4;
      effect.group.traverse((object) => {
        if (object.name !== 'boss-meteor-core') return;
        object.position.y = THREE.MathUtils.lerp(METEOR_START_HEIGHT, object.userData.groundY, fall);
        object.scale.setScalar(0.85 + progress * 0.35);
      });

      const positions = smokeGeometry.getAttribute('position') as THREE.BufferAttribute;
      const points = smoke.userData.meteorPoints as THREE.Vector3[];
      points.forEach((point, index) => {
        const coreY = THREE.MathUtils.lerp(METEOR_START_HEIGHT, point.y + 0.25, fall);
        for (let trail = 0; trail < 3; trail += 1) {
          const offset = index * 3 + trail;
          const sway = Math.sin(age * 6 + index * 0.73 + trail) * 0.22;
          positions.setXYZ(
            offset,
            point.x + sway,
            coreY + 1.6 + trail * 1.5,
            point.z - sway * 0.6
          );
        }
      });
      positions.needsUpdate = true;
    };
    effect.tick(0);

    this.scene.add(effect.group);
    this.meteors.push(effect);
  }

  /**
   * Impact: every meteor lands with its own flash, shockwave, lava cracks, fire
   * column and scorch mark, while shared bursts of sparks / embers / smoke fly
   * from all impact points.
   */
  private createMeteorImpact(event: BossSkillEvent): void {
    const effect = this.createMeteorEffect('impact', IMPACT_DURATIONS.meteors);
    const duration = effect.duration;
    const seed = Math.random() * 40;
    const flashRadius = METEOR_BLAST_RADIUS;
    const k = flashRadius / 8.75;

    const scorchMaterial = createCircleScorchMaterial(duration, seed);
    const scorchGeometry = new THREE.CircleGeometry(flashRadius * 0.95, 32);
    const flashMaterial = createCircleImpactMaterial(flashRadius / k, seed);
    const flashGeometry = new THREE.CircleGeometry(flashRadius, 48);
    const columnMaterial = createFireColumnMaterial(seed);
    const columnGeometry = new THREE.CylinderGeometry(1, 1.5, 1, 24, 1, true);
    columnGeometry.translate(0, 0.5, 0);
    effect.geometries.add(scorchGeometry);
    effect.geometries.add(flashGeometry);
    effect.geometries.add(columnGeometry);
    effect.materials.add(scorchMaterial);
    effect.materials.add(flashMaterial);
    effect.materials.add(columnMaterial);

    const columns: THREE.Mesh[] = [];
    event.meteorPoints.forEach((point) => {
      const scorch = new THREE.Mesh(scorchGeometry, scorchMaterial);
      scorch.name = 'boss-meteor-scorch';
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.set(point.x, point.y + 0.06, point.z);
      scorch.renderOrder = 1;
      const flash = new THREE.Mesh(flashGeometry, flashMaterial);
      flash.name = 'boss-fire-blast';
      flash.rotation.x = -Math.PI / 2;
      flash.position.set(point.x, point.y + 0.08, point.z);
      flash.renderOrder = 4;
      const column = new THREE.Mesh(columnGeometry, columnMaterial);
      column.name = 'boss-meteor-fire-column';
      column.position.set(point.x, point.y, point.z);
      column.renderOrder = 5;
      columns.push(column);
      effect.group.add(scorch, flash, column);
    });

    const root = new THREE.Group();
    effect.group.add(root);
    const pickPoint = (out: THREE.Vector3): THREE.Vector3 => {
      const point = event.meteorPoints[Math.floor(Math.random() * event.meteorPoints.length)];
      return out.copy(point);
    };
    const scratch = new THREE.Vector3();
    const pointCount = Math.max(1, event.meteorPoints.length);
    const bursts = [
      createParticleBurst(effect, root, {
        count: pointCount * 8,
        size: 0.42,
        color: 0xffa23a,
        additive: true,
        opacity: 1,
        life: [0.6, 1.3],
        gravity: 20,
        drag: 0.9,
        spawn: (_i, out) => {
          pickPoint(scratch);
          const angle = Math.random() * Math.PI * 2;
          const speed = 3 + Math.random() * 9;
          out.position.set(scratch.x, scratch.y + 0.2, scratch.z);
          out.velocity.set(Math.cos(angle) * speed, 5 + Math.random() * 11, Math.sin(angle) * speed);
          out.delay = Math.random() * 0.1;
        },
      }),
      createParticleBurst(effect, root, {
        count: pointCount * 4,
        size: 0.3,
        color: 0xffd47a,
        additive: true,
        opacity: 1,
        life: [1.0, 1.7],
        gravity: -1.5,
        drag: 0.5,
        spawn: (_i, out) => {
          pickPoint(scratch);
          out.position.set(scratch.x + (Math.random() - 0.5) * 3, scratch.y + 0.1, scratch.z + (Math.random() - 0.5) * 3);
          out.velocity.set((Math.random() - 0.5) * 2, 2 + Math.random() * 4, (Math.random() - 0.5) * 2);
          out.delay = 0.05 + Math.random() * 0.35;
        },
      }),
      createParticleBurst(effect, root, {
        count: Math.max(8, Math.round(pointCount * 1.2)),
        size: 3.4,
        growth: 0.7,
        color: 0x3a312e,
        additive: false,
        opacity: 0.5,
        life: [1.1, 1.5],
        gravity: -0.35,
        drag: 1.4,
        spawn: (_i, out) => {
          pickPoint(scratch);
          out.position.set(scratch.x, scratch.y + 0.4, scratch.z);
          out.velocity.set((Math.random() - 0.5) * 3, 1.4 + Math.random() * 2, (Math.random() - 0.5) * 3);
          out.delay = 0.05 + Math.random() * 0.2;
        },
      }),
    ];

    effect.tick = (age) => {
      flashMaterial.uniforms.uAge.value = age;
      scorchMaterial.uniforms.uAge.value = age;
      columnMaterial.uniforms.uAge.value = age;
      const width = 1.7 * (1 + age * 0.7);
      const height = 7 * (0.5 + 0.5 * smooth(0, 0.12, age));
      for (const column of columns) column.scale.set(width, height, width);
      for (const update of bursts) update(age);
    };
    effect.tick(0);

    this.scene.add(effect.group);
    this.meteors.push(effect);
  }

  private disposeMeteor(index: number): void {
    const [effect] = this.meteors.splice(index, 1);
    effect.group.removeFromParent();
    effect.geometries.forEach((geometry) => geometry.dispose());
    effect.materials.forEach((material) => material.dispose());
  }
}
