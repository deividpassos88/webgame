import * as THREE from 'three';
import type { MageVFXResources } from '../MageVFXResources';
import { PooledParticleCloud } from '../ParticleManager';
import { VFXPool, type PoolableVFX } from '../VFXPool';
import { VFXLightPool, type VFXLightHandle } from '../VFXLightPool';
import type { MageVFXQuality } from '../VFXTypes';
import {
  createThunderBarrierMaterial, createThunderBeamMaterial, createThunderBoltMaterial,
  createThunderBurstCanvasTexture, createThunderCrackCanvasTexture, createThunderRingMaterial, createThunderShadowTexture, createThunderSmokeCanvasTexture,
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

// ───────────────────────────── Juízo do Trovão: barreira da conjuração ─────────────────────────────
// Linha do tempo da conjuração, em segundos desde o início (tempo real):
//  0.0–1.0   a magia sobe reta da ponta do cajado até o topo da barreira;
//  0.9–3.5   a cúpula se fecha de cima para baixo, descendo até encostar no chão;
//  3.0       o raio cai no inimigo (agendado por ThunderVFX.strike);
//  3.5       contato: o chão racha (fendas, cratera, pedras, fumaça escura, clarão);
//  3.5–4.7   a barreira fica fixa;
//  4.7–5.0   a barreira se dissolve. Liberar a conjuração não encurta esse tempo.

/** Tamanho da barreira: 3× a cúpula anterior. */
const BARRIER_SCALE = 3;
const BARRIER_RADIUS = BUBBLE_RADIUS * BARRIER_SCALE;
/** Duração total da conjuração visual. */
export const BARRIER_TOTAL_SECONDS = 5;
/** Quando o raio atinge o inimigo, contado a partir do início da conjuração. */
export const BARRIER_LIGHTNING_SECONDS = 3;
const BARRIER_RISE_END = 1.0;
const BARRIER_FORM_START = 0.9;
const BARRIER_FORM_END = 3.5;
const BARRIER_FADE_START = 4.7;
const BARRIER_FADE_END = BARRIER_TOTAL_SECONDS;
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

interface ChargeRock { mesh: THREE.Mesh; angle: number; radius: number; lift: number; spin: number }
interface ChargeSmoke { sprite: THREE.Sprite; material: THREE.SpriteMaterial; angle: number; radius: number; delay: number }

class ThunderCharge implements PoolableVFX, ThunderChargeHandle {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly origin = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly domeMaterial = createThunderBarrierMaterial();
  private readonly ringMaterial = createThunderRingMaterial();
  private readonly textures: THREE.Texture[] = [];
  private readonly dome: THREE.Mesh;
  private readonly beams: THREE.Mesh[] = [];
  private readonly beamMaterials: THREE.ShaderMaterial[] = [];
  private readonly shards: THREE.Mesh[] = [];
  private readonly rocks: ChargeRock[] = [];
  private readonly smokes: ChargeSmoke[] = [];
  private readonly crater: THREE.Mesh;
  private readonly craterMaterial: THREE.MeshBasicMaterial;
  private readonly cracks: THREE.Mesh;
  private readonly crackMaterial: THREE.MeshBasicMaterial;
  private readonly shock: THREE.Mesh;
  private readonly burst: THREE.Sprite;
  private readonly burstMaterial: THREE.SpriteMaterial;
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

    // Fios de luz verticais dentro da cúpula; crescem da base junto com o fechamento.
    const beamCount = quality === 'low' ? 14 : 22;
    for (let index = 0; index < beamCount; index += 1) {
      const material = createThunderBeamMaterial();
      material.side = THREE.DoubleSide;
      material.uniforms.uSeed.value = index * 1.7;
      this.beamMaterials.push(material);
      const angle = (index / beamCount) * TAU + (index % 3) * 0.17;
      const radius = R * (0.2 + (index % 5) * 0.12);
      const height = Math.sqrt(Math.max(0, R * R - radius * radius)) * 0.9;
      const geometry = new THREE.PlaneGeometry(0.9, height);
      geometry.translate(0, height / 2, 0);
      const beam = new THREE.Mesh(geometry, material);
      beam.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      beam.rotation.y = angle;
      beam.name = 'ThunderBarrierBeam';
      beam.renderOrder = 7;
      this.beams.push(beam);
      this.group.add(beam);
    }

    // Cacos cinza-brancos pontudos na borda da base, saindo do chão quebrado.
    const shardCount = quality === 'low' ? 10 : 14;
    for (let index = 0; index < shardCount; index += 1) {
      const angle = (index / shardCount) * TAU + 0.12;
      const height = 3.0 + (index % 3) * 0.9;
      const shard = new THREE.Mesh(new THREE.ConeGeometry(0.5, height, 4), new THREE.MeshBasicMaterial({
        color: 0xe4e0f4, transparent: true, opacity: 0, depthWrite: false,
      }));
      shard.position.set(Math.cos(angle) * R * 0.92, 0, Math.sin(angle) * R * 0.92);
      shard.rotation.set(-Math.sin(angle) * 0.3, 0, Math.cos(angle) * 0.3);
      shard.userData.height = height;
      shard.name = 'ThunderBarrierShard';
      this.shards.push(shard);
      this.group.add(shard);
    }

    // Pedras escuras que saltam do chão no contato.
    const rockCount = quality === 'low' ? 8 : 12;
    for (let index = 0; index < rockCount; index += 1) {
      const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + (index % 3) * 0.1, 0), new THREE.MeshBasicMaterial({
        color: 0x241a2a, transparent: true, opacity: 0, depthWrite: false,
      }));
      mesh.name = 'ThunderBarrierRock';
      mesh.visible = false;
      this.rocks.push({
        mesh,
        angle: (index / rockCount) * TAU + 0.3,
        radius: R * (0.35 + (index % 4) * 0.08),
        lift: 4.0 + (index % 4) * 0.9,
        spin: 1.5 + (index % 3) * 0.7,
      });
      this.group.add(mesh);
    }

    // Fumaça escura e densa que sobe da base rachada.
    const smokeTextures = [2, 5, 8, 11].map((seed) => {
      const texture = createThunderSmokeCanvasTexture(seed);
      this.textures.push(texture);
      return texture;
    });
    const smokeCount = quality === 'low' ? 6 : 9;
    for (let index = 0; index < smokeCount; index += 1) {
      const material = new THREE.SpriteMaterial({
        map: smokeTextures[index % smokeTextures.length], color: 0x1d1426,
        transparent: true, opacity: 0, depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.name = 'ThunderBarrierSmoke';
      sprite.renderOrder = 5;
      sprite.visible = false;
      this.smokes.push({
        sprite, material,
        angle: (index / smokeCount) * TAU + 0.5,
        radius: R * (0.3 + (index % 3) * 0.15),
        delay: (index % 4) * 0.08,
      });
      this.group.add(sprite);
    }

    // Cratera escura e fendas radiais no chão.
    this.craterMaterial = new THREE.MeshBasicMaterial({ color: 0x0d0710, transparent: true, opacity: 0, depthWrite: false });
    this.crater = new THREE.Mesh(new THREE.CircleGeometry(R * 1.02, 64), this.craterMaterial);
    this.crater.rotation.x = -Math.PI / 2;
    this.crater.position.y = 0.02;
    this.crater.name = 'ThunderCraterDisc';
    this.group.add(this.crater);

    const crackTexture = createThunderCrackCanvasTexture(5);
    this.textures.push(crackTexture);
    this.crackMaterial = new THREE.MeshBasicMaterial({ map: crackTexture, transparent: true, opacity: 0, depthWrite: false });
    this.cracks = new THREE.Mesh(new THREE.PlaneGeometry(R * 3.2, R * 3.2), this.crackMaterial);
    this.cracks.rotation.x = -Math.PI / 2;
    this.cracks.position.y = 0.035;
    this.cracks.name = 'ThunderGroundCracks';
    this.group.add(this.cracks);

    // Onda de choque no chão, no contato.
    this.shock = new THREE.Mesh(createThunderDiscGeometry(24, 72), this.ringMaterial);
    this.shock.position.y = 0.04;
    this.shock.name = 'ThunderShockRing';
    this.group.add(this.shock);

    // Clarão no contato.
    const burstTexture = createThunderBurstCanvasTexture(3);
    this.textures.push(burstTexture);
    this.burst = additiveSprite(burstTexture, 0xffffff, 'ThunderBarrierBurst');
    this.burstMaterial = this.burst.material as THREE.SpriteMaterial;
    this.burst.position.y = 1.5;
    this.group.add(this.burst);

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
      this.light.light.distance = BARRIER_RADIUS * 3;
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
    this.orbGlow.scale.setScalar(2.4 + 0.4 * flicker);
    (this.orbGlow.material as THREE.SpriteMaterial).opacity = 0.9 * orbAlive;
    this.orbCore.position.copy(head);
    this.orbCore.scale.setScalar(1.1 * flicker);
    (this.orbCore.material as THREE.SpriteMaterial).opacity = orbAlive;
    const trailLength = Math.max(0.01, head.distanceTo(this.tip));
    TMP_CHARGE_MID.addVectors(this.tip, head).multiplyScalar(0.5);
    this.trailWide.position.copy(TMP_CHARGE_MID);
    this.trailWide.scale.set(1.8, trailLength, 1);
    (this.trailWide.material as THREE.SpriteMaterial).opacity = 0.75 * orbAlive;
    this.trailCore.position.copy(TMP_CHARGE_MID);
    this.trailCore.scale.set(0.45, trailLength, 1);
    (this.trailCore.material as THREE.SpriteMaterial).opacity = 0.95 * orbAlive;

    // Fechamento de cima para baixo: a cúpula visível desce de y = R até y = 0.
    const reveal = THREE.MathUtils.smoothstep(a, BARRIER_FORM_START, BARRIER_FORM_END);
    this.domeMaterial.uniforms.uTime.value = a;
    this.domeMaterial.uniforms.uCutY.value = R * (1 - reveal);
    this.domeMaterial.uniforms.uOpacity.value = 0.95 * alive;

    this.beams.forEach((beam, index) => {
      const material = this.beamMaterials[index];
      const pulse = 0.78 + 0.22 * Math.sin(a * 9 + index * 1.3);
      material.uniforms.uTime.value = a;
      material.uniforms.uGrow.value = clamp01(reveal * pulse);
      material.uniforms.uOpacity.value = reveal * alive;
      beam.scale.y = Math.max(0.001, reveal * pulse);
    });

    const landed = a >= BARRIER_FORM_END;
    const touchAge = a - BARRIER_FORM_END;

    this.shards.forEach((shard, index) => {
      const appear = landed ? THREE.MathUtils.smoothstep(touchAge, index * 0.02, 0.4 + index * 0.02) : 0;
      const height = shard.userData.height as number;
      shard.scale.setScalar(Math.max(0.001, appear));
      shard.position.y = (height * 0.5) * appear;
      (shard.material as THREE.MeshBasicMaterial).opacity = 0.95 * appear * alive;
    });

    for (const rock of this.rocks) {
      rock.mesh.visible = landed;
      if (!landed) continue;
      const t = Math.max(0, touchAge);
      const dist = rock.radius + 2.0 * Math.min(t, 0.6);
      const y = Math.max(0.1, 0.1 + rock.lift * t - 0.5 * CHARGE_GRAVITY * t * t);
      rock.mesh.position.set(Math.cos(rock.angle) * dist, y, Math.sin(rock.angle) * dist);
      rock.mesh.rotation.set(t * rock.spin, t * rock.spin * 0.6, 0);
      (rock.mesh.material as THREE.MeshBasicMaterial).opacity = alive * clamp01(touchAge / 0.05);
    }

    for (const smoke of this.smokes) {
      const st = touchAge - smoke.delay;
      smoke.sprite.visible = landed && st > 0;
      if (!smoke.sprite.visible) continue;
      const p = clamp01(st / 2.2);
      const r = smoke.radius + 3.5 * p;
      smoke.sprite.position.set(Math.cos(smoke.angle) * r, 1.0 + 2.5 * p, Math.sin(smoke.angle) * r);
      smoke.sprite.scale.setScalar(4.5 + 6.0 * p);
      const envelope = THREE.MathUtils.smoothstep(st, 0, 0.35) * (1 - THREE.MathUtils.smoothstep(p, 0.5, 1));
      smoke.material.opacity = 0.9 * envelope * alive;
      smoke.material.rotation = st * 0.25;
    }

    const pop = landed ? THREE.MathUtils.smoothstep(touchAge, 0, 0.15) : 0;
    this.craterMaterial.opacity = 0.85 * pop * alive;
    this.cracks.scale.setScalar(0.6 + 0.4 * THREE.MathUtils.smoothstep(touchAge, 0, 0.25));
    this.crackMaterial.opacity = 0.7 * pop * alive;
    const shockP = landed ? THREE.MathUtils.smoothstep(touchAge, 0, 0.6) : 0;
    this.shock.scale.setScalar(R * (0.4 + 1.0 * shockP));
    this.ringMaterial.uniforms.uTime.value = a;
    this.ringMaterial.uniforms.uOpacity.value = landed ? 0.8 * (1 - shockP) * alive : 0;
    this.burstMaterial.opacity = landed ? (1 - THREE.MathUtils.smoothstep(touchAge, 0, 0.45)) * alive : 0;
    this.burst.scale.setScalar(9 + 3 * shockP);

    if (this.light) {
      const lightY = a < BARRIER_RISE_END ? Math.max(0.9, head.y) : R * 0.5;
      this.light.light.position.set(this.origin.x, this.origin.y + lightY, this.origin.z);
      const flash = landed ? 2.4 * (1 - THREE.MathUtils.smoothstep(touchAge, 0, 0.45)) : 0;
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
    this.ringMaterial.dispose();
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
  private readonly smokeTextures: THREE.Texture[] = [];
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

    // Nuvens cartunescas pintadas (blobs com contorno e luz magenta por baixo).
    const cloudCount = high ? 5 : 3;
    for (let index = 0; index < cloudCount; index += 1) {
      const texture = createThunderSmokeCanvasTexture(index + 2);
      this.smokeTextures.push(texture);
      const material = new THREE.SpriteMaterial({
        map: texture, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
      });
      this.smokeMaterials.push(material);
      const sprite = new THREE.Sprite(material);
      const offset = (index - (cloudCount - 1) / 2) * 0.75;
      sprite.position.set(offset, 1.2 - 0.25 * Math.abs(index - (cloudCount - 1) / 2), index % 2 === 0 ? 0.25 : -0.25);
      sprite.name = 'ThunderSmokeCloud';
      this.smokes.push({ sprite, delay: index * 0.04, angle: offset, radius: 0, height: sprite.position.y });
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

    // Smoke: puffs pop out, grow, then dissolve.
    const smokeLive = 1 - THREE.MathUtils.smoothstep(impactAge, 0.9, 1.5);
    const glowGrow = THREE.MathUtils.smoothstep(impactAge, 0, 0.35);
    this.underglow.scale.setScalar(3.0 + 3.6 * glowGrow);
    this.underglowMaterial.opacity = 0.95 * smokeLive * glowGrow;
    this.smokes.forEach((smoke, index) => {
      const grow = THREE.MathUtils.smoothstep(impactAge, smoke.delay, 0.5 + smoke.delay);
      const size = 0.55 + 0.45 * grow;
      smoke.sprite.scale.set(6.0 * size, 3.4 * size, 1);
      smoke.sprite.position.y = smoke.height * 0.6 + 0.2 * grow;
      this.smokeMaterials[index].opacity = 0.98 * smokeLive * grow;
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
    this.sheathMaterial.dispose();
    this.burstMaterial.dispose();
    this.branchMaterial.dispose();
    this.arcMaterial.dispose();
    this.shockMaterial.dispose();
    for (const texture of this.smokeTextures) texture.dispose();
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
