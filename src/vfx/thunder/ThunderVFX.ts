import * as THREE from 'three';
import type { MageVFXResources } from '../MageVFXResources';
import { PooledParticleCloud } from '../ParticleManager';
import { VFXPool, type PoolableVFX } from '../VFXPool';
import { VFXLightPool, type VFXLightHandle } from '../VFXLightPool';
import type { MageVFXQuality } from '../VFXTypes';
import {
  createThunderBeamMaterial, createThunderBoltMaterial, createThunderDomeMaterial,
  createThunderBurstTexture, createThunderRingMaterial, createThunderShadowTexture, createThunderSmokeTexture,
} from './ThunderMaterials';
import {
  createThunderBladeGeometry, createThunderDiscGeometry, jaggedBoltPath, ThunderBolt,
} from './ThunderGeometry';

/** Invocation bubble (cast) and falling thunder (impact) pool caps. */
export const THUNDER_POOL_LIMITS = Object.freeze({ charges: 2, strikes: 4 });
export const THUNDER_DESCENT_SECONDS = 0.22;
export const THUNDER_LIFETIME_SECONDS = 1.6;
/** Larguras fixas (lista de um item repete o valor em todo o caminho). */
const BRANCH_HALF_WIDTH: readonly number[] = [0.16];
const ARC_HALF_WIDTH: readonly number[] = [0.16];
/** Corpo grosso do raio (magenta com núcleo branco), sob o filete fino. */
const BODY_HALF_WIDTH = 0.62;

const BUBBLE_RADIUS = 2.1;
const BOLT_TOP = 8.5;
const TAU = Math.PI * 2;

export interface ThunderChargeHandle { release(): void; }
export interface ThunderStrikeOptions {
  readonly position: THREE.Vector3;
  readonly target: THREE.Object3D | null;
  readonly isTargetAlive?: (target: THREE.Object3D) => boolean;
  readonly onImpact: (position: THREE.Vector3, target: THREE.Object3D | null) => void;
}

/** Deterministic PRNG so each strike/bubble is reproducible in tests. */
function seededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}

function disposeTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh && !(object as THREE.Sprite).isSprite) return;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of mats) if (material) materials.add(material);
    if ((object as THREE.InstancedMesh).isInstancedMesh) (object as THREE.InstancedMesh).dispose();
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

// ─────────────────────────────── Invocation bubble ───────────────────────────────

class ThunderCharge implements PoolableVFX, ThunderChargeHandle {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly domeMaterial = createThunderDomeMaterial();
  private readonly ringMaterial = createThunderRingMaterial();
  private readonly beamMaterials: THREE.ShaderMaterial[] = [];
  private readonly beams: THREE.Mesh[] = [];
  private readonly shards: THREE.Mesh[] = [];
  private readonly rocks: THREE.Mesh[] = [];
  private readonly rings: THREE.Mesh[] = [];
  private readonly crater: THREE.Mesh;
  private readonly core: THREE.Sprite;
  private readonly coreMaterial: THREE.SpriteMaterial;
  private readonly dome: THREE.Mesh;
  private light: VFXLightHandle | null = null;
  private caster: THREE.Object3D | null = null;
  private age = 0;
  private releasedAt: number | null = null;

  public constructor(resources: MageVFXResources, private readonly lights: VFXLightPool, private readonly quality: MageVFXQuality) {
    this.group.name = 'MageThunderBubbleVFX';
    this.group.visible = false;

    this.dome = new THREE.Mesh(new THREE.SphereGeometry(BUBBLE_RADIUS, 48, 24, 0, TAU, 0, Math.PI / 2), this.domeMaterial);
    this.dome.name = 'ThunderBubbleDome';
    this.dome.renderOrder = 6;
    this.group.add(this.dome);

    // Dark crater disc under the bubble, with a magenta shock rim on the ground.
    this.crater = new THREE.Mesh(new THREE.CircleGeometry(BUBBLE_RADIUS * 1.02, 48), new THREE.MeshBasicMaterial({
      color: 0x120a18, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.crater.rotation.x = -Math.PI / 2;
    this.crater.position.y = 0.02;
    this.crater.name = 'ThunderCraterDisc';
    this.group.add(this.crater);
    const rim = new THREE.Mesh(createThunderDiscGeometry(24, 72), this.ringMaterial);
    rim.position.y = 0.03;
    rim.scale.setScalar(BUBBLE_RADIUS * 1.04);
    rim.name = 'ThunderGroundRim';
    this.rings.push(rim);
    this.group.add(rim);

    // Two orbit rings floating around the waist, like the reference's halo lines.
    for (let index = 0; index < 2; index += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55 + index * 0.3, 0.018, 6, 72), new THREE.MeshBasicMaterial({
        color: 0xff6cff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 1.0 + index * 0.4;
      (ring.material as THREE.MeshBasicMaterial).color.set(0xc98cff);
      ring.name = 'ThunderOrbitRing';
      ring.userData.spin = true;
      this.rings.push(ring);
      this.group.add(ring);
    }

    // Light columns inside the bubble: thick, white-hot core, magenta halo, rising and flickering.
    const beamCount = quality === 'low' ? 12 : 18;
    for (let index = 0; index < beamCount; index += 1) {
      const material = createThunderBeamMaterial();
      material.uniforms.uSeed.value = index * 1.7;
      this.beamMaterials.push(material);
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 2.9), material);
      const angle = (index / beamCount) * TAU + (index % 3) * 0.17;
      const radius = 0.5 + (index % 4) * 0.22;
      beam.position.set(Math.cos(angle) * radius, 1.45, Math.sin(angle) * radius);
      beam.name = 'ThunderBubbleBeam';
      beam.renderOrder = 7;
      this.beams.push(beam);
      this.group.add(beam);
    }

    // Jagged, grey-white crystal fangs around the base (the ground crown of the reference).
    const shardCount = quality === 'low' ? 10 : 14;
    for (let index = 0; index < shardCount; index += 1) {
      const angle = (index / shardCount) * TAU;
      const height = 1.5 + (index % 3) * 0.35;
      const shard = new THREE.Mesh(new THREE.ConeGeometry(0.2, height, 4), new THREE.MeshBasicMaterial({
        color: 0xdcd8f2, transparent: true, opacity: 0, depthWrite: false,
      }));
      shard.position.set(Math.cos(angle) * 1.35, height * 0.42, Math.sin(angle) * 1.35);
      shard.rotation.set(-Math.sin(angle) * 0.38, 0, Math.cos(angle) * 0.38);
      shard.name = 'ThunderBubbleShard';
      this.shards.push(shard);
      this.group.add(shard);
    }

    // Dark rocks lifted out of the crater.
    for (let index = 0; index < 10; index += 1) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09 + (index % 3) * 0.03, 0), new THREE.MeshBasicMaterial({
        color: 0x2a2026, transparent: true, opacity: 0, depthWrite: false,
      }));
      const angle = (index / 10) * TAU + 0.3;
      rock.userData.angle = angle;
      rock.userData.radius = 1.5 + (index % 4) * 0.13;
      rock.name = 'ThunderCraterRock';
      this.rocks.push(rock);
      this.group.add(rock);
    }

    this.coreMaterial = new THREE.SpriteMaterial({
      map: resources.softGlow, color: 0xff8cff, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.core = new THREE.Sprite(this.coreMaterial);
    this.core.position.set(0, 1.1, 0);
    this.core.scale.setScalar(1.6);
    this.core.name = 'ThunderBubbleCore';
    this.group.add(this.core);
  }

  public play(caster: THREE.Object3D): void {
    this.caster = caster;
    this.age = 0;
    this.releasedAt = null;
    this.group.visible = true;
    this.light = this.quality === 'low' ? null : this.lights.acquire();
    if (this.light) {
      this.light.light.color.set(0xb84dff);
      this.light.light.distance = 7;
      this.light.light.intensity = 0;
    }
    this.update(0);
  }

  public release(): void {
    if (this.active && this.releasedAt === null) this.releasedAt = this.age;
  }

  public update(delta: number): boolean {
    if (!this.caster) return false;
    this.age += Math.max(0, delta);
    const ending = this.releasedAt === null ? 0 : THREE.MathUtils.clamp((this.age - this.releasedAt) / 0.35, 0, 1);
    const grow = THREE.MathUtils.smoothstep(this.age, 0, 0.32);
    const live = grow * (1 - ending);
    this.caster.getWorldPosition(this.group.position);

    const scale = (0.45 + 0.55 * grow) * (1 - 0.12 * ending);
    this.dome.scale.set(scale, scale * 0.95, scale);
    this.domeMaterial.uniforms.uTime.value = this.age;
    this.domeMaterial.uniforms.uOpacity.value = live;

    this.beams.forEach((beam, index) => {
      const material = this.beamMaterials[index];
      const pulse = 0.78 + 0.22 * Math.sin(this.age * 9 + index * 1.3);
      material.uniforms.uTime.value = this.age;
      material.uniforms.uGrow.value = THREE.MathUtils.clamp(grow * pulse, 0, 1);
      material.uniforms.uOpacity.value = live;
      beam.scale.set(1, 0.5 + 0.5 * grow * pulse, 1);
      beam.lookAt(0, beam.position.y, 0);
    });

    for (const ring of this.rings) {
      if (ring.userData.spin === true) {
        ring.rotation.z += 0.9 * Math.max(0, delta) * (ring.position.y > 1.2 ? 1 : -1);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.55 * live;
      } else {
        (ring.material as THREE.ShaderMaterial).uniforms.uTime.value = this.age;
        (ring.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.45 * live;
      }
    }
    (this.crater.material as THREE.MeshBasicMaterial).opacity = 0.7 * live;

    this.shards.forEach((shard, index) => {
      const appear = THREE.MathUtils.smoothstep(this.age, 0.04 + index * 0.012, 0.34 + index * 0.012);
      shard.scale.setScalar(Math.max(0.001, appear * (1 - 0.25 * ending)));
      shard.position.y = 0.45 * appear;
      (shard.material as THREE.MeshBasicMaterial).opacity = live * appear;
    });
    this.rocks.forEach((rock, index) => {
      const lift = THREE.MathUtils.smoothstep(this.age, 0.1 + index * 0.02, 0.5);
      const angle = rock.userData.angle as number;
      const radius = rock.userData.radius as number;
      rock.position.set(Math.cos(angle) * radius, 0.05 + Math.sin(lift * Math.PI) * 0.35 * (1 + (index % 2) * 0.4), Math.sin(angle) * radius);
      rock.rotation.set(this.age * (1 + index * 0.1), this.age * 0.7, 0);
      (rock.material as THREE.MeshBasicMaterial).opacity = live * lift;
    });

    const flicker = 0.9 + 0.1 * Math.sin(this.age * 14);
    this.core.scale.setScalar((1.2 + 0.5 * grow) * flicker);
    this.coreMaterial.opacity = live * 0.95;
    if (this.light) {
      this.light.light.position.copy(this.group.position).y += 1.2;
      this.light.light.intensity = live * 1.4 * flicker;
    }
    // Finished releases end the bubble; the dome and beams are fully hidden before pooling.
    return ending < 1;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.caster = null;
    this.light?.release();
    this.light = null;
    this.releasedAt = null;
    this.age = 0;
  }

  public dispose(): void {
    this.reset();
    disposeTree(this.group);
    this.domeMaterial.dispose();
    this.ringMaterial.dispose();
  }
}

// ───────────────────────────── Falling thunder (impact) ─────────────────────────────

class ThunderStrike implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly bolt: ThunderBolt;
  private readonly branches: ThunderBolt[] = [];
  private readonly groundArcs: ThunderBolt[] = [];
  private readonly arcPaths: THREE.Vector3[][] = [];
  private readonly body: ThunderBolt;
  private readonly bodyMaterial = createThunderBoltMaterial(0xff2bd6);
  private readonly bodyPath: THREE.Vector3[] = [];
  private readonly boltMaterial = createThunderBoltMaterial(0xff2bd6);
  private readonly branchMaterial = createThunderBoltMaterial(0xff2bd6);
  private readonly arcMaterial = createThunderBoltMaterial(0x9b4dff);
  private readonly underglow: THREE.Sprite;
  private readonly underglowMaterial: THREE.SpriteMaterial;
  private readonly flash: THREE.Sprite;
  private readonly flashMaterial: THREE.SpriteMaterial;
  private readonly burst: THREE.Sprite;
  private readonly burstMaterial: THREE.SpriteMaterial;
  private readonly shock: THREE.Mesh;
  private readonly shockMaterial = createThunderRingMaterial();
  private readonly crater: THREE.Mesh;
  private readonly blades: Array<{ group: THREE.Group; phase: number; height: number }> = [];
  private readonly bladeMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly smokes: Array<{ sprite: THREE.Sprite; delay: number; angle: number; radius: number; height: number }> = [];
  private readonly smokeMaterials: THREE.SpriteMaterial[] = [];
  private readonly shards: THREE.InstancedMesh;
  private readonly shardData: Array<{ vx: number; vy: number; vz: number; spin: number }> = [];
  private readonly shardMatrix = new THREE.Matrix4();
  private readonly shardQuat = new THREE.Quaternion();
  private readonly shardScale = new THREE.Vector3();
  private readonly shardPos = new THREE.Vector3();
  private readonly shardAxis = new THREE.Vector3(0, 1, 0);
  private readonly sparks: PooledParticleCloud;
  private readonly topPath: THREE.Vector3[] = [];
  private readonly branchPaths: THREE.Vector3[][] = [];
  private light: VFXLightHandle | null = null;
  private options: ThunderStrikeOptions | null = null;
  private age = 0;
  private impacted = false;
  private seed = 1;
  private random: () => number = seededRandom(1);

  public constructor(resources: MageVFXResources, private readonly lights: VFXLightPool, private readonly quality: MageVFXQuality) {
    this.group.name = 'MageThunderStrikeVFX';
    this.group.visible = false;
    const high = quality !== 'low';

    this.body = new ThunderBolt(high ? 14 : 10, this.bodyMaterial, 'ThunderBodyBolt');
    this.group.add(this.body.mesh);
    this.bolt = new ThunderBolt(high ? 16 : 12, this.boltMaterial, 'ThunderMainBolt');
    this.group.add(this.bolt.mesh);
    for (let index = 0; index < 3; index += 1) {
      const branch = new ThunderBolt(6, this.branchMaterial, 'ThunderBranchBolt');
      this.branches.push(branch);
      this.branchPaths.push([]);
      this.group.add(branch.mesh);
    }
    for (let index = 0; index < 6; index += 1) {
      const arc = new ThunderBolt(7, this.arcMaterial, 'ThunderGroundArc');
      this.groundArcs.push(arc);
      this.arcPaths.push([]);
      this.group.add(arc.mesh);
    }

    this.flashMaterial = new THREE.SpriteMaterial({
      map: resources.softGlow, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.underglowMaterial = new THREE.SpriteMaterial({
      map: resources.softGlow, color: 0xd84dff, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.underglow = new THREE.Sprite(this.underglowMaterial);
    this.underglow.position.y = 0.2;
    this.underglow.name = 'ThunderSmokeUnderglow';
    this.group.add(this.underglow);

    this.flash = new THREE.Sprite(this.flashMaterial);
    this.flash.position.y = 0.6;
    this.flash.name = 'ThunderImpactFlash';
    this.group.add(this.flash);

    // Estouro branco na base: sobe forte no contato e some em instantes.
    this.burstMaterial = new THREE.SpriteMaterial({
      map: createThunderBurstTexture(128), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.burst = new THREE.Sprite(this.burstMaterial);
    this.burst.position.y = 0.35;
    this.burst.name = 'ThunderBaseBurst';
    this.group.add(this.burst);

    this.shock = new THREE.Mesh(createThunderDiscGeometry(24, 72), this.shockMaterial);
    this.shock.rotation.x = 0;
    this.shock.position.y = 0.04;
    this.shock.name = 'ThunderShockRing';
    this.group.add(this.shock);

    // Sombra escura no chão: gradiente radial suave, maior que a área do raio.
    this.crater = new THREE.Mesh(new THREE.CircleGeometry(2.9, 48), new THREE.MeshBasicMaterial({
      color: 0xffffff, map: createThunderShadowTexture(128), transparent: true, opacity: 0, depthWrite: false,
    }));
    this.crater.rotation.x = -Math.PI / 2;
    this.crater.position.y = 0.02;
    this.crater.name = 'ThunderGroundShadow';
    this.group.add(this.crater);

    // Three swept grey-violet blades orbit the bolt (fill + darker outline, as in the reference).
    const bladeSpecs = [
      { phase: 0.2, sweep: 3.1, radius: 1.25, height: 2.2, width: 0.72 },
      { phase: 2.5, sweep: 2.9, radius: 1.45, height: 2.9, width: 0.62 },
      { phase: 4.4, sweep: 3.3, radius: 1.1, height: 3.5, width: 0.56 },
    ];
    for (const spec of bladeSpecs) {
      const fill = new THREE.MeshBasicMaterial({ color: 0x7d78a8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
      const outline = new THREE.MeshBasicMaterial({ color: 0x2a2140, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
      this.bladeMaterials.push(fill, outline);
      const geometry = createThunderBladeGeometry(spec.phase, spec.sweep, spec.radius, spec.height, spec.width);
      const group = new THREE.Group();
      const body = new THREE.Mesh(geometry, fill);
      const edge = new THREE.Mesh(geometry, outline);
      edge.scale.setScalar(1.06);
      group.add(edge, body);
      group.name = 'ThunderBlade';
      this.group.add(group);
      this.blades.push({ group, phase: spec.phase, height: spec.height });
    }

    // Cartoon storm smoke: dark violet puffs around the base, with a magenta light underneath.
    const smokeTexture = createThunderSmokeTexture(128);
    const smokeCount = high ? 16 : 9;
    for (let index = 0; index < smokeCount; index += 1) {
      const material = new THREE.SpriteMaterial({
        map: smokeTexture, color: 0x2e2056, transparent: true, opacity: 0, depthWrite: false,
      });
      this.smokeMaterials.push(material);
      const sprite = new THREE.Sprite(material);
      const angle = (index / smokeCount) * TAU + (index % 2) * 0.25;
      const radius = 0.9 + (index % 4) * 0.45;
      sprite.position.set(Math.cos(angle) * radius, 0.5 + (index % 3) * 0.35, Math.sin(angle) * radius);
      sprite.name = 'ThunderSmokePuff';
      this.smokes.push({ sprite, delay: index * 0.02, angle, radius, height: sprite.position.y });
      this.group.add(sprite);
    }

    // Flying dark-violet shards, ballistic.
    const shardCount = high ? 14 : 8;
    this.shards = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.24, 0), new THREE.MeshBasicMaterial({
      color: 0x4a3a80, transparent: true, opacity: 0.95,
    }), shardCount);
    this.shards.name = 'ThunderFlyingShards';
    this.shards.frustumCulled = false;
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < shardCount; index += 1) {
      const angle = (index / shardCount) * TAU;
      const speed = 2.2 + (index % 4) * 0.7;
      this.shardData.push({ vx: Math.cos(angle) * speed, vy: 2.6 + (index % 3) * 0.9, vz: Math.sin(angle) * speed, spin: 4 + index * 0.6 });
    }
    this.group.add(this.shards);

    this.sparks = new PooledParticleCloud(36, resources.softGlow);
    this.sparks.points.name = 'ThunderImpactSparks';
    this.group.add(this.sparks.points);
  }

  public play(options: ThunderStrikeOptions): void {
    this.options = options;
    this.age = 0;
    this.impacted = false;
    this.seed = 1 + Math.floor(Math.random() * 9000);
    this.random = seededRandom(this.seed);
    this.group.position.copy(options.position);
    this.group.visible = true;
    this.sparks.reset();
    this.light = this.quality === 'low' ? null : this.lights.acquire();
    if (this.light) {
      this.light.light.color.set(0xd45cff);
      this.light.light.distance = 9;
      this.light.light.intensity = 0;
    }
    this.update(0);
  }

  public update(delta: number): boolean {
    if (!this.options) return false;
    const step = Math.max(0, delta);
    this.age += step;
    const target = this.options.target;
    const alive = target && (!this.options.isTargetAlive || this.options.isTargetAlive(target));
    // Track the marked enemy only during the fall; the strike stays where it lands.
    if (!this.impacted && alive) target.getWorldPosition(this.group.position);

    const descent = THREE.MathUtils.clamp(this.age / THUNDER_DESCENT_SECONDS, 0, 1);
    const impactAge = Math.max(0, this.age - THUNDER_DESCENT_SECONDS);
    const head = new THREE.Vector3(0, BOLT_TOP * (1 - Math.pow(descent, 1.2)), 0);
    const jitterStep = Math.floor(this.age * 18);
    const boltRandom = seededRandom(this.seed * 131 + jitterStep);

    if (!this.impacted && descent >= 1) {
      this.impacted = true;
      this.sparks.emit(new THREE.Vector3(0, 0.25, 0), {
        color: 0xe3a8ff, count: this.quality === 'low' ? 14 : 34,
        speed: 3.4, spread: 1.4, lifetime: 0.4, upwardBias: 0.25,
        size: [0.7, 2.0], opacity: 0.9,
      });
      this.options.onImpact(this.group.position.clone(), alive ? target : null);
      if (!this.options || !this.active) return false;
    }

    // Main bolt: falls from the sky, then flickers in place until it fades.
    const boltFade = 1 - THREE.MathUtils.smoothstep(impactAge, 0.5, 0.95);
    // Corpo grosso: quase reto, com leve oscilação; mais grosso perto do chão.
    jaggedBoltPath(new THREE.Vector3(0, BOLT_TOP, 0), head, 10, 0.12, boltRandom, this.bodyPath);
    this.body.setPath(this.bodyPath, this.bodyPath.map((_, i) => BODY_HALF_WIDTH * (1 + 0.12 * i / Math.max(1, this.bodyPath.length - 1)) + 0.05 * Math.sin(i * 1.7 + this.age * 16)));
    this.bodyMaterial.uniforms.uTime.value = this.age;
    this.bodyMaterial.uniforms.uOpacity.value = boltFade;
    this.bodyMaterial.uniforms.uSeed.value = this.seed + 3;
    // Filete fino e irregular por cima do corpo.
    jaggedBoltPath(new THREE.Vector3(0, BOLT_TOP, 0), head, 12, 0.5 * (1 - 0.6 * (impactAge > 0 ? 1 : 0)), boltRandom, this.topPath);
    this.bolt.setPath(this.topPath, this.topPath.map((_, i) => 0.22 + 0.08 * Math.sin(i * 1.3 + this.age * 20)));
    this.boltMaterial.uniforms.uTime.value = this.age;
    this.boltMaterial.uniforms.uOpacity.value = boltFade;
    this.boltMaterial.uniforms.uSeed.value = this.seed;

    // Branches off the main bolt, visible during the fall and the first flicker.
    this.branches.forEach((branch, index) => {
      const at = Math.min(this.topPath.length - 2, 2 + index * 3);
      const from = this.topPath[at] ?? head;
      const to = new THREE.Vector3(from.x + (index % 2 ? 0.9 : -0.9), Math.max(0.3, from.y - 1.6), from.z + 0.5);
      jaggedBoltPath(from, to, 5, 0.6, boltRandom, this.branchPaths[index]);
      branch.setPath(this.branchPaths[index], BRANCH_HALF_WIDTH);
    });
    this.branchMaterial.uniforms.uOpacity.value = boltFade * 0.9;
    this.branchMaterial.uniforms.uTime.value = this.age;

    // Ground arcs crawling out from the base after landing.
    this.groundArcs.forEach((arc, index) => {
      const angle = (index / this.groundArcs.length) * TAU + 0.4;
      const crawl = THREE.MathUtils.smoothstep(impactAge, 0, 0.4);
      const reach = (1.6 + (index % 2) * 1.1) * (0.25 + 0.75 * crawl);
      const from = new THREE.Vector3(0, 0.05, 0);
      const to = new THREE.Vector3(Math.cos(angle) * reach, 0.05, Math.sin(angle) * reach);
      const path = jaggedBoltPath(from, to, 5, 0.9, boltRandom, this.arcPaths[index]);
      arc.setPath(path, ARC_HALF_WIDTH);
    });
    this.arcMaterial.uniforms.uOpacity.value = impactAge > 0 ? (1 - THREE.MathUtils.smoothstep(impactAge, 0.45, 1.0)) : 0;
    this.arcMaterial.uniforms.uTime.value = this.age;

    // Flash, shock ring and crater after contact.
    const flash = 1 - THREE.MathUtils.smoothstep(impactAge, 0, 0.45);
    this.flash.scale.setScalar(1.8 + 3.8 * THREE.MathUtils.smoothstep(impactAge, 0, 0.22));
    this.flashMaterial.opacity = flash;
    const burstAge = THREE.MathUtils.smoothstep(impactAge, 0, 0.12);
    this.burst.scale.setScalar(0.9 + 2.6 * THREE.MathUtils.smoothstep(impactAge, 0, 0.28));
    this.burstMaterial.opacity = burstAge * (1 - THREE.MathUtils.smoothstep(impactAge, 0.12, 0.5));
    const shockR = 0.4 + 2.4 * THREE.MathUtils.smoothstep(impactAge, 0, 0.6);
    this.shock.scale.setScalar(shockR);
    this.shockMaterial.uniforms.uTime.value = impactAge;
    this.shockMaterial.uniforms.uOpacity.value = 1 - THREE.MathUtils.smoothstep(impactAge, 0.3, 0.9);
    (this.crater.material as THREE.MeshBasicMaterial).opacity = 0.9 * THREE.MathUtils.smoothstep(impactAge, 0, 0.08) * (1 - THREE.MathUtils.smoothstep(impactAge, 1.0, 1.5));

    // Blades: appear after the first flash, orbit and spin, then fade.
    const bladeLive = THREE.MathUtils.smoothstep(impactAge, 0.05, 0.25) * (1 - THREE.MathUtils.smoothstep(impactAge, 1.0, 1.5));
    this.blades.forEach((blade, index) => {
      blade.group.rotation.y += step * (2.4 + index * 0.6);
      blade.group.position.y = Math.sin(impactAge * 3 + index) * 0.12;
    });
    for (let index = 0; index < this.bladeMaterials.length; index += 1) {
      this.bladeMaterials[index].opacity = bladeLive * (index % 2 === 0 ? 0.92 : 0.7);
    }

    // Smoke: puffs pop out, grow, then dissolve.
    const smokeLive = 1 - THREE.MathUtils.smoothstep(impactAge, 0.9, 1.5);
    const glowGrow = THREE.MathUtils.smoothstep(impactAge, 0, 0.35);
    this.underglow.scale.setScalar(3.0 + 3.6 * glowGrow);
    this.underglowMaterial.opacity = 0.95 * smokeLive * glowGrow;
    this.smokes.forEach((smoke, index) => {
      const grow = THREE.MathUtils.smoothstep(impactAge, smoke.delay, 0.5 + smoke.delay);
      smoke.sprite.scale.setScalar(0.9 + 2.2 * grow);
      smoke.sprite.position.y = smoke.height + 0.35 * grow;
      this.smokeMaterials[index].opacity = 0.96 * smokeLive * grow;
    });

    // Shards: ballistic arcs with spin, hidden after the cloud dissipates.
    const shardLive = 1 - THREE.MathUtils.smoothstep(impactAge, 1.1, 1.4);
    for (let index = 0; index < this.shardData.length; index += 1) {
      const data = this.shardData[index];
      const t = impactAge;
      this.shardPos.set(data.vx * t, 0.3 + data.vy * t - 4.9 * t * t, data.vz * t);
      this.shardQuat.setFromAxisAngle(this.shardAxis, data.spin * impactAge);
      const size = Math.max(0.0001, shardLive * (impactAge > 0 ? 1 : 0));
      this.shardScale.set(size, size * 0.3, size * 0.6);
      this.shardMatrix.compose(this.shardPos, this.shardQuat, this.shardScale);
      this.shards.setMatrixAt(index, this.shardMatrix);
    }
    this.shards.instanceMatrix.needsUpdate = true;

    this.sparks.update(step);
    if (this.light) {
      this.light.light.position.copy(this.group.position).y += 1.2;
      this.light.light.intensity = (impactAge > 0 ? 2.2 * Math.exp(-impactAge * 5) : 0) + descent * 0.4;
    }
    return this.age < THUNDER_DESCENT_SECONDS + THUNDER_LIFETIME_SECONDS;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.options = null;
    this.age = 0;
    this.impacted = false;
    this.sparks.reset();
    this.light?.release();
    this.light = null;
  }

  public dispose(): void {
    this.reset();
    this.sparks.dispose();
    disposeTree(this.group);
    this.boltMaterial.dispose();
    this.bodyMaterial.dispose();
    this.burstMaterial.dispose();
    this.branchMaterial.dispose();
    this.arcMaterial.dispose();
    this.shockMaterial.dispose();
  }
}

// ───────────────────────────────────── Manager ─────────────────────────────────────

/** Pooled Pulo Atacando (Maga): invocation bubble while casting, then thunder on enemies. */
export class ThunderVFX {
  private readonly chargePool: VFXPool<ThunderCharge>;
  private readonly strikePool: VFXPool<ThunderStrike>;
  private readonly charges: ThunderCharge[] = [];
  private readonly strikes: ThunderStrike[] = [];
  /** Logical hits wait for the fall when every GPU slot is busy; damage is never dropped. */
  private readonly pendingStrikes: Array<{ options: ThunderStrikeOptions; position: THREE.Vector3; elapsed: number }> = [];

  public constructor(private readonly scene: THREE.Scene, resources: MageVFXResources, lights: VFXLightPool, quality: MageVFXQuality) {
    this.chargePool = new VFXPool(() => new ThunderCharge(resources, lights, quality), THUNDER_POOL_LIMITS.charges);
    this.strikePool = new VFXPool(() => new ThunderStrike(resources, lights, quality), THUNDER_POOL_LIMITS.strikes);
  }

  public charge(caster: THREE.Object3D): ThunderChargeHandle | null {
    const effect = this.chargePool.acquire();
    if (!effect) return null;
    effect.play(caster);
    this.scene.add(effect.group);
    this.charges.push(effect);
    return effect;
  }

  public strike(options: ThunderStrikeOptions): void {
    const effect = this.strikePool.acquire();
    if (!effect) {
      this.pendingStrikes.push({ options, position: options.position.clone(), elapsed: 0 });
      return;
    }
    effect.play(options);
    this.scene.add(effect.group);
    this.strikes.push(effect);
  }

  public update(delta: number): void {
    const elapsed = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    for (let index = this.pendingStrikes.length - 1; index >= 0; index -= 1) {
      const pending = this.pendingStrikes[index];
      if (!pending) continue;
      pending.elapsed += elapsed;
      const { options } = pending;
      const alive = options.target && (!options.isTargetAlive || options.isTargetAlive(options.target));
      if (alive) options.target!.getWorldPosition(pending.position);
      if (pending.elapsed < THUNDER_DESCENT_SECONDS) continue;
      this.pendingStrikes.splice(index, 1);
      options.onImpact(pending.position, alive ? options.target : null);
    }
    for (let index = this.charges.length - 1; index >= 0; index -= 1) {
      const effect = this.charges[index];
      if (!effect || effect.update(elapsed)) continue;
      this.chargePool.release(effect);
      if (this.charges[index] === effect) this.charges.splice(index, 1);
    }
    for (let index = this.strikes.length - 1; index >= 0; index -= 1) {
      const effect = this.strikes[index];
      if (!effect || effect.update(elapsed)) continue;
      if (this.strikes[index] !== effect) continue;
      this.strikePool.release(effect);
      this.strikes.splice(index, 1);
    }
  }

  public clear(): void {
    this.chargePool.clearActive();
    this.strikePool.clearActive();
    this.charges.length = 0;
    this.strikes.length = 0;
    this.pendingStrikes.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.chargePool.dispose();
    this.strikePool.dispose();
  }

  public get activeCharges(): number { return this.charges.length; }
  public get activeStrikes(): number { return this.strikes.length; }
  public get pooledCharges(): number { return this.chargePool.inactiveCount; }
  public get pooledStrikes(): number { return this.strikePool.inactiveCount; }
}
