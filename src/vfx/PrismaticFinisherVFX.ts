import * as THREE from 'three';
import { PooledParticleCloud, qualityCount } from './ParticleManager';
import { VFXLightPool, type VFXLightHandle } from './VFXLightPool';
import { type PoolableVFX } from './VFXPool';
import type { MageVFXQuality } from './VFXTypes';
import { MageVFXResources } from './MageVFXResources';

/** Missiles orbit around the beam in magenta, then curve into living targets. */
export const PRISM_FINISHER = {
  missileCount: 6,
  missileInterval: 0.215,
  flightTime: 0.67,
  explosionSeconds: 1.55,
  explosionRadius: 4.15,
} as const;

interface Missile {
  readonly node: THREE.Group;
  readonly shell: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
  readonly halo: THREE.Sprite;
  readonly start: THREE.Vector3;
  readonly control: THREE.Vector3;
  readonly impact: THREE.Vector3;
  readonly target: THREE.Object3D | null;
  readonly launchAt: number;
  readonly flightTime: number;
  arrived: boolean;
}

export interface PrismFinisherOptions {
  readonly start: THREE.Vector3;
  readonly endpoint: THREE.Vector3;
  readonly targets: readonly THREE.Object3D[];
  readonly isTargetAlive?: (target: THREE.Object3D) => boolean;
}

/** One pooled effect for all six missiles and their final explosion. */
export class PrismaticFinisherEffect implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly missiles: Missile[] = [];
  private readonly missileGeometry = new THREE.IcosahedronGeometry(0.12, 1);
  private readonly trails: PooledParticleCloud;
  private readonly impactParticles: PooledParticleCloud;
  private readonly afterglow: PooledParticleCloud;
  private readonly burst: THREE.Sprite;
  private readonly corona: THREE.Sprite;
  private readonly plasma: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly shockwave: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly fragments: THREE.InstancedMesh<THREE.TetrahedronGeometry, THREE.MeshBasicMaterial>;
  private readonly fragmentMatrix = new THREE.Matrix4();
  private readonly fragmentPosition = new THREE.Vector3();
  private readonly fragmentQuat = new THREE.Quaternion();
  private readonly fragmentSize = new THREE.Vector3();
  private readonly source = new THREE.Vector3();
  private readonly ending = new THREE.Vector3();
  private readonly targetWorld = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private aliveCheck: PrismFinisherOptions['isTargetAlive'];
  private age = 0;
  private explosionAge = -1;
  private light: VFXLightHandle | null = null;
  private trailClock = 0;

  public constructor(
    resources: MageVFXResources,
    private readonly quality: MageVFXQuality,
    private readonly lights: VFXLightPool
  ) {
    this.group.name = 'MagePrismHomingFinisherVFX';
    this.group.visible = false;
    const mat = (color: number) => new THREE.SpriteMaterial({
      map: resources.softGlow,
      color, transparent: true, opacity: 0, depthWrite: false,
      depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    for (let i = 0; i < PRISM_FINISHER.missileCount; i++) {
      const node = new THREE.Group();
      node.name = 'MagePrismHomingMissile';
      const shell = new THREE.Mesh(this.missileGeometry, new THREE.MeshBasicMaterial({
        color: i % 2 ? 0xd88aff : 0xff55d6, transparent: true, opacity: 0,
        depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      shell.name = 'MagePrismMissileCore';
      const halo = new THREE.Sprite(mat(i % 2 ? 0xa25cff : 0xf451de));
      halo.name = 'MagePrismMissileGlow';
      halo.scale.set(0.63, 0.63, 1);
      node.add(halo, shell);
      node.visible = false;
      this.group.add(node);
      this.missiles.push({
        node, shell, halo,
        start: new THREE.Vector3(), control: new THREE.Vector3(),
        impact: new THREE.Vector3(), target: null,
        launchAt: 0.18 + i * PRISM_FINISHER.missileInterval,
        flightTime: PRISM_FINISHER.flightTime + (i % 3) * 0.11,
        arrived: false,
      });
    }

    const orbGeometry = new THREE.SphereGeometry(1, 24, 14);
    this.plasma = new THREE.Mesh(orbGeometry, new THREE.MeshBasicMaterial({
      color: 0x8740ed, transparent: true, opacity: 0,
      depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.plasma.name = 'MagePrismExplosionPlasma';
    this.burst = new THREE.Sprite(mat(0xf2ffff));
    this.burst.name = 'MagePrismExplosionWhiteCore';
    this.corona = new THREE.Sprite(mat(0xb258ff));
    this.corona.name = 'MagePrismExplosionVioletBloom';
    const ringGeo = new THREE.RingGeometry(0.92, 1, 80);
    this.shockwave = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0x86a5ff, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.shockwave.name = 'MagePrismExplosionShockwave';
    this.shockwave.rotation.x = -Math.PI / 2;
    this.shockwave.renderOrder = 7;
    this.fragments = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), new THREE.MeshBasicMaterial({
      color: 0xd3a4ff, transparent: true, opacity: 0,
      depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }), 38);
    this.fragments.name = 'MagePrismExplosionFragments';
    this.fragments.frustumCulled = false;

    this.trails = new PooledParticleCloud(200, resources.softGlow);
    this.trails.points.name = 'MagePrismMissileTrails';
    this.impactParticles = new PooledParticleCloud(260, resources.impactFlare);
    this.impactParticles.points.name = 'MagePrismExplosionSparks';
    this.afterglow = new PooledParticleCloud(110, resources.softGlow, { blending: 'normal' });
    this.afterglow.points.name = 'MagePrismExplosionSmoke';

    this.group.add(
      this.plasma, this.corona, this.burst, this.shockwave, this.fragments,
      this.trails.points, this.impactParticles.points, this.afterglow.points
    );
  }

  public play(options: PrismFinisherOptions): void {
    this.reset();
    this.group.visible = true;
    this.source.copy(options.start);
    this.ending.copy(options.endpoint);
    this.aliveCheck = options.isTargetAlive;
    this.explosionAge = -1;
    this.age = 0;
    this.trailClock = 0;
    const targets = options.targets;
    const axis = this.tmp.subVectors(this.ending, this.source);
    const lateral = new THREE.Vector3(-axis.z, 0, axis.x);
    if (lateral.lengthSq() < 0.0001) lateral.set(1, 0, 0);
    lateral.normalize();
    for (let i = 0; i < this.missiles.length; i++) {
      const missile = this.missiles[i];
      const target = targets.length ? targets[i % targets.length] : null;
      // Target chosen at spawn; a living moving target is tracked each frame.
      (missile as { target: THREE.Object3D | null }).target = target;
      missile.arrived = false;
      missile.node.visible = false;
      missile.start.copy(this.source);
      missile.start.y += 0.14 + (i % 2) * 0.13;
      const side = i % 2 === 0 ? 1 : -1;
      missile.control.copy(this.source).lerp(this.ending, 0.46)
        .addScaledVector(lateral, side * (1.0 + (i % 3) * 0.36));
      missile.control.y += 0.65 + (i % 3) * 0.25;
      missile.impact.copy(this.ending);
      if (target) this.aimTarget(target, missile.impact);
      (missile.halo.material as THREE.SpriteMaterial).opacity = 0;
      (missile.shell.material as THREE.MeshBasicMaterial).opacity = 0;
    }
  }

  private aimTarget(target: THREE.Object3D, output: THREE.Vector3): void {
    target.getWorldPosition(output);
    output.y += (Number(target.userData.enemyBodyScale) || 1) * 0.95;
  }

  public detonate(position: THREE.Vector3): void {
    if (this.explosionAge >= 0) return;
    this.ending.copy(position);
    this.explosionAge = 0;
    this.corona.position.copy(position);
    this.burst.position.copy(position);
    this.plasma.position.copy(position);
    this.shockwave.position.copy(position).addScaledVector(this.up, -0.75);
    this.fragments.position.set(0, 0, 0);
    for (const missile of this.missiles) missile.node.visible = false;
    this.light = this.lights.acquire();
    if (this.light) {
      this.light.light.position.copy(position);
      this.light.light.color.set(0xb176ff);
      this.light.light.distance = 11;
      this.light.light.intensity = 0;
    }
    this.impactParticles.add(position, {
      color: 0xe3d5ff, count: qualityCount(105, this.quality, { low: 0.5, medium: 0.7, high: 1, ultra: 1.15 }),
      speed: 5.6, spread: 1, lifetime: 1.0, upwardBias: 0.16,
      size: [1.5, 3.8], opacity: 0.88,
    });
    this.afterglow.add(position, {
      color: 0x7a69bc, count: qualityCount(48, this.quality, { low: 0.42, medium: 0.7, high: 1, ultra: 1.1 }),
      speed: 1.6, spread: 0.84, lifetime: 1.35, upwardBias: 0.22,
      growth: 1.3, opacity: 0.13, size: [2.5, 4],
    });
  }

  public update(delta: number): boolean {
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    this.trailClock += elapsed;
    this.trails.update(elapsed);
    this.impactParticles.update(elapsed);
    this.afterglow.update(elapsed);
    if (this.explosionAge < 0) {
      const emitTrail = this.trailClock >= 0.045;
      if (emitTrail) this.trailClock = 0;
      for (let i = 0; i < this.missiles.length; i++) {
        const missile = this.missiles[i];
        const t = (this.age - missile.launchAt) / missile.flightTime;
        if (t < 0 || missile.arrived) continue;
        if (t >= 1) {
          missile.node.visible = false;
          missile.arrived = true;
          if (missile.target && (!this.aliveCheck || this.aliveCheck(missile.target))) {
            this.aimTarget(missile.target, missile.impact);
          }
          this.impactParticles.add(missile.impact, {
            color: 0xd87aff, count: 12, speed: 2.1, spread: 0.8,
            lifetime: 0.3, size: [0.75, 2.3], opacity: 0.68,
          });
          continue;
        }
        if (missile.target && (!this.aliveCheck || this.aliveCheck(missile.target))) {
          this.aimTarget(missile.target, missile.impact);
        }
        missile.node.visible = true;
        const u = THREE.MathUtils.smoothstep(t, 0, 1);
        const inv = 1 - u;
        missile.node.position.copy(missile.start).multiplyScalar(inv * inv)
          .addScaledVector(missile.control, 2 * inv * u)
          .addScaledVector(missile.impact, u * u);
        const speedPulse = 0.82 + Math.sin(this.age * 45 + i * 5) * 0.15;
        missile.node.scale.setScalar(speedPulse * (0.85 + u * 0.2));
        missile.shell.material.opacity = (1 - 0.45 * u) * 0.95;
        (missile.halo.material as THREE.SpriteMaterial).opacity = (1 - 0.28 * u) * 0.7;
        if (emitTrail) this.trails.add(missile.node.position, {
          color: i % 2 ? 0x9b6aff : 0xff74da,
          count: qualityCount(5, this.quality, { low: 0.4, medium: 0.65, high: 1, ultra: 1.2 }),
          speed: 0.46, spread: 0.32, lifetime: 0.34, opacity: 0.72,
          size: [0.65, 1.9], growth: -0.65,
        });
      }
      return this.age < 4;
    }

    this.explosionAge += elapsed;
    const p = THREE.MathUtils.clamp(this.explosionAge / PRISM_FINISHER.explosionSeconds, 0, 1);
    const flash = Math.exp(-p * 7.5);
    const fade = 1 - THREE.MathUtils.smoothstep(p, 0.52, 1);
    (this.burst.material as THREE.SpriteMaterial).opacity = 0.95 * flash;
    (this.corona.material as THREE.SpriteMaterial).opacity = 0.6 * Math.exp(-p * 3.2);
    this.burst.scale.setScalar(1.1 + p * 5.8);
    this.corona.scale.setScalar(2.3 + p * 7.5);
    this.plasma.material.opacity = 0.48 * fade;
    this.plasma.scale.setScalar(0.25 + p * 3.1);
    this.shockwave.material.opacity = 0.88 * fade;
    this.shockwave.scale.setScalar(0.2 + p * PRISM_FINISHER.explosionRadius);
    this.fragments.material.opacity = 0.78 * fade;
    for (let i = 0; i < this.fragments.count; i++) {
      const angle = i * 2.399963;
      const radial = (0.25 + p * 4.8) * (0.53 + (i % 6) * 0.09);
      this.fragmentPosition.set(
        this.ending.x + Math.cos(angle) * radial,
        this.ending.y + Math.sin(angle * 2.3) * radial * 0.38,
        this.ending.z + Math.sin(angle) * radial
      );
      this.fragmentQuat.setFromAxisAngle(this.up, angle + p * 9);
      const size = (0.045 + (i % 4) * 0.014) * (1 - p);
      this.fragmentSize.set(size * 0.6, size * 2.6, size * 0.6);
      this.fragmentMatrix.compose(this.fragmentPosition, this.fragmentQuat, this.fragmentSize);
      this.fragments.setMatrixAt(i, this.fragmentMatrix);
    }
    this.fragments.instanceMatrix.needsUpdate = true;
    if (this.light) this.light.light.intensity = 3.5 * flash;
    return this.explosionAge < PRISM_FINISHER.explosionSeconds;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.trailClock = 0;
    this.explosionAge = -1;
    this.aliveCheck = undefined;
    for (const missile of this.missiles) missile.node.visible = false;
    this.trails.reset();
    this.impactParticles.reset();
    this.afterglow.reset();
    (this.burst.material as THREE.SpriteMaterial).opacity = 0;
    (this.corona.material as THREE.SpriteMaterial).opacity = 0;
    this.plasma.material.opacity = 0;
    this.shockwave.material.opacity = 0;
    this.fragments.material.opacity = 0;
    this.light?.release();
    this.light = null;
  }

  public dispose(): void {
    this.reset();
    this.missileGeometry.dispose();
    for (const missile of this.missiles) {
      missile.shell.material.dispose();
      (missile.halo.material as THREE.Material).dispose();
    }
    this.plasma.geometry.dispose();
    this.plasma.material.dispose();
    this.shockwave.geometry.dispose();
    this.shockwave.material.dispose();
    this.fragments.geometry.dispose();
    this.fragments.material.dispose();
    (this.burst.material as THREE.Material).dispose();
    (this.corona.material as THREE.Material).dispose();
    this.trails.dispose();
    this.impactParticles.dispose();
    this.afterglow.dispose();
  }
}
