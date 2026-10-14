import * as THREE from 'three';
import { MAGE_SPELL_TRAVEL_METERS } from '../combat/MageSpellFlight';
import { MAGE_VFX_LIMITS, mageQualityProfile } from './VFXConfig';
import { createImpactRingTexture } from './ImpactRingTexture';
import { MageVFXResources } from './MageVFXResources';
import { PooledParticleCloud, qualityCount } from './ParticleManager';
import { VFXLightPool, type VFXLightHandle } from './VFXLightPool';
import { VFXPool, type PoolableVFX } from './VFXPool';
import {
  configureEnergyMaterial,
  createBeamMaterial,
  setEnergyTime,
  type EnergyShaderMaterial,
} from './VFXMaterials';
import type { MageSpellPreset, MageVFXQuality } from './VFXTypes';

/**
 * Laser Rajante — skill 4 ("Golpe Flamejante") da Maga. Efeito PREMIUM e
 * EXCLUSIVO desta skill: nenhuma outra magia usa este módulo.
 *
 * Recriado a partir das referências do usuário, quadro a quadro:
 *
 * 1. CAST: chamas magenta/roxeas envolvendo a Maga, orbe do cajado brilhando
 *    com anel roxo em volta e faíscas pingando.
 * 2. FEIXE: cinco camadas concêntricas — núcleo BRANCO-quente, corpo
 *    CARMESIM, halo MAGENTA — com flicker de energia instável.
 * 3. RAIOS: três raios elétricos grossos (magenta, roxo e rosa-quente)
 *    serpenteando o feixe, refeitos a cada quadro (zigue-zague vivo).
 * 4. FAGULHAS: fluxo denso de partículas rosas/brancas ao longo do trajeto +
 *    leques quentes em rajada no impacto (algumas caem como brasas) + pingo
 *    contínuo na origem.
 * 5. IMPACTO: explosão BRANCA grande pulsante, halo rosa, anel de choque
 *    expandindo e duas luzes (origem magenta, impacto branco-quente).
 * 6. RESÍDUO: dois raios roxos rastejando em volta do alvo por ~1 s após o
 *    feixe, com o halo e as brasas ainda caindo.
 */

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const TMP_START = new THREE.Vector3();
const TMP_END = new THREE.Vector3();
const TMP_DIR = new THREE.Vector3();
const TMP_MID = new THREE.Vector3();
const TMP_SIDE = new THREE.Vector3();
const TMP_UP = new THREE.Vector3();

/** Segmentos de cada raio (quanto maior, mais fino o zigue-zague). */
const BOLT_SEGMENTS = 12;
const AFTERMATH_SEGMENTS = 8;
/** Segundos do resíduo elétrico depois que o feixe apaga. */
const AFTERMATH_SECONDS = 1.0;

function targetPoint(target: THREE.Object3D, output: THREE.Vector3): THREE.Vector3 {
  target.getWorldPosition(output);
  const bodyScale = Number(target.userData?.enemyBodyScale) || 1;
  output.y += 0.95 * bodyScale;
  return output;
}

let sharedImpactRingTexture: THREE.DataTexture | null = null;
function impactRingTexture(): THREE.DataTexture {
  sharedImpactRingTexture ??= createImpactRingTexture();
  return sharedImpactRingTexture;
}

/** Um raio elétrico: N cilindros curtos (núcleo + halo) sobre um polígono vivo. */
class LightningBolt {
  public readonly group = new THREE.Group();
  private readonly coreSegments: THREE.Mesh[] = [];
  private readonly glowSegments: THREE.Mesh[] = [];
  private readonly coreMaterial: THREE.MeshBasicMaterial;
  private readonly glowMaterial: THREE.MeshBasicMaterial;
  private readonly points: THREE.Vector3[] = [];

  public constructor(
    geometry: THREE.CylinderGeometry,
    coreColor: THREE.ColorRepresentation,
    glowColor: THREE.ColorRepresentation,
    coreWidth: number,
    glowWidth: number
  ) {
    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: coreColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    for (let index = 0; index <= BOLT_SEGMENTS; index += 1) {
      this.points.push(new THREE.Vector3());
    }
    for (let index = 0; index < BOLT_SEGMENTS; index += 1) {
      const core = new THREE.Mesh(geometry, this.coreMaterial);
      core.frustumCulled = false;
      core.renderOrder = 9;
      this.coreSegments.push(core);
      this.group.add(core);
      const glow = new THREE.Mesh(geometry, this.glowMaterial);
      glow.frustumCulled = false;
      glow.renderOrder = 8;
      this.glowSegments.push(glow);
      this.group.add(glow);
      core.userData.glowWidth = glowWidth;
      core.userData.coreWidth = coreWidth;
    }
    this.group.visible = false;
    this.group.name = 'RadiantLaserLightningBolt';
  }

  /** Repassa o polígono vivo entre `start` e `end` para os segmentos. */
  public update(
    start: THREE.Vector3,
    end: THREE.Vector3,
    time: number,
    seed: number,
    amplitude: number,
    coreOpacity: number,
    glowOpacity: number
  ): void {
    TMP_DIR.subVectors(end, start);
    const length = Math.max(0.01, TMP_DIR.length());
    TMP_DIR.normalize();
    TMP_SIDE.crossVectors(TMP_DIR, Y_AXIS);
    if (TMP_SIDE.lengthSq() <= 1e-8) TMP_SIDE.set(1, 0, 0);
    TMP_SIDE.normalize();
    TMP_UP.crossVectors(TMP_DIR, TMP_SIDE).normalize();

    for (let index = 0; index <= BOLT_SEGMENTS; index += 1) {
      const t = index / BOLT_SEGMENTS;
      const point = this.points[index];
      point.copy(start).addScaledVector(TMP_DIR, length * t);
      if (index > 0 && index < BOLT_SEGMENTS) {
        const envelope = 0.35 + Math.sin(t * Math.PI) * 0.65;
        const wobbleA = Math.sin(time * 37 + index * 2.7 + seed) * 0.62
          + (Math.random() - 0.5) * 0.95;
        const wobbleB = Math.cos(time * 29 + index * 1.9 + seed * 1.31) * 0.62
          + (Math.random() - 0.5) * 0.95;
        point.addScaledVector(TMP_SIDE, wobbleA * amplitude * envelope);
        point.addScaledVector(TMP_UP, wobbleB * amplitude * envelope);
      }
    }

    for (let index = 0; index < BOLT_SEGMENTS; index += 1) {
      const a = this.points[index];
      const b = this.points[index + 1];
      TMP_MID.addVectors(a, b).multiplyScalar(0.5);
      TMP_DIR.subVectors(b, a);
      const segmentLength = Math.max(0.01, TMP_DIR.length());
      TMP_DIR.normalize();
      const core = this.coreSegments[index];
      core.position.copy(TMP_MID);
      core.quaternion.setFromUnitVectors(Y_AXIS, TMP_DIR);
      core.scale.set(core.userData.coreWidth, segmentLength, core.userData.coreWidth);
      const glow = this.glowSegments[index];
      glow.position.copy(TMP_MID);
      glow.quaternion.copy(core.quaternion);
      glow.scale.set(core.userData.glowWidth, segmentLength, core.userData.glowWidth);
    }
    this.coreMaterial.opacity = coreOpacity;
    this.glowMaterial.opacity = glowOpacity;
    this.group.visible = coreOpacity > 0.01 || glowOpacity > 0.01;
  }

  public hide(): void {
    this.coreMaterial.opacity = 0;
    this.glowMaterial.opacity = 0;
    this.group.visible = false;
  }

  public dispose(): void {
    this.coreMaterial.dispose();
    this.glowMaterial.dispose();
    for (const mesh of this.coreSegments) mesh.geometry.dispose();
  }
}

interface RadiantLaserOptions {
  readonly startProvider?: (output: THREE.Vector3) => THREE.Vector3;
  readonly fallbackStart: THREE.Vector3;
  readonly target: THREE.Object3D | null;
  readonly fallbackDirection: THREE.Vector3;
  readonly preset: MageSpellPreset;
  readonly caster: THREE.Object3D | null;
  readonly isTargetAlive?: (target: THREE.Object3D) => boolean;
  readonly queryBodyHit?: (
    from: THREE.Vector3,
    to: THREE.Vector3,
    spellRadius: number
  ) => THREE.Object3D | null;
  readonly onImpact?: (target: THREE.Object3D) => void;
  readonly onFinalImpact?: (position: THREE.Vector3, target: THREE.Object3D | null) => void;
}

class RadiantLaserBeam implements PoolableVFX {
  public active = false;
  public readonly group = new THREE.Group();
  private readonly layers: {
    mesh: THREE.Mesh;
    material: EnergyShaderMaterial;
    width: number;
    opacity: number;
  }[] = [];
  private readonly bolts: LightningBolt[] = [];
  private readonly streamSparks: PooledParticleCloud;
  private readonly impactSparks: PooledParticleCloud;
  private readonly originSparks: PooledParticleCloud;
  private readonly originGlow: THREE.Sprite;
  private readonly impactBurst: THREE.Sprite;
  private readonly impactGlow: THREE.Sprite;
  private readonly impactRing: THREE.Sprite;
  private readonly orbRing: THREE.Mesh;
  private readonly orbRingMaterial: THREE.MeshBasicMaterial;
  private impactLight: VFXLightHandle | null = null;
  private originLight: VFXLightHandle | null = null;
  private age = 0;
  private duration = 0.75;
  private aftermathRemaining = 0;
  private sparkCooldown = 0;
  private dripCooldown = 0;
  private impactPulse = 0;
  private ringAge = 1;
  private impactSent = false;
  private preset: MageSpellPreset | null = null;
  private startProvider: ((output: THREE.Vector3) => THREE.Vector3) | undefined;
  private target: THREE.Object3D | null = null;
  private readonly fallbackStart = new THREE.Vector3();
  private readonly fallbackDirection = new THREE.Vector3(0, 0, 1);
  private caster: THREE.Object3D | null = null;
  private isTargetAlive: ((target: THREE.Object3D) => boolean) | undefined;
  private queryBodyHit: RadiantLaserOptions['queryBodyHit'];
  private onImpact: ((target: THREE.Object3D) => void) | undefined;
  private onFinalImpact: ((position: THREE.Vector3, target: THREE.Object3D | null) => void) | undefined;

  public constructor(
    resources: MageVFXResources,
    private readonly quality: MageVFXQuality,
    private readonly lightPool: VFXLightPool
  ) {
    this.group.name = 'RadiantLaserPremiumVFX';
    this.group.visible = false;

    // Cinco camadas concêntricas: halo magenta largo → corpo carmesim →
    // núcleo branco-quente fino (a referência tem uma linha incandescente
    // muito fina dentro de um halo macio).
    const profile = mageQualityProfile(this.quality);
    const layerSpecs = [
      { name: 'RadiantLaserHalo', width: 1.5, opacity: 0.2, colorA: 0xff3d8a, colorB: 0xa04dff, intensity: 0.9, thickness: 1.5, scroll: 0.55 },
      { name: 'RadiantLaserOuter', width: 0.62, opacity: 0.38, colorA: 0xff2340, colorB: 0xff3d8a, intensity: 1.15, thickness: 1.15, scroll: 0.85 },
      { name: 'RadiantLaserBody', width: 0.28, opacity: 0.6, colorA: 0xff5a4a, colorB: 0xff2340, intensity: 1.55, thickness: 0.8, scroll: 1.25 },
      { name: 'RadiantLaserInner', width: 0.115, opacity: 0.8, colorA: 0xffb0a0, colorB: 0xff5a6a, intensity: 1.95, thickness: 0.55, scroll: 1.7 },
      { name: 'RadiantLaserWhiteCore', width: 0.052, opacity: 0.96, colorA: 0xffffff, colorB: 0xffd9e8, intensity: 2.35, thickness: 0.35, scroll: 2.1 },
    ] as const;
    for (const spec of layerSpecs) {
      const material = createBeamMaterial({
        opacity: 0,
        intensity: spec.intensity,
        thickness: spec.thickness,
        distortion: 1.05 * profile.distortionMultiplier,
        scrollSpeed: spec.scroll,
      });
      configureEnergyMaterial(material, {
        colorA: spec.colorA,
        colorB: spec.colorB,
        opacity: 0,
        distortion: 1.05 * profile.distortionMultiplier,
      });
      const mesh = new THREE.Mesh(resources.beamCylinder, material);
      mesh.name = spec.name;
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      this.group.add(mesh);
      this.layers.push({
        mesh,
        material,
        width: spec.width * profile.laserLayerMultiplier,
        opacity: spec.opacity,
      });
    }

    // Três raios elétricos grossos: magenta, roxo e rosa-quente.
    const boltCount = this.quality === 'low' ? 2 : 3;
    const boltSpecs = [
      { core: 0xffc2ff, glow: 0xff3df5, coreWidth: 0.05, glowWidth: 0.16, amplitude: 0.3 },
      { core: 0xd8b6ff, glow: 0xa04dff, coreWidth: 0.045, glowWidth: 0.14, amplitude: 0.46 },
      { core: 0xffd0f5, glow: 0xff6ad8, coreWidth: 0.04, glowWidth: 0.12, amplitude: 0.22 },
    ] as const;
    for (let index = 0; index < boltCount; index += 1) {
      const spec = boltSpecs[index];
      this.bolts.push(new LightningBolt(
        resources.beamCylinder,
        spec.core,
        spec.glow,
        spec.coreWidth * profile.laserLayerMultiplier,
        spec.glowWidth * profile.laserLayerMultiplier
      ));
      this.group.add(this.bolts[index].group);
    }

    this.streamSparks = new PooledParticleCloud(240, resources.softGlow);
    this.impactSparks = new PooledParticleCloud(280, resources.softGlow);
    this.originSparks = new PooledParticleCloud(120, resources.softGlow);
    this.group.add(
      this.streamSparks.points,
      this.impactSparks.points,
      this.originSparks.points
    );

    this.originGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: resources.mageTexture('laser', 'charge'),
      color: 0xff5ae0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.originGlow.name = 'RadiantLaserOriginBloom';

    this.impactBurst = new THREE.Sprite(new THREE.SpriteMaterial({
      map: resources.mageTexture('laser', 'impact'),
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.impactBurst.name = 'RadiantLaserImpactBurst';

    this.impactGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: resources.softGlow,
      color: 0xff8ad8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.impactGlow.name = 'RadiantLaserImpactHalo';

    this.impactRing = new THREE.Sprite(new THREE.SpriteMaterial({
      map: impactRingTexture(),
      color: 0xffe8f5,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.impactRing.name = 'RadiantLaserShockRing';

    // Anel roxo em volta do orbe do cajado (referência: o aro que cerca o
    // núcleo brilhante na ponta do cajado).
    this.orbRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xa04dff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.orbRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 8, 26), this.orbRingMaterial);
    this.orbRing.name = 'RadiantLaserOrbRing';
    this.orbRing.frustumCulled = false;
    this.orbRing.renderOrder = 7;

    this.group.add(
      this.originGlow,
      this.impactBurst,
      this.impactGlow,
      this.impactRing,
      this.orbRing
    );
  }

  public play(options: RadiantLaserOptions): void {
    this.preset = options.preset;
    this.startProvider = options.startProvider;
    this.target = options.target;
    this.fallbackStart.copy(options.fallbackStart);
    this.fallbackDirection.copy(options.fallbackDirection).normalize();
    this.caster = options.caster;
    this.isTargetAlive = options.isTargetAlive;
    this.queryBodyHit = options.queryBodyHit;
    this.onImpact = options.onImpact;
    this.onFinalImpact = options.onFinalImpact;
    this.duration = options.preset.laser?.duration ?? 0.75;
    this.aftermathRemaining = AFTERMATH_SECONDS;
    this.age = 0;
    this.sparkCooldown = 0;
    this.dripCooldown = 0;
    this.impactPulse = 0;
    this.ringAge = 1;
    this.impactSent = false;
    this.group.visible = true;

    const profile = mageQualityProfile(this.quality);
    this.impactLight = profile.enableSecondaryLights ? this.lightPool.acquire() : null;
    if (this.impactLight) {
      this.impactLight.light.color.set(0xffe4f0);
      this.impactLight.light.distance = 9;
    }
    this.originLight = profile.enableSecondaryLights ? this.lightPool.acquire() : null;
    if (this.originLight) {
      this.originLight.light.color.set(0xff3df0);
      this.originLight.light.distance = 6;
    }
    this.updateTransform(1);
  }

  public update(delta: number): boolean {
    if (!this.preset) return false;
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    const beamProgress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
    const intro = THREE.MathUtils.smoothstep(beamProgress, 0, 0.1);
    const outro = 1 - THREE.MathUtils.smoothstep(beamProgress, 0.82, 1);
    const beamAlive = this.age < this.duration;
    // Depois do feixe resta só o resíduo elétrico + brasas caindo.
    if (!beamAlive) this.aftermathRemaining = Math.max(0, this.aftermathRemaining - elapsed);
    const intensity = beamAlive ? intro * outro : 0;
    const aftermath = beamAlive ? 0 : this.aftermathRemaining / AFTERMATH_SECONDS;

    this.updateTransform(intensity || aftermath);
    const flicker = 0.86 + Math.sin(this.age * 51) * 0.07 + Math.random() * 0.07;

    for (const layer of this.layers) {
      setEnergyTime(layer.material, this.age);
      layer.material.uniforms.uOpacity.value = layer.opacity * intensity * flicker;
      // O halo se dissolve primeiro, o núcleo persiste até o fim.
      layer.mesh.visible = intensity > 0.01;
    }

    // Raios elétricos ao longo do feixe (vivos, refeitos a cada quadro).
    if (beamAlive && intensity > 0) {
      const boltAmplitude = [0.3, 0.46, 0.22];
      for (let index = 0; index < this.bolts.length; index += 1) {
        const flickerScale = 0.55 + Math.random() * 0.75;
        this.bolts[index].update(
          TMP_START,
          TMP_END,
          this.age,
          index * 7.13,
          boltAmplitude[index % boltAmplitude.length],
          intensity * flickerScale * 0.95,
          intensity * flickerScale * 0.4
        );
      }
    } else if (aftermath > 0) {
      this.updateAftermathBolts(aftermath);
    } else {
      for (const bolt of this.bolts) bolt.hide();
    }

    // Clarões de origem e impacto.
    const originPulse = 1 + Math.sin(this.age * 22) * 0.16;
    (this.originGlow.material as THREE.SpriteMaterial).opacity =
      Math.max(intensity * 0.95, aftermath * 0.25) * originPulse;
    this.originGlow.scale.setScalar((1.15 + intensity * 1.25) * originPulse);
    (this.orbRing.material as THREE.MeshBasicMaterial).opacity = intensity * 0.85;
    this.orbRing.rotation.z += elapsed * 2.4;
    const burstPulse = 1 + Math.sin(this.age * 19) * 0.18;
    (this.impactBurst.material as THREE.SpriteMaterial).opacity =
      intensity * 0.95 * burstPulse + aftermath * 0.35;
    this.impactBurst.scale.setScalar((1.9 + intensity * 1.1) * burstPulse + aftermath * 0.7);
    (this.impactGlow.material as THREE.SpriteMaterial).opacity =
      intensity * 0.7 + aftermath * 0.4;
    this.impactGlow.scale.setScalar(2.6 + intensity * 1.7 + aftermath * 1.1);

    // Anel de choque: expande uma vez no primeiro impacto.
    if (this.ringAge < 1) {
      this.ringAge = Math.min(1, this.ringAge + elapsed / 0.42);
      const ringScale = 0.9 + this.ringAge * 3.2;
      this.impactRing.scale.setScalar(ringScale);
      (this.impactRing.material as THREE.SpriteMaterial).opacity = (1 - this.ringAge) * 0.85;
    } else {
      (this.impactRing.material as THREE.SpriteMaterial).opacity = 0;
    }

    // Luzes seguem os pontos de interesse.
    if (this.impactLight) {
      this.impactLight.light.position.copy(TMP_END);
      this.impactLight.light.intensity =
        (intensity * 2.1 + aftermath * 0.5) * this.impactBrightness();
    }
    if (this.originLight) {
      this.originLight.light.position.copy(TMP_START);
      this.originLight.light.intensity = intensity * 1.15 + aftermath * 0.25;
    }

    // --- Fagulhas -----------------------------------------------------------
    this.impactPulse = Math.max(0, this.impactPulse - elapsed);
    if (beamAlive && this.impactPulse <= 0 && intensity > 0.15) {
      this.impactPulse = 0.1;
      // Leque quente de brasas no impacto (referência: estouro de fagulhas
      // amarelo-brancas em leque, algumas caindo como brasas).
      this.impactSparks.emit(TMP_END, {
        color: 0xfff3d8,
        count: qualityCount(14, this.quality, this.preset.qualityParticleMultiplier),
        speed: 3.4,
        spread: 1.15,
        lifetime: 0.5,
        upwardBias: -0.12,
        size: [0.6, 2],
        growth: -0.45,
      });
      this.impactSparks.emit(TMP_END, {
        color: 0xff9ad8,
        count: qualityCount(10, this.quality, this.preset.qualityParticleMultiplier),
        speed: 2.2,
        spread: 1.3,
        lifetime: 0.62,
        upwardBias: -0.3,
        size: [0.5, 1.6],
        growth: -0.4,
      });
    }
    if (beamAlive && intensity > 0.1) {
      // Fluxo denso de fagulhas rosas/brancas ao longo do trajeto.
      this.sparkCooldown = Math.max(0, this.sparkCooldown - elapsed);
      if (this.sparkCooldown <= 0) {
        this.sparkCooldown = 0.035;
        const t = 0.12 + Math.random() * 0.76;
        TMP_MID.copy(TMP_START).lerp(TMP_END, t);
        this.streamSparks.emit(TMP_MID, {
          color: Math.random() < 0.5 ? 0xffc2ec : 0xffffff,
          count: qualityCount(3, this.quality, this.preset.qualityParticleMultiplier),
          speed: 1.35,
          spread: 1,
          lifetime: 0.32,
          upwardBias: 0.1,
          size: [0.4, 1.3],
          growth: -0.5,
        });
      }
    }
    // Pingo contínuo na origem (orbe do cajado) + brasas residuais.
    this.dripCooldown = Math.max(0, this.dripCooldown - elapsed);
    if (this.dripCooldown <= 0 && (beamAlive || aftermath > 0.25)) {
      this.dripCooldown = 0.12;
      this.originSparks.emit(TMP_START, {
        color: 0xff8ae8,
        count: qualityCount(5, this.quality, this.preset.qualityParticleMultiplier),
        speed: 1.15,
        spread: 0.85,
        lifetime: 0.5,
        upwardBias: -0.35,
        size: [0.4, 1.2],
        growth: -0.45,
      });
    }

    this.streamSparks.update(elapsed);
    this.impactSparks.update(elapsed);
    this.originSparks.update(elapsed);

    // Contrato do LaserVFX: onImpact uma vez no primeiro contato; onFinalImpact
    // quando tudo terminar (feixe + resíduo).
    if (!this.impactSent && this.target && (!this.isTargetAlive || this.isTargetAlive(this.target))) {
      this.impactSent = true;
      this.ringAge = 0;
      this.onImpact?.(this.target);
    }
    if (!beamAlive && this.aftermathRemaining <= 0) {
      this.onFinalImpact?.(TMP_END.clone(), this.target);
      return false;
    }
    return true;
  }

  public reset(): void {
    this.group.visible = false;
    this.group.removeFromParent();
    this.age = 0;
    this.preset = null;
    this.startProvider = undefined;
    this.target = null;
    this.caster = null;
    this.isTargetAlive = undefined;
    this.queryBodyHit = undefined;
    this.onImpact = undefined;
    this.onFinalImpact = undefined;
    for (const layer of this.layers) layer.material.uniforms.uOpacity.value = 0;
    for (const bolt of this.bolts) bolt.hide();
    this.streamSparks.reset();
    this.impactSparks.reset();
    this.originSparks.reset();
    (this.originGlow.material as THREE.SpriteMaterial).opacity = 0;
    (this.impactBurst.material as THREE.SpriteMaterial).opacity = 0;
    (this.impactGlow.material as THREE.SpriteMaterial).opacity = 0;
    (this.impactRing.material as THREE.SpriteMaterial).opacity = 0;
    this.orbRingMaterial.opacity = 0;
    this.impactLight?.release();
    this.impactLight = null;
    this.originLight?.release();
    this.originLight = null;
  }

  public dispose(): void {
    for (const layer of this.layers) layer.material.dispose();
    for (const bolt of this.bolts) bolt.dispose();
    this.streamSparks.dispose();
    this.impactSparks.dispose();
    this.originSparks.dispose();
    for (const sprite of [this.originGlow, this.impactBurst, this.impactGlow, this.impactRing]) {
      (sprite.material as THREE.Material).dispose();
    }
    this.orbRingMaterial.dispose();
    this.orbRing.geometry.dispose();
  }

  /** Raios roxos rastejando em volta do alvo depois que o feixe apaga. */
  private updateAftermathBolts(aftermath: number): void {
    if (!this.bolts.length) return;
    const t = this.age * 3.1;
    for (let index = 0; index < this.bolts.length; index += 1) {
      const angleA = t * (1.1 + index * 0.37) + index * 2.1;
      const angleB = angleA + Math.PI * (0.75 + 0.35 * Math.sin(t + index));
      const radius = 0.55 + index * 0.12;
      TMP_START.copy(TMP_END);
      TMP_START.x += Math.cos(angleA) * radius;
      TMP_START.y += Math.sin(angleA * 0.8 + index) * 0.55;
      TMP_START.z += Math.sin(angleA) * radius;
      const end = TMP_MID.copy(TMP_END);
      end.x += Math.cos(angleB) * radius;
      end.y += Math.sin(angleB * 0.8 + index) * 0.55;
      end.z += Math.sin(angleB) * radius;
      this.bolts[index].update(
        TMP_START,
        end,
        this.age,
        index * 5.7,
        0.3,
        aftermath * 0.75,
        aftermath * 0.3
      );
    }
  }

  private impactBrightness(): number {
    return this.preset?.impact.lightIntensity ?? 1.2;
  }

  private updateTransform(intensity: number): void {
    if (!this.preset) return;
    if (this.startProvider) this.startProvider(TMP_START);
    else TMP_START.copy(this.fallbackStart);
    TMP_START.y += 0.08;

    if (this.target && this.isTargetAlive && !this.isTargetAlive(this.target)) this.target = null;
    if (this.target) targetPoint(this.target, TMP_END);
    else TMP_END.copy(TMP_START).addScaledVector(this.fallbackDirection, MAGE_SPELL_TRAVEL_METERS);
    const blocker = this.queryBodyHit?.(TMP_START, TMP_END, this.preset.projectile.radius);
    if (blocker) {
      this.target = blocker;
      targetPoint(blocker, TMP_END);
    }

    TMP_DIR.subVectors(TMP_END, TMP_START);
    const length = Math.max(0.01, TMP_DIR.length());
    TMP_DIR.normalize();
    TMP_MID.copy(TMP_START).addScaledVector(TMP_DIR, length * 0.5);

    const breathe = 0.94 + intensity * 0.14;
    for (const layer of this.layers) {
      layer.mesh.position.copy(TMP_MID);
      layer.mesh.quaternion.setFromUnitVectors(Y_AXIS, TMP_DIR);
      layer.mesh.scale.set(layer.width * breathe, length, layer.width * breathe);
    }

    // O anel roxo encara o alvo (eixo Z do torus na direção do feixe).
    this.orbRing.position.copy(TMP_START);
    this.orbRing.quaternion.setFromUnitVectors(Z_AXIS, TMP_DIR);
    this.originGlow.position.copy(TMP_START);
    this.impactBurst.position.copy(TMP_END);
    this.impactGlow.position.copy(TMP_END);
    this.impactRing.position.copy(TMP_END);
    void intensity;
  }
}

export class RadiantLaserVFX {
  private readonly pool: VFXPool<RadiantLaserBeam>;
  private readonly active: RadiantLaserBeam[] = [];

  public constructor(
    private readonly scene: THREE.Scene,
    resources: MageVFXResources,
    quality: MageVFXQuality,
    lightPool: VFXLightPool
  ) {
    this.pool = new VFXPool(
      () => new RadiantLaserBeam(resources, quality, lightPool),
      MAGE_VFX_LIMITS.maxRadiantLasers
    );
  }

  public fire(options: RadiantLaserOptions): boolean {
    const beam = this.pool.acquire();
    if (!beam) {
      if (options.target) options.onImpact?.(options.target);
      options.onFinalImpact?.(
        options.fallbackStart.clone().addScaledVector(options.fallbackDirection, MAGE_SPELL_TRAVEL_METERS),
        options.target
      );
      return false;
    }
    beam.play(options);
    this.scene.add(beam.group);
    this.active.push(beam);
    return true;
  }

  public update(delta: number): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const beam = this.active[index];
      if (beam.update(delta)) continue;
      this.pool.release(beam);
      this.active.splice(index, 1);
    }
  }

  public clear(): void {
    for (const beam of this.active) this.pool.release(beam);
    this.active.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.pool.dispose();
  }

  public get activeCount(): number { return this.active.length; }
  public get pooledCount(): number { return this.pool.inactiveCount; }
}

interface AuraWisp {
  sprite: THREE.Sprite;
  angle: number;
  radius: number;
  height: number;
  phase: number;
  speed: number;
}

/**
 * Chamas magenta/roxeas em volta da Maga durante a conjuração do Laser
 * Rajante (referência: línguas de fogo roxas subindo pelo corpo dela).
 * Seguem o caster e apagam com fade quando o efeito termina.
 */
export class RadiantCastAura {
  public readonly group = new THREE.Group();
  private readonly wisps: AuraWisp[] = [];
  private caster: THREE.Object3D | null = null;
  private age = 0;
  private fade = 0;

  public constructor(resources: MageVFXResources, quality: MageVFXQuality) {
    this.group.name = 'RadiantLaserCastAura';
    this.group.visible = false;
    const profile = mageQualityProfile(quality);
    const count = Math.max(5, Math.round(9 * profile.particleMultiplier));
    for (let index = 0; index < Math.max(5, count); index += 1) {
      const purple = index % 2 === 0;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: resources.softGlow,
        color: purple ? 0x8b3dff : 0xff3df0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      sprite.name = `RadiantAuraWisp${index}`;
      this.group.add(sprite);
      this.wisps.push({
        sprite,
        angle: (index / Math.max(1, count)) * Math.PI * 2,
        radius: 0.42 + (index % 3) * 0.16,
        height: 0.3 + (index % 4) * 0.22,
        phase: Math.random() * Math.PI * 2,
        speed: 0.9 + (index % 5) * 0.16,
      });
    }
  }

  public begin(caster: THREE.Object3D): void {
    this.caster = caster;
    this.age = 0;
    this.fade = 1;
    this.group.visible = true;
  }

  public end(): void {
    this.fade = Math.min(this.fade, 0.001);
  }

  public update(delta: number): void {
    if (!this.caster) return;
    const elapsed = Math.max(0, delta);
    this.age += elapsed;
    if (this.fade <= 0.001) {
      this.fade = Math.max(0, this.fade - elapsed * 2.2);
    } else {
      // A aura queima forte por ~2,4 s e depois apaga sozinha.
      const life = Math.max(0, 1 - Math.max(0, this.age - 2.4) / 0.5);
      this.fade = life;
    }
    if (this.fade <= 0 && this.age > 2.4) {
      this.group.visible = false;
      this.caster = null;
      return;
    }
    const origin = this.caster.getWorldPosition(TMP_START);
    for (const wisp of this.wisps) {
      const wobble = Math.sin(this.age * wisp.speed * 3 + wisp.phase);
      const angle = wisp.angle + Math.sin(this.age * wisp.speed + wisp.phase) * 0.35;
      const radius = wisp.radius * (1 + wobble * 0.18);
      wisp.sprite.position.set(
        origin.x + Math.cos(angle) * radius,
        origin.y + wisp.height + wobble * 0.22 + this.age * 0.16,
        origin.z + Math.sin(angle) * radius
      );
      const flicker = 0.55 + Math.sin(this.age * 9 + wisp.phase * 3) * 0.25 + Math.random() * 0.12;
      (wisp.sprite.material as THREE.SpriteMaterial).opacity = flicker * this.fade * 0.5;
      wisp.sprite.scale.set(0.55, 1.7 + wobble * 0.5, 1);
    }
    this.group.visible = true;
  }

  public clear(): void {
    this.caster = null;
    this.fade = 0;
    this.group.visible = false;
    for (const wisp of this.wisps) {
      (wisp.sprite.material as THREE.SpriteMaterial).opacity = 0;
    }
  }

  public dispose(): void {
    this.clear();
    for (const wisp of this.wisps) {
      (wisp.sprite.material as THREE.Material).dispose();
    }
  }
}
