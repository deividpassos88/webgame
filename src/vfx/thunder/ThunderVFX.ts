import { JUIZO_LIGHTNING_SECONDS, JUIZO_TOTAL_SECONDS } from '../../combat/MageLightningTiming';
import * as THREE from 'three';
import type { MageVFXResources } from '../MageVFXResources';
import { PooledParticleCloud } from '../ParticleManager';
import { VFXPool, type PoolableVFX } from '../VFXPool';
import { VFXLightPool, type VFXLightHandle } from '../VFXLightPool';
import type { MageVFXQuality } from '../VFXTypes';
import {
  createThunderBarrierMaterial, createThunderBeamMaterial, createThunderBoltMaterial,
  createThunderBurstCanvasTexture, createThunderRingMaterial, createThunderShadowTexture,
} from './ThunderMaterials';
import {
  createThunderBladeGeometry, createThunderDiscGeometry, createThunderRockGeometry, jaggedBoltPath, ThunderBolt,
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

// ───────────────────────────── Juízo do Trovão: barreira da conjuração ─────────────────────────────
// Linha do tempo da conjuração, em segundos desde o início (tempo real). Tempos em
// src/combat/MageLightningTiming.ts (total e atraso do raio); o resto segue aqui:
//  0.0–0.6   a magia sobe reta da ponta do cajado até o topo da barreira;
//  0.5–2.2   a cúpula desce de cima para baixo, gradual, até o chão;
//  1.9       o raio cai no inimigo (agendado por ThunderVFX.strike);
//  2.2       contato: pedras menores saem da borda e caem;
//  2.2–2.95  a barreira fica fixa, e a Maga fica travada até o fim da conjuração;
//  2.95–3.2  a barreira se dissolve.

/** Tamanho da barreira: metade da versão de 3×. */
const BARRIER_SCALE = 1.5;
const BARRIER_RADIUS = BUBBLE_RADIUS * BARRIER_SCALE;
export const BARRIER_TOTAL_SECONDS = JUIZO_TOTAL_SECONDS;
/** Quando o raio atinge o inimigo, contado a partir do início da conjuração. */
export const BARRIER_LIGHTNING_SECONDS = JUIZO_LIGHTNING_SECONDS;
const BARRIER_RISE_END = 0.6;
const BARRIER_FORM_START = 0.5;
const BARRIER_FORM_END = 2.2;
const BARRIER_FADE_START = 2.95;
const BARRIER_FADE_END = BARRIER_TOTAL_SECONDS;
/** Lajes da borda: tempo para se erguerem após o contato (segundos lógicos). */
const SLAB_RISE_SECONDS = 0.16;
const CHARGE_GRAVITY = 9.8;
const CHARGE_DEFAULT_TIP = new THREE.Vector3(0, 1.45, 0);
const TMP_CHARGE_HEAD = new THREE.Vector3();
const TMP_CHARGE_MID = new THREE.Vector3();

const clamp01 = (value: number): number => THREE.MathUtils.clamp(value, 0, 1);

function additiveSprite(texture: THREE.Texture, color: number, name: string): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, color, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  sprite.name = name;
  sprite.renderOrder = 8;
  return sprite;
}

interface ChargeRock {
  mesh: THREE.Mesh;
  angle: number;
  start: number;
  outward: number;
  lift: number;
  size: number;
  spin: number;
}
class ThunderCharge implements PoolableVFX, ThunderChargeHandle {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly origin = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly domeMaterial = createThunderBarrierMaterial();
  private readonly rockMaterial = new THREE.MeshLambertMaterial({ color: 0x6f6457, flatShading: true });
  private readonly slabMaterial = new THREE.MeshLambertMaterial({ color: 0xcbc3b6, flatShading: true });
  private readonly slabs: Array<{ pivot: THREE.Group; angle: number; tilt: number }> = [];
  private readonly rockGeometries: THREE.BufferGeometry[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly dome: THREE.Mesh;
  private readonly rocks: ChargeRock[] = [];
  private readonly orbGlow: THREE.Sprite;
  private readonly orbCore: THREE.Sprite;
  private readonly trailWide: THREE.Sprite;
  private readonly trailCore: THREE.Sprite;
  private light: VFXLightHandle | null = null;
  private played = false;
  private age = 0;

  public constructor(resources: MageVFXResources, private readonly lights: VFXLightPool, private readonly quality: MageVFXQuality) {
    const R = BARRIER_RADIUS;
    this.group.name = 'MageThunderBarrierVFX';
    this.group.visible = false;

    // Cúpula: começa como uma calota no topo e fecha até o chão (ver createThunderBarrierMaterial).
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32, 0, TAU, 0, Math.PI / 2), this.domeMaterial);
    this.dome.name = 'ThunderBarrierDome';
    this.dome.renderOrder = 6;
    this.group.add(this.dome);

    // Lajes claras que se erguem da borda: a base fica no aro e a ponta sobe inclinada para fora.
    const slabCount = quality === 'low' ? 6 : 8;
    for (let index = 0; index < slabCount; index += 1) {
      const height = 1.0 + (index % 3) * 0.35;
      const geometry = new THREE.ConeGeometry(0.16 + (index % 2) * 0.05, height, 4, 1);
      geometry.translate(0, height / 2, 0);
      this.rockGeometries.push(geometry);
      const pivot = new THREE.Group();
      pivot.name = 'ThunderBarrierSlab';
      pivot.visible = false;
      pivot.add(new THREE.Mesh(geometry, this.slabMaterial));
      this.slabs.push({ pivot, angle: (index / slabCount) * TAU + 0.2, tilt: 0.3 + (index % 3) * 0.12 });
      this.group.add(pivot);
    }

    // Fragmentos escuros que pulam para fora da borda e caem no entulho.
    const rockCount = quality === 'low' ? 4 : 6;
    for (let index = 0; index < rockCount; index += 1) {
      const size = 0.1 + (index % 3) * 0.05;
      const geometry = createThunderRockGeometry(index + 1, size);
      this.rockGeometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, this.rockMaterial);
      mesh.name = 'ThunderBarrierRock';
      mesh.visible = false;
      this.rocks.push({
        mesh,
        angle: (index / rockCount) * TAU + 0.3,
        start: R * (0.98 + (index % 3) * 0.02),
        outward: 1.2 + (index % 3) * 0.4,
        lift: 3.6 + (index % 4) * 0.3,
        size,
        spin: 2.0 + (index % 3) * 1.1,
      });
      this.group.add(mesh);
    }

    // Magia que sobe do cajado: núcleo branco + halo magenta + rastro.
    this.orbGlow = additiveSprite(resources.softGlow, 0xc23cff, 'ThunderBarrierOrbGlow');
    this.orbCore = additiveSprite(resources.softGlow, 0xffffff, 'ThunderBarrierOrbCore');
    this.trailWide = additiveSprite(resources.softGlow, 0xb84dff, 'ThunderBarrierTrailWide');
    this.trailCore = additiveSprite(resources.softGlow, 0xffe6ff, 'ThunderBarrierTrailCore');
    this.group.add(this.orbGlow, this.orbCore, this.trailWide, this.trailCore);
  }

  public play(caster: THREE.Object3D, staffTip?: THREE.Vector3 | null): void {
    caster.getWorldPosition(this.origin);
    this.group.position.copy(this.origin);
    if (staffTip && Number.isFinite(staffTip.x) && Number.isFinite(staffTip.y) && Number.isFinite(staffTip.z)) {
      this.tip.copy(staffTip).sub(this.origin);
      this.tip.y = THREE.MathUtils.clamp(this.tip.y, 0.9, 2.4);
      const reach = Math.hypot(this.tip.x, this.tip.z);
      if (reach > 1.2) { this.tip.x *= 1.2 / reach; this.tip.z *= 1.2 / reach; }
    } else {
      this.tip.copy(CHARGE_DEFAULT_TIP);
    }
    this.age = 0;
    this.played = true;
    this.group.visible = true;
    this.light = this.quality === 'low' ? null : this.lights.acquire();
    if (this.light) {
      this.light.light.color.set(0xb84dff);
      this.light.light.distance = BARRIER_RADIUS * 4;
      this.light.light.intensity = 0;
    }
    this.update(0);
  }

  /** A barreira segue a própria linha do tempo: liberar a conjuração não a encurta. */
  public release(): void {}

  public update(delta: number): boolean {
    if (!this.played) return false;
    this.age += Math.max(0, delta);
    const a = this.age;
    const R = BARRIER_RADIUS;
    const fade = THREE.MathUtils.smoothstep(a, BARRIER_FADE_START, BARRIER_FADE_END);
    if (a >= BARRIER_FADE_END) return false;
    const alive = 1 - fade;
    const flicker = 0.92 + 0.08 * Math.sin(a * 22);

    // Magia do cajado: sobe reta até o topo (y = R) e se centraliza sobre a Maga.
    const rise = clamp01(a / BARRIER_RISE_END);
    const eased = 1 - (1 - rise) * (1 - rise) * (1 - rise);
    const head = TMP_CHARGE_HEAD.set(
      this.tip.x * (1 - eased),
      THREE.MathUtils.lerp(this.tip.y, R, eased),
      this.tip.z * (1 - eased),
    );
    const bloom = THREE.MathUtils.smoothstep(a, BARRIER_RISE_END - 0.05, BARRIER_RISE_END + 0.45);
    const orbAlive = (1 - bloom) * alive;
    this.orbGlow.position.copy(head);
    this.orbGlow.scale.setScalar(1.2 + 0.2 * flicker);
    (this.orbGlow.material as THREE.SpriteMaterial).opacity = 0.9 * orbAlive;
    this.orbCore.position.copy(head);
    this.orbCore.scale.setScalar(0.55 * flicker);
    (this.orbCore.material as THREE.SpriteMaterial).opacity = orbAlive;
    const trailLength = Math.max(0.01, head.distanceTo(this.tip));
    TMP_CHARGE_MID.addVectors(this.tip, head).multiplyScalar(0.5);
    this.trailWide.position.copy(TMP_CHARGE_MID);
    this.trailWide.scale.set(0.9, trailLength, 1);
    (this.trailWide.material as THREE.SpriteMaterial).opacity = 0.75 * orbAlive;
    this.trailCore.position.copy(TMP_CHARGE_MID);
    this.trailCore.scale.set(0.22, trailLength, 1);
    (this.trailCore.material as THREE.SpriteMaterial).opacity = 0.95 * orbAlive;

    // Fechamento de cima para baixo, gradual: a cúpula visível desce de y = R até y = 0.
    const reveal = clamp01((a - BARRIER_FORM_START) / (BARRIER_FORM_END - BARRIER_FORM_START));
    this.domeMaterial.uniforms.uTime.value = a;
    this.domeMaterial.uniforms.uCutY.value = R * (1 - reveal);
    this.domeMaterial.uniforms.uOpacity.value = alive;

    const landed = a >= BARRIER_FORM_END;
    const touchAge = a - BARRIER_FORM_END;

    // Lajes: deitadas no contato, erguem-se (ease-out) inclinadas para fora da borda.
    const slabOpen = clamp01(touchAge / SLAB_RISE_SECONDS);
    const slabEase = 1 - (1 - slabOpen) * (1 - slabOpen) * (1 - slabOpen);
    for (const slab of this.slabs) {
      slab.pivot.visible = landed;
      if (!landed) continue;
      slab.pivot.position.set(Math.cos(slab.angle) * R * 0.98, 0, Math.sin(slab.angle) * R * 0.98);
      // Ordem YXZ: o pitch deita (π/2) ou inclina a laje; o yaw aponta a laje para a borda.
      slab.pivot.rotation.set(THREE.MathUtils.lerp(Math.PI / 2, slab.tilt, slabEase), Math.PI / 2 - slab.angle, 0, 'YXZ');
    }

    // Fragmentos: sobem, caem e param no chão.
    for (const rock of this.rocks) {
      rock.mesh.visible = landed;
      if (!landed) continue;
      const landAt = (2 * rock.lift) / CHARGE_GRAVITY;
      const t = Math.min(Math.max(0, touchAge), landAt);
      const y = rock.size * 0.5 + rock.lift * t - 0.5 * CHARGE_GRAVITY * t * t;
      const dist = rock.start + rock.outward * t;
      rock.mesh.position.set(Math.cos(rock.angle) * dist, Math.max(rock.size * 0.3, y), Math.sin(rock.angle) * dist);
      rock.mesh.rotation.set(t * rock.spin, t * rock.spin * 0.6, t * rock.spin * 0.3);
      rock.mesh.scale.setScalar(Math.max(0.001, clamp01(touchAge / 0.06)));
    }

    if (this.light) {
      const lightY = a < BARRIER_RISE_END ? Math.max(0.9, head.y) : R * 0.5;
      this.light.light.position.set(this.origin.x, this.origin.y + lightY, this.origin.z);
      const flash = landed ? 2.0 * (1 - THREE.MathUtils.smoothstep(touchAge, 0, 0.4)) : 0;
      const topFlash = 1.2 * (1 - THREE.MathUtils.smoothstep(a, BARRIER_RISE_END, BARRIER_RISE_END + 0.4));
      this.light.light.intensity = (0.8 * reveal + topFlash + flash) * alive * flicker;
    }
    return true;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.played = false;
    this.light?.release();
    this.light = null;
    this.age = 0;
  }

  public dispose(): void {
    this.reset();
    disposeTree(this.group);
    this.domeMaterial.dispose();
    this.rockMaterial.dispose();
    this.slabMaterial.dispose();
    this.rockGeometries.forEach((geometry) => geometry.dispose());
    this.textures.forEach((texture) => texture.dispose());
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
  private readonly sheath: ThunderBolt;
  private readonly sheathMaterial = createThunderBoltMaterial(0xff2bd6);
  private readonly bodyMaterial = createThunderBoltMaterial(0xff2bd6);
  private readonly bodyPath: THREE.Vector3[] = [];
  private readonly boltMaterial = createThunderBoltMaterial(0xff2bd6);
  private readonly branchMaterial = createThunderBoltMaterial(0xff2bd6);
  private readonly arcMaterial = createThunderBoltMaterial(0x9b4dff);
  private readonly flash: THREE.Sprite;
  private readonly flashMaterial: THREE.SpriteMaterial;
  private readonly burst: THREE.Sprite;
  private readonly burstMaterial: THREE.SpriteMaterial;
  private readonly shock: THREE.Mesh;
  private readonly shockMaterial = createThunderRingMaterial();
  private readonly crater: THREE.Mesh;
  private readonly blades: Array<{ group: THREE.Group; phase: number; height: number }> = [];
  private readonly bladeMaterials: THREE.MeshBasicMaterial[] = [];
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
    // Bainha de brilho magenta, larga e transparente, em volta do corpo do raio.
    this.sheath = new ThunderBolt(high ? 14 : 10, this.sheathMaterial, 'ThunderBoltSheath');
    this.group.add(this.sheath.mesh);
    this.bolt = new ThunderBolt(high ? 16 : 12, this.boltMaterial, 'ThunderMainBolt');
    this.group.add(this.bolt.mesh);
    for (let index = 0; index < 3; index += 1) {
      const branch = new ThunderBolt(6, this.branchMaterial, 'ThunderBranchBolt');
      this.branches.push(branch);
      this.branchPaths.push([]);
      this.group.add(branch.mesh);
    }
    for (let index = 0; index < 8; index += 1) {
      const arc = new ThunderBolt(7, this.arcMaterial, 'ThunderGroundArc');
      this.groundArcs.push(arc);
      this.arcPaths.push([]);
      this.group.add(arc.mesh);
    }

    this.flashMaterial = new THREE.SpriteMaterial({
      map: resources.softGlow, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.flash = new THREE.Sprite(this.flashMaterial);
    this.flash.position.y = 0.6;
    this.flash.name = 'ThunderImpactFlash';
    this.group.add(this.flash);

    // Estouro branco na base: sobe forte no contato e some em instantes.
    this.burstMaterial = new THREE.SpriteMaterial({
      map: createThunderBurstCanvasTexture(3), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
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
    this.sheath.setPath(this.bodyPath, this.bodyPath.map((_, i) => BODY_HALF_WIDTH * 2.1 + 0.12 * Math.sin(i * 1.1 + this.age * 9)));
    this.sheathMaterial.uniforms.uTime.value = this.age;
    this.sheathMaterial.uniforms.uOpacity.value = 0.4 * boltFade;
    this.sheathMaterial.uniforms.uSeed.value = this.seed + 7;
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
    this.sheathMaterial.dispose();
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
  /** Tempo decorrido desde o início da conjuração atual (segundos). */
  private castClock = 0;
  /** Raios agendados para um instante da conjuração (ex.: aos 3 s). */
  private readonly scheduledStrikes: Array<{ options: ThunderStrikeOptions; at: number }> = [];
  private readonly pendingStrikes: Array<{ options: ThunderStrikeOptions; position: THREE.Vector3; elapsed: number }> = [];

  public constructor(private readonly scene: THREE.Scene, resources: MageVFXResources, lights: VFXLightPool, quality: MageVFXQuality) {
    this.chargePool = new VFXPool(() => new ThunderCharge(resources, lights, quality), THUNDER_POOL_LIMITS.charges);
    this.strikePool = new VFXPool(() => new ThunderStrike(resources, lights, quality), THUNDER_POOL_LIMITS.strikes);
  }

  public charge(caster: THREE.Object3D, staffTip?: THREE.Vector3 | null): ThunderChargeHandle | null {
    // Nova conjuração: o relógio da conjuração recomeça para agendar o raio.
    this.castClock = 0;
    const effect = this.chargePool.acquire();
    if (!effect) return null;
    effect.play(caster, staffTip);
    this.scene.add(effect.group);
    this.charges.push(effect);
    return effect;
  }

  /**
   * Dispara o raio. Com `atCastSeconds`, a queda é agendada para esse instante
   * da conjuração (contado desde o `charge`), e não de imediato.
   */
  public strike(options: ThunderStrikeOptions, atCastSeconds?: number): void {
    if (atCastSeconds !== undefined && atCastSeconds > this.castClock) {
      this.scheduledStrikes.push({ options, at: atCastSeconds });
      return;
    }
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
    this.castClock += elapsed;
    for (let index = this.scheduledStrikes.length - 1; index >= 0; index -= 1) {
      const scheduled = this.scheduledStrikes[index];
      if (!scheduled || this.castClock < scheduled.at) continue;
      this.scheduledStrikes.splice(index, 1);
      this.strike(scheduled.options);
    }
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
    this.scheduledStrikes.length = 0;
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
