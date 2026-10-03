import * as THREE from 'three';

export type MageSpellId = 'basic' | 'water' | 'lightning' | 'lava' | 'ice' | 'laser';
export type MageVFXQuality = 'low' | 'medium' | 'high' | 'ultra';
export type MageHandId = 'right' | 'left' | 'both';
export type MageSpellDelivery = 'projectile' | 'instant-lightning' | 'beam';
export type MageSpellVisualStyle = 'arcane' | 'water' | 'lightning' | 'lava' | 'ice' | 'laser';

export interface MageSpellColors {
  readonly core: THREE.ColorRepresentation;
  readonly glow: THREE.ColorRepresentation;
  readonly secondary: THREE.ColorRepresentation;
  readonly spark: THREE.ColorRepresentation;
  readonly smoke?: THREE.ColorRepresentation;
}

export interface MageSpellTimelineConfig {
  /** Normalized clip progress: 0=start, 1=end. */
  readonly chargeStart: number;
  readonly secondaryCharge?: number;
  readonly magicCircle?: number;
  /** Normalized clip progress where the projectile/beam/instant strike leaves the hand. */
  readonly launch: number;
  readonly chargeEnd: number;
  readonly recover: number;
  readonly end?: number;
}

/**
 * Projectile silhouette. `orb` is the original charged sphere; `bullet` is the
 * small elongated bolt (nose cone + body + shock cone) used by the Mage's
 * basic attack, which must read as a projectile, not as a ball of light.
 */
export type MageProjectileShape = 'orb' | 'bullet';

export interface MageProjectileFrostConfig {
  /** Vapor color. Frost reads as pale ice-blue, not as glowing plasma. */
  readonly color: THREE.ColorRepresentation;
  /** Particles released per puff. */
  readonly count: number;
  /** Seconds between puffs of the trail. */
  readonly interval: number;
  /** Point size range in shader units. */
  readonly size: readonly [number, number];
  readonly speed: number;
  readonly spread: number;
  readonly lifetime: number;
  /** Cloud alpha; also stops the cloud from dimming as it thins out. */
  readonly opacity: number;
  readonly upwardBias?: number;
  /** How much each puff grows over its life (0.9 = +90%). */
  readonly growth?: number;
  readonly blending?: 'additive' | 'normal';
}

/**
 * Sprite "cometa" do projétil: dardo + seda + partículas de gelo, desenhado em
 * `createFrostBulletMaterial`. Fica sempre de frente para a câmera e gira para
 * apontar no sentido do voo (stretched billboard), então aparece igual às
 * referências mesmo com a câmera atrás da Maga.
 */
export interface MageProjectileCometConfig {
  /** Largura do sprite em múltiplos do raio do projétil. */
  readonly widthScale: number;
  /** Comprimento do sprite em múltiplos do raio do projétil. */
  readonly lengthScale: number;
  /** Fração do comprimento ocupada pela ponta em dardo (0.3 = 30%). */
  readonly headLength?: number;
  readonly intensity?: number;
  /** Quantos pontos de gelo nascem dentro do sprite (0..6). */
  readonly sparkles?: number;
  /** Aura suave em volta da ponta. */
  readonly haze?: number;
  /** Brilho dos filamentos de seda. */
  readonly filaments?: number;
  /** Ondulação da seda (0 = fita reta). */
  readonly wisp?: number;
  /** Velocidade do fluxo da seda da cauda. */
  readonly scroll?: number;
  /** Opacidade do rastro de energia antigo; 0 desliga. */
  readonly trailOpacity?: number;
  /** Semente do desenho; varia a seda entre disparos. */
  readonly seed?: number;
}

export interface MageProjectileConfig {
  readonly speed: number;
  readonly lifetime: number;
  readonly radius: number;
  readonly trailLength: number;
  readonly trailWidth: number;
  readonly shape?: MageProjectileShape;
  /** Halo sprite diameter as a multiple of `radius` (default 3.4). */
  readonly haloScale?: number;
  readonly haloOpacity?: number;
  /** Optional frost/smoke wake left behind the bolt. */
  readonly frost?: MageProjectileFrostConfig;
  /** Sprite do cometa (só quando `shape` é 'bullet'). */
  readonly comet?: MageProjectileCometConfig;
}

export interface MageImpactConfig {
  readonly duration: number;
  readonly radius: number;
  readonly shockwaveRadius: number;
  readonly cameraShakeIntensity: number;
  readonly cameraShakeDuration: number;
  readonly lightIntensity: number;
  readonly particleCount: number;
  readonly debrisCount: number;
}

export interface MageChargeConfig {
  readonly scale: number;
  readonly particleCount: number;
  readonly sparkCount: number;
  readonly lightIntensity: number;
  readonly twoHanded: boolean;
}

export interface MageLaserConfig {
  readonly duration: number;
  readonly outerWidth: number;
  readonly bodyWidth: number;
  readonly coreWidth: number;
  readonly impactPulseInterval: number;
}

export interface MageLightningConfig {
  readonly duration: number;
  readonly segments: number;
  readonly branches: number;
  readonly jitter: number;
}

export interface MageSpellPreset {
  readonly id: MageSpellId;
  readonly style: MageSpellVisualStyle;
  readonly delivery: MageSpellDelivery;
  readonly colors: MageSpellColors;
  readonly timeline: MageSpellTimelineConfig;
  readonly charge: MageChargeConfig;
  readonly projectile: MageProjectileConfig;
  readonly impact: MageImpactConfig;
  readonly laser?: MageLaserConfig;
  readonly lightning?: MageLightningConfig;
  readonly hand: MageHandId;
  readonly qualityParticleMultiplier: Readonly<Record<MageVFXQuality, number>>;
  readonly audio?: {
    readonly charge?: string;
    readonly cast?: string;
    readonly projectile?: string;
    readonly impact?: string;
    readonly loop?: string;
  };
}

export interface MageCastContext {
  readonly caster: THREE.Object3D;
  readonly action: THREE.AnimationAction;
  readonly rightHand: THREE.Object3D | null;
  readonly leftHand: THREE.Object3D | null;
  readonly target: THREE.Object3D | null;
  /** Used for empty-space animation tests or when the target dies before launch. */
  readonly fallbackDirection: THREE.Vector3;
  readonly onImpact?: (target: THREE.Object3D) => void;
  /**
   * Fires once when the spell launches (the cast motion climax). Gameplay uses
   * it to free the caster's movement while the projectile and monster-side
   * effects still play out.
   */
  readonly onLaunch?: () => void;
  readonly isTargetAlive?: (target: THREE.Object3D) => boolean;
  /**
   * First monster body the segment enters. Spells stop on that body instead of
   * flying through it.
   */
  readonly queryBodyHit?: (
    from: THREE.Vector3,
    to: THREE.Vector3,
    spellRadius: number
  ) => THREE.Object3D | null;
  readonly emitAudioEvent?: (event: MageVFXAudioEvent) => void;
}

export interface MageVFXAudioEvent {
  readonly spellId: MageSpellId;
  readonly phase: 'charge' | 'cast' | 'projectile' | 'impact' | 'loop-start' | 'loop-end';
  readonly soundId?: string;
  readonly position: THREE.Vector3;
}

export interface MageVFXDiagnostics {
  readonly activeCasts: number;
  readonly activeCharges: number;
  readonly pooledCharges: number;
  readonly activeProjectiles: number;
  readonly pooledProjectiles: number;
  readonly activeImpacts: number;
  readonly pooledImpacts: number;
  readonly activeMagicCircles: number;
  readonly pooledMagicCircles: number;
  readonly activeLightning: number;
  readonly pooledLightning: number;
  readonly activeLasers: number;
  readonly pooledLasers: number;
  readonly activeBarriers: number;
  readonly pooledBarriers: number;
}
