import * as THREE from 'three';
import { createCurvedSlashGeometry } from './CurvedSlashGeometry';
import { createWarriorSlashMaterial, type WarriorSlashShaderMaterial } from './WarriorSlashMaterial';
import { WarriorImpactFlash } from './WarriorImpactFlash';
import { MiniBossHealVFX } from './MiniBossHealVFX';
import type { WarriorAttackId } from '../../characters/CharacterCatalog';

export type WarriorSlashStyle = 'glacial-ice' | 'runic-gold' | 'fire';

export interface WarriorSlashConfig {
  style: WarriorSlashStyle;
  outerRadius: number;
  innerRadius: number;
  angleSpan: number;
  duration: number;
  pitchTilt: number;
  verticalCurvature: number;
  colorCore: THREE.ColorRepresentation;
  colorEdge: THREE.ColorRepresentation;
  colorGlow: THREE.ColorRepresentation;
  intensity: number;
  distortion: number;
  edgeGlowBoost?: number;
  travelDistance?: number;
  travelSpeed?: number;
}

export const WARRIOR_SLASH_STYLES: Record<WarriorSlashStyle, WarriorSlashConfig> = {
  // Skill 2 / Ataque Básico:
  // Rastro bem grande com cauda/rabo longo e afilado ("rabo bem grande"),
  // azul elétrico vibrante e ciano (sem dominar o branco), idêntico à referência.
  'glacial-ice': {
    style: 'glacial-ice',
    outerRadius: 4.2,
    innerRadius: 1.1,
    angleSpan: Math.PI * 1.35,
    duration: 0.60,
    pitchTilt: 0.16,
    verticalCurvature: -0.20,
    colorCore: 0x00d0ff,
    colorEdge: 0x0077ff,
    colorGlow: 0x0022cc,
    intensity: 3.2,
    distortion: 0.7,
    edgeGlowBoost: 2.2,
    travelDistance: 8.5,
    travelSpeed: 14.0,
  },
  'runic-gold': {
    style: 'runic-gold',
    outerRadius: 4.4,
    innerRadius: 1.15,
    angleSpan: Math.PI * 1.45,
    duration: 0.52,
    pitchTilt: 0.18,
    verticalCurvature: -0.22,
    colorCore: 0xffffff,
    colorEdge: 0xffcc33,
    colorGlow: 0xff6600,
    intensity: 3.2,
    distortion: 0.8,
    edgeGlowBoost: 2.2,
    travelDistance: 0,
  },
  'fire': {
    style: 'fire',
    outerRadius: 4.3,
    innerRadius: 1.1,
    angleSpan: Math.PI * 1.38,
    duration: 0.54,
    pitchTilt: 0.20,
    verticalCurvature: -0.24,
    colorCore: 0xfff0bb,
    colorEdge: 0xff5500,
    colorGlow: 0xd61c00,
    intensity: 3.3,
    distortion: 1.2,
    edgeGlowBoost: 2.2,
    travelDistance: 0,
  },
};

/**
 * Returns the corresponding visual style for each warrior skill or combo attack.
 * Basic attack ALWAYS uses the exact same thick 'glacial-ice' style as Skill 2!
 */
export function getWarriorAttackSlashStyle(attackId: WarriorAttackId): WarriorSlashStyle {
  switch (attackId) {
    case 'triplo_ataque':
    case 'pulo_atacando':
      return 'fire';
    case 'ataque_giratorio':
      return 'runic-gold';
    case 'ataque_giratorio_2':
    case 'corte_duplo':
    case 'ataque_basico':
    default:
      // Ataque básico utiliza unicamente o estilo encorpado da skill 2 (glacial-ice)
      return 'glacial-ice';
  }
}

interface ActiveSlashInstance {
  id: number;
  mesh: THREE.Mesh<THREE.BufferGeometry, WarriorSlashShaderMaterial>;
  config: WarriorSlashConfig;
  elapsed: number;
  duration: number;
  forward: THREE.Vector3;
  startOrigin: THREE.Vector3;
  travelDistance: number;
  travelSpeed: number;
  target?: THREE.Object3D | null;
}

export class WarriorSlashVFX {
  public readonly group = new THREE.Group();
  private readonly loader = new THREE.TextureLoader();
  private readonly textures: Map<WarriorSlashStyle, THREE.Texture> = new Map();
  private readonly impactFlash = new WarriorImpactFlash();
  public readonly healPillar = new MiniBossHealVFX();
  private readonly activeSlashes: ActiveSlashInstance[] = [];
  private nextId = 1;

  private readonly geometryCache = new Map<string, THREE.BufferGeometry>();

  public constructor() {
    this.group.name = 'WarriorSlashVFXRoot';
    this.group.add(this.impactFlash.group);
    this.group.add(this.healPillar.group);

    // Preload textures
    this.loadTexture('glacial-ice', '/vfx/warrior/slash-ice.png');
    this.loadTexture('runic-gold', '/vfx/warrior/slash-runic.png');
    this.loadTexture('fire', '/vfx/warrior/slash-fire.png');
  }

  private loadTexture(style: WarriorSlashStyle, path: string): void {
    const tex = this.loader.load(
      path,
      (loaded) => {
        loaded.wrapS = THREE.ClampToEdgeWrapping;
        loaded.wrapT = THREE.ClampToEdgeWrapping;
        loaded.needsUpdate = true;
      },
      undefined,
      () => {
        // Fallback or warning
      }
    );
    this.textures.set(style, tex);
  }

  private getGeometry(config: WarriorSlashConfig): THREE.BufferGeometry {
    const key = `${config.outerRadius}_${config.innerRadius}_${config.angleSpan.toFixed(2)}_${config.pitchTilt.toFixed(2)}`;
    let geo = this.geometryCache.get(key);
    if (!geo) {
      geo = createCurvedSlashGeometry({
        outerRadius: config.outerRadius,
        innerRadius: config.innerRadius,
        angleSpan: config.angleSpan,
        pitchTilt: config.pitchTilt,
        verticalCurvature: config.verticalCurvature,
        radialSegments: 52,
        widthSegments: 4,
      });
      this.geometryCache.set(key, geo);
    }
    return geo;
  }

  /**
   * Spawns ONE single, thick, beautiful slash arc (style of Skill 2).
   * For basic attack: launches from the sword blade and travels forward up to 8m towards target.
   * Upon reaching or hitting enemy, it dissolves and flashes impact.
   */
  public triggerSlash(
    attackId: WarriorAttackId,
    origin: THREE.Vector3,
    forward: THREE.Vector3,
    hitIndex = 0,
    target?: THREE.Object3D | null,
    customStyle?: WarriorSlashStyle
  ): number {
    const style = customStyle ?? getWarriorAttackSlashStyle(attackId);
    const config = WARRIOR_SLASH_STYLES[style];
    const texture = this.textures.get(style) ?? null;

    const geo = this.getGeometry(config);
    const mat = createWarriorSlashMaterial({
      texture,
      colorCore: config.colorCore,
      colorEdge: config.colorEdge,
      colorGlow: config.colorGlow,
      intensity: config.intensity,
      distortion: config.distortion,
      edgeGlowBoost: config.edgeGlowBoost,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;

    // Centered at character waist/sword level ~ 1.05m
    const slashOrigin = origin.clone();
    slashOrigin.y += 1.05;

    // Placed right at the sword arc
    const fwd = forward.clone().setY(0);
    if (fwd.lengthSq() <= 1e-6) fwd.set(0, 0, 1);
    fwd.normalize();
    slashOrigin.addScaledVector(fwd, 0.45);

    mesh.position.copy(slashOrigin);

    const yawAngle = Math.atan2(fwd.x, fwd.z);
    mesh.rotation.y = yawAngle;

    // Angular orientation matching the sword swing trajectory
    let rollAngle = 0.15;
    let pitchAngle = 0.05;
    if (attackId === 'ataque_basico') {
      if (hitIndex === 0) {
        rollAngle = -0.32;
        pitchAngle = 0.06;
      } else if (hitIndex === 1) {
        rollAngle = 0.34;
        pitchAngle = -0.05;
      } else {
        rollAngle = -0.15;
        pitchAngle = 0.12;
      }
    } else if (attackId === 'corte_duplo') {
      rollAngle = hitIndex === 0 ? -0.42 : 0.45;
    } else if (attackId === 'pulo_atacando') {
      rollAngle = 0.0;
      pitchAngle = 0.35;
    } else if (attackId === 'ataque_giratorio' || attackId === 'ataque_giratorio_2') {
      rollAngle = 0.05;
      pitchAngle = 0.0;
    }

    mesh.rotation.z = rollAngle;
    mesh.rotation.x = pitchAngle;

    this.group.add(mesh);

    const isBasic = attackId === 'ataque_basico';
    const travelDist = isBasic ? 8.0 : (config.travelDistance ?? 0);
    const travelSpeed = isBasic ? 14.5 : (config.travelSpeed ?? 14.5);
    const duration = travelDist > 0 ? (travelDist / travelSpeed) : config.duration;

    const id = this.nextId++;
    this.activeSlashes.push({
      id,
      mesh,
      config,
      elapsed: 0,
      duration,
      forward: fwd,
      startOrigin: slashOrigin.clone(),
      travelDistance: travelDist,
      travelSpeed,
      target,
    });

    return id;
  }

  /**
   * Called when an attack hits an enemy: instantly triggers an impact flare at
   * the enemy's position and consumes/vanishes the slash trail immediately!
   */
  public reportEnemyHit(targetPosition: THREE.Vector3, color?: THREE.ColorRepresentation): void {
    this.impactFlash.triggerImpact(targetPosition, color ?? 0x33e5ff);

    if (this.activeSlashes.length > 0) {
      const slash = this.activeSlashes[this.activeSlashes.length - 1];
      slash.elapsed = slash.duration * 0.95;
      slash.mesh.material.uniforms.uFade.value = 0;
    }
  }

  /**
   * Triggers the large green healing pillar (Image 1) when a mini-boss is slain and restores HP.
   */
  public triggerMiniBossHeal(playerRoot: THREE.Object3D): void {
    this.healPillar.triggerHeal(playerRoot);
  }

  public update(delta: number): void {
    this.impactFlash.update(delta);
    this.healPillar.update(delta);

    for (let i = this.activeSlashes.length - 1; i >= 0; i--) {
      const slash = this.activeSlashes[i];
      slash.elapsed += delta;
      const progress = Math.min(1.0, slash.elapsed / slash.duration);

      const uniforms = slash.mesh.material.uniforms;
      uniforms.uTime.value += delta;

      if (slash.travelDistance > 0) {
        // Moves forward from sword along target line
        const currentDist = slash.elapsed * slash.travelSpeed;
        slash.mesh.position.copy(slash.startOrigin).addScaledVector(slash.forward, currentDist);

        // Immediate full sweep so the blade shape is bold and complete from start
        const sweepProgress = Math.min(1.0, slash.elapsed * 12.0);
        uniforms.uProgress.value = sweepProgress;

        // Fades softly on reaching the end of range (after 6.5m up to 8m)
        let fade = 1.0;
        if (currentDist >= 6.5) {
          fade = Math.max(0.0, 1.0 - (currentDist - 6.5) / (slash.travelDistance - 6.5));
        }
        uniforms.uFade.value = fade * fade;

        if (currentDist >= slash.travelDistance || progress >= 1.0 || fade <= 0.005) {
          this.group.remove(slash.mesh);
          slash.mesh.material.dispose();
          this.activeSlashes.splice(i, 1);
          continue;
        }
      } else {
        // Stationary spin / skill
        const sweepProgress = Math.min(1.0, Math.pow(progress, 0.72) * 1.15);
        uniforms.uProgress.value = sweepProgress;

        const fadeProgress = progress > 0.55 ? 1.0 - (progress - 0.55) / 0.45 : 1.0;
        uniforms.uFade.value = Math.max(0.0, Math.pow(fadeProgress, 1.3));

        if (progress >= 1.0 || uniforms.uFade.value <= 0.005) {
          this.group.remove(slash.mesh);
          slash.mesh.material.dispose();
          this.activeSlashes.splice(i, 1);
          continue;
        }
      }
    }
  }

  public reset(): void {
    for (const slash of this.activeSlashes) {
      this.group.remove(slash.mesh);
      slash.mesh.material.dispose();
    }
    this.activeSlashes.length = 0;
    this.impactFlash.reset();
    this.healPillar.reset();
  }

  public dispose(): void {
    this.reset();
    for (const geo of this.geometryCache.values()) {
      geo.dispose();
    }
    this.geometryCache.clear();
    for (const tex of this.textures.values()) {
      tex.dispose();
    }
    this.textures.clear();
    this.impactFlash.dispose();
    this.healPillar.dispose();
  }
}
