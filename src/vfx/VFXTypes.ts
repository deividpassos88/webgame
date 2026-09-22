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

export interface MageProjectileConfig {
  readonly speed: number;
  readonly lifetime: number;
  readonly radius: number;
  readonly trailLength: number;
  readonly trailWidth: number;
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
  readonly isTargetAlive?: (target: THREE.Object3D) => boolean;
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
