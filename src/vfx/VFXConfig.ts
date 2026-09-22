import type { MageSpellId, MageSpellPreset, MageVFXQuality } from './VFXTypes';

export const DEFAULT_MAGE_VFX_QUALITY: MageVFXQuality = 'high';

export const MAGE_VFX_LIMITS = Object.freeze({
  maxCharges: 5,
  maxProjectiles: 20,
  maxImpacts: 20,
  maxMagicCircles: 12,
  maxTemporaryLights: 8,
  maxLightning: 8,
  maxLasers: 4,
  maxBarriers: 3,
});

export interface MageVFXQualityProfile {
  readonly particleMultiplier: number;
  readonly lightningBranchMultiplier: number;
  readonly iceShardMultiplier: number;
  readonly smokeMultiplier: number;
  readonly enableSecondaryLights: boolean;
  readonly enableDecorativeCircles: boolean;
  readonly laserLayerMultiplier: number;
  readonly distortionMultiplier: number;
}

export const MAGE_VFX_QUALITY_PROFILES: Readonly<Record<MageVFXQuality, MageVFXQualityProfile>> = {
  low: {
    particleMultiplier: 0.45,
    lightningBranchMultiplier: 0.35,
    iceShardMultiplier: 0.45,
    smokeMultiplier: 0.25,
    enableSecondaryLights: false,
    enableDecorativeCircles: false,
    laserLayerMultiplier: 0.65,
    distortionMultiplier: 0.55,
  },
  medium: {
    particleMultiplier: 0.75,
    lightningBranchMultiplier: 0.7,
    iceShardMultiplier: 0.75,
    smokeMultiplier: 0.65,
    enableSecondaryLights: true,
    enableDecorativeCircles: true,
    laserLayerMultiplier: 0.85,
    distortionMultiplier: 0.8,
  },
  high: {
    particleMultiplier: 1,
    lightningBranchMultiplier: 1,
    iceShardMultiplier: 1,
    smokeMultiplier: 1,
    enableSecondaryLights: true,
    enableDecorativeCircles: true,
    laserLayerMultiplier: 1,
    distortionMultiplier: 1,
  },
  ultra: {
    particleMultiplier: 1.18,
    lightningBranchMultiplier: 1.15,
    iceShardMultiplier: 1.12,
    smokeMultiplier: 1.08,
    enableSecondaryLights: true,
    enableDecorativeCircles: true,
    laserLayerMultiplier: 1.08,
    distortionMultiplier: 1.18,
  },
};

export function mageQualityProfile(quality: MageVFXQuality): MageVFXQualityProfile {
  return MAGE_VFX_QUALITY_PROFILES[quality] ?? MAGE_VFX_QUALITY_PROFILES.medium;
}

function multipliers(low = 0.45, medium = 0.75, high = 1, ultra = high * 1.15): Readonly<Record<MageVFXQuality, number>> {
  return { low, medium, high, ultra };
}

export const MAGE_SPELL_PRESETS: Readonly<Record<MageSpellId, MageSpellPreset>> = {
  basic: {
    id: 'basic',
    style: 'arcane',
    delivery: 'projectile',
    colors: {
      core: 0xf4fbff,
      glow: 0x5eb7ff,
      secondary: 0x8d55ff,
      spark: 0xc7e9ff,
      smoke: 0x725bc8,
    },
    timeline: {
      chargeStart: 0.1,
      magicCircle: 0.22,
      launch: 0.42,
      chargeEnd: 0.52,
      recover: 0.78,
      end: 1,
    },
    charge: { scale: 1, particleCount: 18, sparkCount: 5, lightIntensity: 0.75, twoHanded: false },
    projectile: { speed: 18, lifetime: 1.2, radius: 0.42, trailLength: 1.3, trailWidth: 0.08 },
    impact: {
      duration: 0.52,
      radius: 0.75,
      shockwaveRadius: 1.35,
      cameraShakeIntensity: 0.02,
      cameraShakeDuration: 0.12,
      lightIntensity: 0.85,
      particleCount: 34,
      debrisCount: 0,
    },
    hand: 'right',
    qualityParticleMultiplier: multipliers(0.45, 0.75, 1),
    audio: { charge: 'mage-basic-charge', cast: 'mage-basic-cast', impact: 'mage-basic-impact' },
  },
  water: {
    id: 'water',
    style: 'water',
    delivery: 'projectile',
    colors: { core: 0xe8fcff, glow: 0x52d8ff, secondary: 0x1b84ff, spark: 0xb9f7ff, smoke: 0x9bdfff },
    timeline: { chargeStart: 0.1, secondaryCharge: 0.28, magicCircle: 0.34, launch: 0.52, chargeEnd: 0.64, recover: 0.84, end: 1 },
    charge: { scale: 1.1, particleCount: 34, sparkCount: 7, lightIntensity: 0.72, twoHanded: true },
    projectile: { speed: 15.5, lifetime: 1.45, radius: 0.5, trailLength: 1.55, trailWidth: 0.13 },
    impact: { duration: 0.66, radius: 0.95, shockwaveRadius: 1.75, cameraShakeIntensity: 0.018, cameraShakeDuration: 0.12, lightIntensity: 0.65, particleCount: 48, debrisCount: 0 },
    hand: 'both',
    qualityParticleMultiplier: multipliers(0.42, 0.78, 1),
    audio: { charge: 'mage-water-charge', cast: 'mage-water-cast', impact: 'mage-water-impact' },
  },
  lightning: {
    id: 'lightning',
    style: 'lightning',
    delivery: 'instant-lightning',
    colors: { core: 0xffffff, glow: 0x67e8ff, secondary: 0x6d5bff, spark: 0xe6fdff, smoke: 0x99ccff },
    timeline: { chargeStart: 0.08, secondaryCharge: 0.18, magicCircle: 0.24, launch: 0.38, chargeEnd: 0.52, recover: 0.78, end: 1 },
    charge: { scale: 0.95, particleCount: 22, sparkCount: 13, lightIntensity: 1.1, twoHanded: true },
    projectile: { speed: 34, lifetime: 0.35, radius: 0.46, trailLength: 2.1, trailWidth: 0.09 },
    impact: { duration: 0.44, radius: 0.92, shockwaveRadius: 1.35, cameraShakeIntensity: 0.032, cameraShakeDuration: 0.13, lightIntensity: 1.15, particleCount: 44, debrisCount: 0 },
    lightning: { duration: 0.2, segments: 12, branches: 5, jitter: 0.38 },
    hand: 'right',
    qualityParticleMultiplier: multipliers(0.5, 0.8, 1),
    audio: { charge: 'mage-lightning-charge', cast: 'mage-lightning-cast', impact: 'mage-lightning-impact' },
  },
  lava: {
    id: 'lava',
    style: 'lava',
    delivery: 'projectile',
    colors: { core: 0xfff0c4, glow: 0xff6a14, secondary: 0xb81910, spark: 0xffc247, smoke: 0x53413d },
    timeline: { chargeStart: 0.12, secondaryCharge: 0.3, magicCircle: 0.38, launch: 0.48, chargeEnd: 0.62, recover: 0.84, end: 1 },
    charge: { scale: 1.2, particleCount: 30, sparkCount: 12, lightIntensity: 1.25, twoHanded: false },
    projectile: { speed: 13.5, lifetime: 1.35, radius: 0.58, trailLength: 1.35, trailWidth: 0.16 },
    impact: { duration: 0.82, radius: 1.12, shockwaveRadius: 2, cameraShakeIntensity: 0.06, cameraShakeDuration: 0.22, lightIntensity: 1.55, particleCount: 58, debrisCount: 10 },
    hand: 'right',
    qualityParticleMultiplier: multipliers(0.45, 0.78, 1),
    audio: { charge: 'mage-lava-charge', cast: 'mage-lava-cast', impact: 'mage-lava-impact' },
  },
  ice: {
    id: 'ice',
    style: 'ice',
    delivery: 'projectile',
    colors: { core: 0xffffff, glow: 0x92e9ff, secondary: 0x4c83ff, spark: 0xe7fbff, smoke: 0xb6efff },
    timeline: { chargeStart: 0.1, secondaryCharge: 0.32, magicCircle: 0.38, launch: 0.5, chargeEnd: 0.64, recover: 0.86, end: 1 },
    charge: { scale: 1.05, particleCount: 26, sparkCount: 8, lightIntensity: 0.9, twoHanded: false },
    projectile: { speed: 17, lifetime: 1.25, radius: 0.48, trailLength: 1.6, trailWidth: 0.1 },
    impact: { duration: 0.66, radius: 1, shockwaveRadius: 1.7, cameraShakeIntensity: 0.032, cameraShakeDuration: 0.15, lightIntensity: 0.9, particleCount: 44, debrisCount: 12 },
    hand: 'right',
    qualityParticleMultiplier: multipliers(0.45, 0.75, 1),
    audio: { charge: 'mage-ice-charge', cast: 'mage-ice-cast', impact: 'mage-ice-impact' },
  },
  laser: {
    id: 'laser',
    style: 'laser',
    delivery: 'beam',
    colors: { core: 0xffffff, glow: 0xb55cff, secondary: 0x49d7ff, spark: 0xf0d5ff, smoke: 0x996cff },
    timeline: { chargeStart: 0.08, secondaryCharge: 0.34, magicCircle: 0.42, launch: 0.58, chargeEnd: 0.78, recover: 0.94, end: 1 },
    charge: { scale: 1.45, particleCount: 44, sparkCount: 14, lightIntensity: 1.4, twoHanded: true },
    projectile: { speed: 42, lifetime: 0.65, radius: 0.55, trailLength: 2.4, trailWidth: 0.2 },
    impact: { duration: 0.5, radius: 1.05, shockwaveRadius: 1.75, cameraShakeIntensity: 0.045, cameraShakeDuration: 0.18, lightIntensity: 1.2, particleCount: 42, debrisCount: 0 },
    laser: { duration: 0.52, outerWidth: 0.56, bodyWidth: 0.26, coreWidth: 0.08, impactPulseInterval: 0.12 },
    hand: 'both',
    qualityParticleMultiplier: multipliers(0.55, 0.84, 1),
    audio: { charge: 'mage-laser-charge', cast: 'mage-laser-cast', impact: 'mage-laser-impact', loop: 'mage-laser-loop' },
  },
};
