import * as THREE from 'three';
import { MAGE_SPELL_TRAVEL_METERS } from '../combat/MageSpellFlight';
import { MAGE_VFX_LIMITS, mageQualityProfile } from './VFXConfig';
import { MageVFXResources } from './MageVFXResources';
import { PooledParticleCloud, qualityCount } from './ParticleManager';
import { VFXPool, type PoolableVFX } from './VFXPool';
import { VFXLightPool, type VFXLightHandle } from './VFXLightPool';
import type { MageCastContext, MageSpellPreset, MageVFXQuality } from './VFXTypes';
import { PrismPortalCharge } from './PrismPortalCharge';

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
  readonly onImpact?: (target: THREE.Object3D) => void;
  readonly onFinalImpact?: (position: THREE.Vector3, target: THREE.Object3D | null) => void;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const START = new THREE.Vector3();
const END = new THREE.Vector3();
const DIRECTION = new THREE.Vector3();
const MIDDLE = new THREE.Vector3();
const SIDE = new THREE.Vector3();
const DISCHARGE_COUNT = 10;

/** Faixas com comprimento unitário que ondulam em 3D ao longo do disparo.
 * Cada camada tem geometria própria: não há cilindro estático.
 */
const RIBBON_STEPS = 64;

function newRibbonGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array((RIBBON_STEPS + 1) * 2 * 3), 3
  ));
  const indices: number[] = [];
  for (let index = 0; index < RIBBON_STEPS; index += 1) {
    const a = index * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geometry.setIndex(indices);
  return geometry;
}

function animateRibbon(
  geometry: THREE.BufferGeometry,
  age: number,
  phase: number,
  waveAmplitude: number,
  ribbonWidth: number
): void {
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index <= RIBBON_STEPS; index += 1) {
    const t = index / RIBBON_STEPS;
    const envelope = Math.pow(Math.sin(Math.PI * t), 0.72);
    const angle = t * Math.PI * 5.2 - age * 18 + phase;
    const drift = Math.sin(angle) * waveAmplitude * envelope;
    const depth = Math.cos(angle * 0.94) * waveAmplitude * envelope * 0.6;
    // A fita aperta, alarga e cruza a sua gêmea durante o disparo.
    const width = ribbonWidth * (0.52 + 0.28 * Math.cos(t * Math.PI * 7 - age * 11 + phase));
    positions.setXYZ(index * 2, drift - width, t - 0.5, depth);
    positions.setXYZ(index * 2 + 1, drift + width, t - 0.5, depth);
  }
  positions.needsUpdate = true;
}

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

function energyMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function ring(radius: number, tube: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 56), energyMaterial(color));
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

  // Três fitas com ondulações DIFERENTES: campo azul, duas correntes ciano,
  // núcleo branco. Cada fita cruza o eixo do feixe ao longo do tempo.
  private readonly outer = new THREE.Mesh(newRibbonGeometry(), energyMaterial(0x1457ff));
  private readonly body = new THREE.Mesh(newRibbonGeometry(), energyMaterial(0x43ccff));
  private readonly core = new THREE.Mesh(newRibbonGeometry(), energyMaterial(0xf1ffff));
  private readonly portal = ring(0.94, 0.055, 0x347bff);
  private readonly portalInner = ring(0.68, 0.018, 0x9aefff);
  private readonly echoes = [
    ring(0.42, 0.017, 0x84dcff),
    ring(0.31, 0.012, 0x6b9fff),
    ring(0.22, 0.009, 0xc1faff),
  ];

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
  private impactSent = false;

  public constructor(
    resources: MageVFXResources,
    private readonly quality: MageVFXQuality,
    private readonly lightPool: VFXLightPool
  ) {
    this.group.name = 'MagePrismaticBeamVFX';
    this.group.visible = false;
    this.outer.name = 'MagePrismBlueHalo';
    this.body.name = 'MagePrismCyanBeam';
    this.core.name = 'MagePrismWhiteCore';
    this.outer.frustumCulled = false;
    this.body.frustumCulled = false;
    this.core.frustumCulled = false;
    // O portal pertence APENAS à antecipação da magia, não fica sobre o feixe.
    this.portal.visible = false;
    this.portalInner.visible = false;
    this.portal.name = 'MagePrismSourcePortal';
    this.portalInner.name = 'MagePrismSourceInnerRing';
    this.impactStar.name = 'MagePrismImpactStar';
    this.impactStar.frustumCulled = false;

    this.sourceAura = new THREE.Sprite(glowMaterial(resources.softGlow, 0x2462ff));
    this.sourceCore = new THREE.Sprite(glowMaterial(resources.softGlow, 0xe4ffff));
    this.impactAura = new THREE.Sprite(glowMaterial(resources.softGlow, 0x2864ff));
    this.impactCore = new THREE.Sprite(glowMaterial(resources.softGlow, 0xf2ffff));
    this.sourceAura.name = 'MagePrismSourceBlueBloom';
    this.impactCore.name = 'MagePrismImpactWhiteFlash';

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
    this.sparks = new PooledParticleCloud(40, resources.softGlow);

    this.group.add(
      this.outer, this.body, this.core,
      this.portal, this.portalInner, ...this.echoes,
      this.sourceAura, this.sourceCore, this.impactAura, this.impactCore,
      this.impactStar, this.discharge, this.sparks.points
    );
  }

  public play(options: LaserOptions): void {
    this.preset = options.preset;
    this.startAnchor = options.startAnchor;
    this.startProvider = options.startProvider;
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
    this.impactSent = false;
    this.finalSent = false;
    this.group.visible = true;
    this.sparks.reset();

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

    (this.outer.material as THREE.MeshBasicMaterial).opacity = 0.34 * glow * pulse;
    (this.body.material as THREE.MeshBasicMaterial).opacity = 0.82 * glow * pulse;
    (this.core.material as THREE.MeshBasicMaterial).opacity = 0.97 * glow;
    (this.portal.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.portalInner.material as THREE.MeshBasicMaterial).opacity = 0;

    // Os três círculos de eco acompanham só os primeiros instantes da descarga.
    const earlyRings = 1 - THREE.MathUtils.smoothstep(this.age, 0.16, 0.62);
    for (let index = 0; index < this.echoes.length; index += 1) {
      const echo = this.echoes[index];
      (echo.material as THREE.MeshBasicMaterial).opacity = (0.53 - index * 0.10) * glow * earlyRings;
      echo.scale.setScalar(0.80 + 0.15 * Math.sin(this.age * 24 - index * 1.2));
    }
    (this.sourceAura.material as THREE.SpriteMaterial).opacity = 0.66 * glow;
    (this.sourceCore.material as THREE.SpriteMaterial).opacity = 0.96 * glow;
    (this.impactAura.material as THREE.SpriteMaterial).opacity = 0.82 * glow;
    (this.impactCore.material as THREE.SpriteMaterial).opacity = 0.95 * glow;
    (this.impactStar.material as THREE.LineBasicMaterial).opacity = 0.83 * glow;
    this.impactStar.rotation.z += elapsed * 1.3;
    (this.discharge.material as THREE.LineBasicMaterial).opacity =
      0.48 * glow * (0.72 + 0.28 * Math.sin(this.age * 46));

    if (this.lightHandle) this.lightHandle.light.intensity = 1.1 * glow;
    this.sparks.update(elapsed);

    if (!this.impactSent && this.target && (!this.isTargetAlive || this.isTargetAlive(this.target))) {
      this.impactSent = true;
      this.onImpact?.(this.target);
    }
    if (glow > 0.15 && this.impactCooldown <= 0) {
      this.impactCooldown = this.preset.laser?.impactPulseInterval ?? 0.07;
      this.sparks.emit(END, {
        color: 0xc6f7ff,
        count: qualityCount(9, this.quality, this.preset.qualityParticleMultiplier),
        speed: 2.2,
        spread: 0.55,
        lifetime: 0.18,
        upwardBias: 0.15,
        size: [0.6, 1.8],
      });
    }

    if (this.age >= this.duration && !this.finalSent) {
      this.finalSent = true;
      this.onFinalImpact?.(END.clone(), this.target);
      // O feixe apaga primeiro, as faíscas são as últimas a desaparecer.
      for (let index = 0; index < 10; index += 1) {
        const along = START.clone().lerp(END, index / 9);
        this.sparks.emit(along, {
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

    if (this.target && this.isTargetAlive && !this.isTargetAlive(this.target)) this.target = null;
    if (this.target) enemyAimPoint(this.target, END);
    else END.copy(START).addScaledVector(this.fallbackDirection, MAGE_SPELL_TRAVEL_METERS);

    const blocker = this.queryBodyHit?.(START, END, this.preset.projectile.radius);
    if (blocker) {
      this.target = blocker;
      enemyAimPoint(blocker, END);
    }

    DIRECTION.subVectors(END, START);
    const length = Math.max(0.01, DIRECTION.length());
    DIRECTION.normalize();
    MIDDLE.copy(START).addScaledVector(DIRECTION, length * 0.5);

    const profile = mageQualityProfile(this.quality);
    const outerWidth = (this.preset.laser?.outerWidth ?? 0.64) * profile.laserLayerMultiplier;
    const bodyWidth = (this.preset.laser?.bodyWidth ?? 0.3) * profile.laserLayerMultiplier;
    const coreWidth = this.preset.laser?.coreWidth ?? 0.085;
    animateRibbon(this.outer.geometry, this.age, 0, 0.75, 0.57);
    animateRibbon(this.body.geometry, this.age, Math.PI * 0.95, 0.82, 0.53);
    // Filamento interno: ondulação quase imperceptível, branco e concentrado.
    animateRibbon(this.core.geometry, this.age, Math.PI * 0.35, 0.07, 0.78);
    this.placeBeam(this.outer, length, outerWidth * (0.96 + intensity * 0.1));
    this.placeBeam(this.body, length, bodyWidth);
    this.placeBeam(this.core, length, coreWidth);

    const directionRotation = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, DIRECTION);
    this.portal.position.copy(START);
    this.portalInner.position.copy(START);
    this.portal.quaternion.copy(directionRotation);
    this.portalInner.quaternion.copy(directionRotation);

    for (let index = 0; index < this.echoes.length; index += 1) {
      const echo = this.echoes[index];
      echo.position.copy(START).addScaledVector(DIRECTION, Math.min(length * 0.72, 0.95 + index * 0.75));
      echo.quaternion.copy(directionRotation);
    }

    this.sourceAura.position.copy(START);
    this.sourceAura.scale.setScalar(3.25 + intensity * 0.25);
    this.sourceCore.position.copy(START);
    this.sourceCore.scale.setScalar(0.62 + intensity * 0.22);
    this.impactAura.position.copy(END);
    this.impactAura.scale.setScalar(2.15 + intensity * 0.8);
    this.impactCore.position.copy(END);
    this.impactCore.scale.setScalar(0.62 + intensity * 0.3);
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

  private placeBeam(mesh: THREE.Mesh, length: number, width: number): void {
    mesh.position.copy(MIDDLE);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, DIRECTION);
    mesh.scale.set(width, length, width);
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.finalSent = false;
    this.preset = null;
    this.target = null;
    this.startAnchor = null;
    this.startProvider = undefined;
    this.isTargetAlive = undefined;
    this.queryBodyHit = undefined;
    this.onImpact = undefined;
    this.onFinalImpact = undefined;
    this.sparks.reset();
    this.lightHandle?.release();
    this.lightHandle = null;
    for (const mesh of [this.outer, this.body, this.core, this.portal, this.portalInner, ...this.echoes]) {
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    for (const sprite of [this.sourceAura, this.sourceCore, this.impactAura, this.impactCore]) {
      (sprite.material as THREE.SpriteMaterial).opacity = 0;
    }
    (this.discharge.material as THREE.LineBasicMaterial).opacity = 0;
    (this.impactStar.material as THREE.LineBasicMaterial).opacity = 0;
  }

  public dispose(): void {
    this.reset();
    for (const mesh of [this.outer, this.body, this.core, this.portal, this.portalInner, ...this.echoes]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    for (const sprite of [this.sourceAura, this.sourceCore, this.impactAura, this.impactCore]) {
      (sprite.material as THREE.Material).dispose();
    }
    this.discharge.geometry.dispose();
    (this.discharge.material as THREE.Material).dispose();
    this.impactStar.geometry.dispose();
    (this.impactStar.material as THREE.Material).dispose();
    this.sparks.dispose();
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
      if (options.target) options.onImpact?.(options.target);
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
