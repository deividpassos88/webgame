import * as THREE from 'three';
import { MAGE_SPELL_TRAVEL_METERS } from '../combat/MageSpellFlight';
import { MAGE_VFX_LIMITS, mageQualityProfile } from './VFXConfig';
import { MageVFXResources } from './MageVFXResources';
import { PooledParticleCloud, qualityCount } from './ParticleManager';
import { VFXPool, type PoolableVFX } from './VFXPool';
import { VFXLightPool, type VFXLightHandle } from './VFXLightPool';
import type { MageCastContext, MageSpellPreset, MageVFXQuality } from './VFXTypes';
import { PrismPortalCharge } from './PrismPortalCharge';
import { PrismaticLaserField } from './PrismaticLaserField';

/**
 * Raio Prismático: efeito exclusivo da skill 4 da Maga.
 *
 * Referência: feixe azul-ciano com núcleo branco, afunilado ao longo do voo,
 * portal circular na saída, três anéis de propagação, filamento elétrico e
 * clarão em estrela na ponta. Não reutiliza efeitos nem shaders do Guerreiro.
 * A lógica de colisão/dano continua na pipeline normal da MageVFX.
 */
interface LaserOptions {
  readonly startAnchor: THREE.Object3D | null;
  readonly startProvider?: (output: THREE.Vector3) => THREE.Vector3;
  readonly fallbackStart: THREE.Vector3;
  readonly target: THREE.Object3D | null;
  readonly fallbackDirection: THREE.Vector3;
  readonly preset: MageSpellPreset;
  readonly isTargetAlive?: (target: THREE.Object3D) => boolean;
  readonly queryBodyHit?: (
    from: THREE.Vector3,
    to: THREE.Vector3,
    spellRadius: number
  ) => THREE.Object3D | null;
  readonly onImpact?: (target: THREE.Object3D, damageFraction: number) => void;
  readonly onFinalImpact?: (position: THREE.Vector3, target: THREE.Object3D | null) => void;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const START = new THREE.Vector3();
const END = new THREE.Vector3();
const DIRECTION = new THREE.Vector3();
const SIDE = new THREE.Vector3();
const DISCHARGE_COUNT = 10;

function glowMaterial(texture: THREE.Texture, color: number): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function starGeometry(): THREE.BufferGeometry {
  const points: number[] = [];
  for (let ray = 0; ray < 8; ray += 1) {
    const theta = ray * Math.PI / 4;
    const radius = ray % 2 === 0 ? 1.0 : 0.48;
    points.push(0, 0, 0, Math.cos(theta) * radius, Math.sin(theta) * radius, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

function enemyAimPoint(target: THREE.Object3D, output: THREE.Vector3): THREE.Vector3 {
  target.getWorldPosition(output);
  output.y += 0.95 * (Number(target.userData?.enemyBodyScale) || 1);
  return output;
}

class PrismBeam implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();

  // Shader volumétrico 3D + filamentos tubulares, inspirado no pipeline da skill 2.
  private readonly field = new PrismaticLaserField();
  private readonly sourceAura: THREE.Sprite;
  private readonly sourceCore: THREE.Sprite;
  private readonly impactAura: THREE.Sprite;
  private readonly impactCore: THREE.Sprite;
  private readonly impactStar = new THREE.LineSegments(
    starGeometry(),
    new THREE.LineBasicMaterial({
      color: 0xd8faff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  private readonly dischargePositions = new Float32Array(DISCHARGE_COUNT * 3);
  private readonly dischargeAttribute = new THREE.BufferAttribute(this.dischargePositions, 3);
  private readonly discharge: THREE.Line;
  private readonly sparks: PooledParticleCloud;
  private readonly beamMotes: PooledParticleCloud;
  private readonly impactHaze: PooledParticleCloud;
  private readonly impactFlare: THREE.Sprite;
  private readonly impactShards: THREE.InstancedMesh;
  private readonly shardMatrix = new THREE.Matrix4();
  private readonly shardPosition = new THREE.Vector3();
  private readonly shardScale = new THREE.Vector3();
  private readonly shardRotation = new THREE.Quaternion();
  private lastPulseAge = -1;
  /** Primeiro corpo atingido fica travado até terminar o disparo. */
  private readonly lastImpactPoint = new THREE.Vector3();
  private lockedTarget: THREE.Object3D | null = null;
  private ticksDelivered = 0;
  private nextDamageTick = 0.08;
  private static readonly DAMAGE_TICKS = 8;
  private static readonly DAMAGE_INTERVAL = 0.235;

  private lightHandle: VFXLightHandle | null = null;
  private age = 0;
  private duration = 2.0;
  private finalSent = false;
  private impactCooldown = 0;
  private target: THREE.Object3D | null = null;
  private preset: MageSpellPreset | null = null;
  private startAnchor: THREE.Object3D | null = null;
  private startProvider: LaserOptions['startProvider'];
  private readonly fallbackStart = new THREE.Vector3();
  private readonly fallbackDirection = new THREE.Vector3(0, 0, 1);
  private isTargetAlive: LaserOptions['isTargetAlive'];
  private queryBodyHit: LaserOptions['queryBodyHit'];
  private onImpact: LaserOptions['onImpact'];
  private onFinalImpact: LaserOptions['onFinalImpact'];
  // Oito pulsos iguais substituem o impacto único do laser.

  public constructor(
    resources: MageVFXResources,
    private readonly quality: MageVFXQuality,
    private readonly lightPool: VFXLightPool
  ) {
    this.group.name = 'MagePrismaticBeamVFX';
    this.group.visible = false;
    this.impactStar.name = 'MagePrismImpactStar';
    this.impactStar.frustumCulled = false;

    this.sourceAura = new THREE.Sprite(glowMaterial(resources.softGlow, 0x2462ff));
    this.sourceCore = new THREE.Sprite(glowMaterial(resources.softGlow, 0xe4ffff));
    this.impactAura = new THREE.Sprite(glowMaterial(resources.softGlow, 0x2864ff));
    this.impactCore = new THREE.Sprite(glowMaterial(resources.softGlow, 0xf2ffff));
    this.sourceAura.name = 'MagePrismSourceBlueBloom';
    this.impactCore.name = 'MagePrismImpactWhiteFlash';
    // Glow orgânico e compacto, sem textura de estrela artificial na ponta.
    this.impactFlare = new THREE.Sprite(glowMaterial(resources.softGlow, 0x6dd9ff));
    this.impactFlare.name = 'MagePrismImpactTexturedBurst';
    const shardMat = new THREE.MeshBasicMaterial({
      color: 0x65d6ff, transparent: true, opacity: 0,
      depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.impactShards = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), shardMat, 22);
    this.impactShards.name = 'MagePrismImpactShards';
    this.impactShards.count = 22;
    this.impactShards.frustumCulled = false;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', this.dischargeAttribute);
    this.discharge = new THREE.Line(geometry, new THREE.LineBasicMaterial({
      color: 0x9fedff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.discharge.name = 'MagePrismEnergyFilament';
    this.discharge.frustumCulled = false;
    // Três nuvens independentes. "emit" descartava o quadro anterior e parecia
    // uma chuva de pixels; "add" cria continuidade como na onda de cristais.
    this.sparks = new PooledParticleCloud(120, resources.impactFlare);
    this.beamMotes = new PooledParticleCloud(94, resources.softGlow);
    this.impactHaze = new PooledParticleCloud(44, resources.softGlow, { blending: 'normal' });

    // Somente o corpo volumétrico nasce do cajado. Não sobrepor um orbe na
    // mão ou uma estrela rígida na extremidade: ambos cortavam o feixe.
    this.group.add(
      this.field.group,
      this.impactFlare, this.impactShards,
      this.sparks.points, this.beamMotes.points, this.impactHaze.points
    );
  }

  public play(options: LaserOptions): void {
    this.preset = options.preset;
    // Não mover a origem do feixe com a personagem após o lançamento.
    this.startAnchor = null;
    this.startProvider = undefined;
    this.target = options.target;
    this.fallbackStart.copy(options.fallbackStart);
    this.fallbackDirection.copy(options.fallbackDirection);
    if (this.fallbackDirection.lengthSq() < 1e-8) this.fallbackDirection.set(0, 0, 1);
    this.fallbackDirection.normalize();
    this.isTargetAlive = options.isTargetAlive;
    this.queryBodyHit = options.queryBodyHit;
    this.onImpact = options.onImpact;
    this.onFinalImpact = options.onFinalImpact;
    this.duration = Math.max(0.05, options.preset.laser?.duration ?? 2.0);
    this.age = 0;
    this.impactCooldown = 0;
    this.lockedTarget = null;
    this.ticksDelivered = 0;
    this.nextDamageTick = 0.08;
    this.lastImpactPoint.copy(this.fallbackStart);
    this.finalSent = false;
    this.group.visible = true;
    this.sparks.reset();
    this.beamMotes.reset();
    this.impactHaze.reset();
    this.lastPulseAge = -1;

    this.lightHandle = mageQualityProfile(this.quality).enableSecondaryLights
      ? this.lightPool.acquire() : null;
    if (this.lightHandle) {
      this.lightHandle.light.color.set(0x4f99ff);
      this.lightHandle.light.distance = 6;
    }
    this.updateTransform(0);
  }

  public update(delta: number): boolean {
    if (!this.preset) return false;
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    this.impactCooldown = Math.max(0, this.impactCooldown - elapsed);

    const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
    const fadeIn = THREE.MathUtils.smoothstep(progress, 0, 0.12);
    const fadeOut = 1 - THREE.MathUtils.smoothstep(progress, 0.84, 1);
    const glow = fadeIn * fadeOut;
    const pulse = 0.94 + 0.06 * Math.sin(this.age * 37);
    this.updateTransform(glow);

    (this.sourceAura.material as THREE.SpriteMaterial).opacity = 0;
    (this.sourceCore.material as THREE.SpriteMaterial).opacity = 0;
    const hitPulse = this.lastPulseAge < 0 ? 0 : Math.exp(-(this.age - this.lastPulseAge) * 14);
    const hitGlow = this.lockedTarget ? 1 : 0;
    (this.impactAura.material as THREE.SpriteMaterial).opacity = 0;
    (this.impactCore.material as THREE.SpriteMaterial).opacity = 0;
    (this.impactFlare.material as THREE.SpriteMaterial).opacity = (0.12 + 0.34 * hitPulse) * glow * hitGlow;
    (this.impactStar.material as THREE.LineBasicMaterial).opacity = 0;
    (this.impactShards.material as THREE.MeshBasicMaterial).opacity = (0.24 + 0.5 * hitPulse) * glow * hitGlow;
    this.updateImpactShards(hitPulse, glow);
    (this.discharge.material as THREE.LineBasicMaterial).opacity =
      0.48 * glow * (0.72 + 0.28 * Math.sin(this.age * 46));

    if (this.lightHandle) this.lightHandle.light.intensity = 1.1 * glow;
    this.sparks.update(elapsed);
    this.beamMotes.update(elapsed);
    this.impactHaze.update(elapsed);

    // Os hit ticks têm 0,235 s de intervalo: reagem no corpo do inimigo.
    // O dano total do cast fica em 8/8, não oito vezes o dano anterior.
    while (this.age >= this.nextDamageTick
      && this.ticksDelivered < PrismBeam.DAMAGE_TICKS
      && this.lockedTarget
      && (!this.isTargetAlive || this.isTargetAlive(this.lockedTarget))) {
      this.onImpact?.(this.lockedTarget, 1 / PrismBeam.DAMAGE_TICKS);
      this.lastPulseAge = this.age;
      this.sparks.add(END, {
        color: 0xd2fbff, count: qualityCount(15, this.quality, this.preset.qualityParticleMultiplier),
        speed: 3.7, spread: 1.15, lifetime: 0.37, upwardBias: 0.2,
        size: [1.0, 3.6], growth: -0.68, opacity: 0.85,
      });
      this.ticksDelivered += 1;
      this.nextDamageTick += PrismBeam.DAMAGE_INTERVAL;
    }
    if (glow > 0.08 && this.impactCooldown <= 0) {
      this.impactCooldown = Math.max(0.085, this.preset.laser?.impactPulseInterval ?? 0.09);
      const motesPoint = START.clone().lerp(END, 0.12 + Math.random() * 0.75);
      this.beamMotes.add(motesPoint, {
        color: 0x8addff, count: qualityCount(6, this.quality, this.preset.qualityParticleMultiplier),
        speed: 0.7, spread: 0.32, lifetime: 0.28, upwardBias: 0.04,
        size: [0.6, 1.7], growth: -0.82, opacity: 0.58,
      });
      if (this.lockedTarget) {
        this.sparks.add(END, {
          color: 0xbbefff, count: qualityCount(6, this.quality, this.preset.qualityParticleMultiplier),
          speed: 2.9, spread: 0.85, lifetime: 0.34, upwardBias: 0.32,
          size: [0.9, 2.4], growth: -0.75, opacity: 0.74,
        });
        this.impactHaze.add(END, {
          color: 0x6ba4ef, count: 2, speed: 0.48, spread: 0.45,
          lifetime: 0.52, upwardBias: 0.13, size: [2.0, 3.8],
          opacity: 0.1, growth: 0.6,
        });
      }
    }

    if (this.age >= this.duration && !this.finalSent) {
      this.finalSent = true;
      this.onFinalImpact?.(END.clone(), this.target);
      // O feixe apaga primeiro, as faíscas são as últimas a desaparecer.
      for (let index = 0; index < 10; index += 1) {
        const along = START.clone().lerp(END, index / 9);
        this.sparks.add(along, {
          color: 0x4c9cff, count: 3, speed: 0.42, spread: 0.26,
          lifetime: 0.48, upwardBias: 0.12, size: [0.45, 1.3],
        });
      }
    }
    return this.age < this.duration + 0.58;
  }

  private updateTransform(intensity: number): void {
    if (!this.preset) return;
    if (this.startProvider) this.startProvider(START);
    else if (this.startAnchor) this.startAnchor.getWorldPosition(START);
    else START.copy(this.fallbackStart);
    START.y += 0.08;

    if (this.lockedTarget) {
      // Preserva o primeiro alvo; após morte conserva o último ponto de acerto.
      if (!this.isTargetAlive || this.isTargetAlive(this.lockedTarget)) {
        enemyAimPoint(this.lockedTarget, END);
        this.lastImpactPoint.copy(END);
      } else {
        END.copy(this.lastImpactPoint);
      }
    } else {
      if (this.target && this.isTargetAlive && !this.isTargetAlive(this.target)) this.target = null;
      if (this.target) enemyAimPoint(this.target, END);
      else END.copy(START).addScaledVector(this.fallbackDirection, MAGE_SPELL_TRAVEL_METERS);
      const blocker = this.queryBodyHit?.(START, END, this.preset.projectile.radius);
      if (blocker) {
        this.target = blocker;
        enemyAimPoint(blocker, END);
      }
      if (this.target) {
        this.lockedTarget = this.target;
        this.lastImpactPoint.copy(END);
      }
    }

    DIRECTION.subVectors(END, START);
    const length = Math.max(0.01, DIRECTION.length());
    DIRECTION.normalize();
    const profile = mageQualityProfile(this.quality);
    this.field.update(START, END, this.age, intensity, profile.laserLayerMultiplier);
    const directionRotation = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, DIRECTION);
    this.sourceAura.position.copy(START);
    this.sourceAura.scale.setScalar(0.18);
    this.sourceCore.position.copy(START);
    this.sourceCore.scale.setScalar(0.12);
    this.impactAura.position.copy(END);
    this.impactAura.scale.setScalar(1.95 + intensity * 0.7);
    this.impactCore.position.copy(END);
    this.impactCore.scale.setScalar(0.45 + intensity * 0.27);
    this.impactFlare.position.copy(END);
    this.impactFlare.scale.setScalar(0.52 + intensity * 0.35);
    this.impactStar.position.copy(END);
    this.impactStar.quaternion.copy(directionRotation);
    this.impactStar.scale.setScalar(0.65 + intensity * 0.3);

    SIDE.crossVectors(DIRECTION, Y_AXIS);
    if (SIDE.lengthSq() < 1e-6) SIDE.set(1, 0, 0);
    SIDE.normalize();
    for (let index = 0; index < DISCHARGE_COUNT; index += 1) {
      const t = index / (DISCHARGE_COUNT - 1);
      const offset = index * 3;
      const jitter = Math.sin(index * 2.7 + this.age * 51) * 0.09 * (1 - t);
      this.dischargePositions[offset] = START.x + DIRECTION.x * length * t + SIDE.x * jitter;
      this.dischargePositions[offset + 1] = START.y + DIRECTION.y * length * t + Math.sin(index * 1.5 + this.age * 38) * 0.05;
      this.dischargePositions[offset + 2] = START.z + DIRECTION.z * length * t + SIDE.z * jitter;
    }
    this.dischargeAttribute.needsUpdate = true;
    if (this.lightHandle) this.lightHandle.light.position.copy(END);
  }

  /** Fragmentos 3D compactos pulsando na pele do alvo, com uma draw call. */
  private updateImpactShards(pulse: number, fade: number): void {
    const count = this.impactShards.count;
    const burstRadius = 0.16 + 0.27 * pulse;
    for (let i = 0; i < count; i++) {
      const theta = i * 2.399963 + this.age * (i % 2 === 0 ? 1.4 : -1.1);
      const elevation = Math.sin(i * 7.3) * 0.37;
      const radius = burstRadius * (0.58 + (i % 5) * 0.13);
      this.shardPosition.copy(END).add(new THREE.Vector3(
        Math.cos(theta) * radius, elevation, Math.sin(theta) * radius
      ));
      this.shardRotation.setFromAxisAngle(Y_AXIS, theta);
      const size = (0.012 + pulse * 0.047) * fade;
      this.shardScale.set(size * 0.7, size * (2.1 + i % 4), size * 0.65);
      this.shardMatrix.compose(this.shardPosition, this.shardRotation, this.shardScale);
      this.impactShards.setMatrixAt(i, this.shardMatrix);
    }
    this.impactShards.instanceMatrix.needsUpdate = true;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.finalSent = false;
    this.preset = null;
    this.target = null;
    this.lockedTarget = null;
    this.ticksDelivered = 0;
    this.nextDamageTick = 0.08;
    this.startAnchor = null;
    this.startProvider = undefined;
    this.isTargetAlive = undefined;
    this.queryBodyHit = undefined;
    this.onImpact = undefined;
    this.onFinalImpact = undefined;
    this.sparks.reset();
    this.beamMotes.reset();
    this.impactHaze.reset();
    this.field.reset();
    this.lastPulseAge = -1;
    this.lightHandle?.release();
    this.lightHandle = null;
    for (const sprite of [this.sourceAura, this.sourceCore, this.impactAura, this.impactCore]) {
      (sprite.material as THREE.SpriteMaterial).opacity = 0;
    }
    (this.discharge.material as THREE.LineBasicMaterial).opacity = 0;
    (this.impactStar.material as THREE.LineBasicMaterial).opacity = 0;
    (this.impactFlare.material as THREE.SpriteMaterial).opacity = 0;
  }

  public dispose(): void {
    this.reset();
    this.field.dispose();
    this.impactShards.geometry.dispose();
    (this.impactShards.material as THREE.Material).dispose();
    (this.impactFlare.material as THREE.Material).dispose();
    for (const sprite of [this.sourceAura, this.sourceCore, this.impactAura, this.impactCore]) {
      (sprite.material as THREE.Material).dispose();
    }
    this.discharge.geometry.dispose();
    (this.discharge.material as THREE.Material).dispose();
    this.impactStar.geometry.dispose();
    (this.impactStar.material as THREE.Material).dispose();
    this.sparks.dispose();
    this.beamMotes.dispose();
    this.impactHaze.dispose();
  }
}

/** Pool reutilizável: não aloca cenas nem buffers a cada conjuração. */
export class LaserVFX {
  private readonly pool: VFXPool<PrismBeam>;
  private readonly active: PrismBeam[] = [];
  private readonly portalPool: VFXPool<PrismPortalCharge>;
  private readonly charging = new Map<MageCastContext, PrismPortalCharge>();

  public constructor(
    private readonly scene: THREE.Scene,
    resources: MageVFXResources,
    quality: MageVFXQuality,
    lightPool: VFXLightPool
  ) {
    this.pool = new VFXPool(() => new PrismBeam(resources, quality, lightPool), MAGE_VFX_LIMITS.maxLasers);
    this.portalPool = new VFXPool(() => new PrismPortalCharge(resources), MAGE_VFX_LIMITS.maxLasers);
  }

  /** O portal nasce no intervalo de carga ANTES da animação soltar o feixe. */
  public beginCharge(
    context: MageCastContext,
    provider: (out: THREE.Vector3) => THREE.Vector3
  ): void {
    this.endCharge(context);
    const portal = this.portalPool.acquire();
    if (!portal) return;
    portal.play(provider, context.fallbackDirection);
    this.scene.add(portal.group);
    this.charging.set(context, portal);
  }

  public endCharge(context: MageCastContext): void {
    const portal = this.charging.get(context);
    if (!portal) return;
    this.charging.delete(context);
    this.portalPool.release(portal);
  }

  public fire(options: LaserOptions): boolean {
    const beam = this.pool.acquire();
    if (!beam) {
      if (options.target) options.onImpact?.(options.target, 1);
      options.onFinalImpact?.(options.fallbackStart.clone().addScaledVector(options.fallbackDirection, 8), options.target);
      return false;
    }
    beam.play(options);
    this.scene.add(beam.group);
    this.active.push(beam);
    return true;
  }

  public update(delta: number): void {
    for (const charge of this.charging.values()) charge.update(delta);
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const beam = this.active[index];
      if (beam.update(delta)) continue;
      this.pool.release(beam);
      this.active.splice(index, 1);
    }
  }

  public clear(): void {
    for (const portal of this.charging.values()) this.portalPool.release(portal);
    this.charging.clear();
    for (const beam of this.active) this.pool.release(beam);
    this.active.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.pool.dispose();
    this.portalPool.dispose();
  }

  public get activeCount(): number { return this.active.length; }
  public get pooledCount(): number { return this.pool.inactiveCount; }
}
