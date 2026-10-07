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
  /**
   * Basic attack: the ice comet from the reference sheet — a bright dart head
   * with a silk tail. It is the Mage's spam attack, so the particle counts stay
   * modest, but the projectile itself has to read from the gameplay camera:
   * ~4.1 m x 1.37 m of sprite (~3:1), 50% larger in both dimensions.
   * Only visual multipliers grow: speed, collision radius and cast timing stay put.
   */
  basic: {
    id: 'basic',
    style: 'arcane',
    delivery: 'projectile',
    colors: {
      core: 0xf6fcff,
      glow: 0x6fd6ff,
      secondary: 0x1f6bff,
      spark: 0xd8f4ff,
      smoke: 0xbfe4f7,
    },
    timeline: {
      // Clip do "ataque basico" da Maga = 1,8 s. A conjuração tem que ser um
      // piscar: o brilho nasce 0,1 s antes do tiro sair (0.30 -> 0.36) e some
      // junto com o disparo. Antes ele acendia em 0.12 (0,22 s) e ficava na mão
      // até 0,83 s — era o borrão que continuava brilhando enquanto ela andava.
      chargeStart: 0.3,
      // No hand magic circle: repeated palm seals made the basic attack noisy.
      // Normalized fractions of the cast clip, so they scale with the Mage
      // basic tempo (MAGE_BASIC_ATTACK_PLAYBACK_RATE in Player.ts).
      launch: 0.36,
      chargeEnd: 0.4,
      recover: 0.72,
      end: 1,
    },
    // Conjuração reduzida a um brilho na mão: sem poeira girando e sem faísca
    // (0 desliga as duas nuvens). O que importa é a luz que anuncia o tiro.
    charge: { scale: 0.5, particleCount: 0, sparkCount: 0, lightIntensity: 0.55, twoHanded: false },
    projectile: {
      speed: 25,
      lifetime: 1.1,
      radius: 0.38,
      trailLength: 0.85,
      trailWidth: 0.05,
      shape: 'bullet',
      // Accompanies the larger dart, but remains under 0.7 m so the aura
      // cannot swallow its pointed silhouette in a round white flash.
      haloScale: 1.8,
      haloOpacity: 0.5,
      comet: {
        // Enlarge only the painted dart and its silk tail, not the hitbox.
        // 0.38 * (10.8, 3.6) = 4.104 m x 1.368 m, preserving the 3:1 shape.
        widthScale: 3.6,
        lengthScale: 10.8,
        headLength: 0.3,
        intensity: 1.7,
        sparkles: 6,
        haze: 0.45,
        filaments: 1.25,
        wisp: 1,
        // A fita de energia antiga sai de cena: a cauda agora é a seda do
        // próprio sprite, e as duas juntas viravam um rastro duplo.
        trailOpacity: 0,
      },
      // A cauda principal agora é a seda do sprite; esta fumaça no espaço do
      // mundo entra só como névoa fina atrás do cometa (0 na contagem = desliga).
      frost: {
        color: 0xcfeaff,
        count: 1,
        interval: 0.05,
        size: [1.4, 3],
        speed: 0.42,
        spread: 0.7,
        lifetime: 0.5,
        opacity: 0.34,
        upwardBias: 0.22,
        growth: 1.1,
        blending: 'additive',
      },
    },
    impact: {
      // Sem efeito visual nenhum (pedido do usuário): nada de explosão, clarão,
      // anel, partícula, luz ou tremor de câmera. Quem marca o acerto é só o
      // vermelho fraco que tinge o inimigo por ~0,2 s (`Enemy.takeDamage`).
      // Os números ficam aqui (e são ajustáveis no laboratório) para o caso de
      // o efeito voltar ligado.
      visual: false,
      duration: 0.78,
      radius: 1.05,
      shockwaveRadius: 2.25,
      cameraShakeIntensity: 0.034,
      cameraShakeDuration: 0.18,
      lightIntensity: 1.15,
      particleCount: 54,
      debrisCount: 18,
    },
    hand: 'right',
    qualityParticleMultiplier: multipliers(0.45, 0.75, 1),
    audio: { charge: 'mage-basic-charge', cast: 'mage-basic-cast', impact: 'mage-basic-impact' },
  },
  water: {
    id: 'water',
    style: 'water',
    delivery: 'water-column',
    colors: { core: 0xe8fcff, glow: 0x52d8ff, secondary: 0x1b84ff, spark: 0xb9f7ff, smoke: 0x9bdfff },
    // Dragão das Marés: the body-scale spiral replaces hand seals; the
    // authored cast climax summons a falling water column at the target.
    timeline: { chargeStart: 0.04, launch: 0.52, chargeEnd: 0.54, recover: 0.84, end: 1 },
    charge: { scale: 0.85, particleCount: 16, sparkCount: 4, lightIntensity: 0.6, twoHanded: true },
    projectile: { speed: 22, lifetime: 1.45, radius: 0.5, trailLength: 1.55, trailWidth: 0.13 },
    impact: { duration: 0.44, radius: 0.95, shockwaveRadius: 1.75, cameraShakeIntensity: 0.018, cameraShakeDuration: 0.12, lightIntensity: 0.65, particleCount: 32, debrisCount: 0 },
    hand: 'both',
    qualityParticleMultiplier: multipliers(0.42, 0.78, 1),
    audio: { charge: 'mage-water-charge', cast: 'mage-water-cast', impact: 'mage-water-impact' },
  },
  lightning: {
    id: 'lightning',
    style: 'lightning',
    delivery: 'instant-lightning',
    colors: { core: 0xffffff, glow: 0x67e8ff, secondary: 0x6d5bff, spark: 0xe6fdff, smoke: 0x99ccff },
    // A short electric pulse at the right palm, not three stacked seals and
    // dozens of full-size lightning sprites covering the caster. Keep launch
    // on the authored gesture; Player speeds the whole clip up to 2.1x.
    timeline: { chargeStart: 0.22, launch: 0.38, chargeEnd: 0.4, recover: 0.78, end: 1 },
    charge: { scale: 0.62, particleCount: 0, sparkCount: 4, lightIntensity: 0.55, twoHanded: false },
    projectile: { speed: 34, lifetime: 0.35, radius: 0.46, trailLength: 2.1, trailWidth: 0.09 },
    impact: { duration: 0.28, radius: 0.68, shockwaveRadius: 1.1, cameraShakeIntensity: 0.022, cameraShakeDuration: 0.1, lightIntensity: 0.8, particleCount: 18, debrisCount: 0 },
    lightning: { duration: 0.18, segments: 12, branches: 3, jitter: 0.26 },
    hand: 'right',
    qualityParticleMultiplier: multipliers(0.5, 0.8, 1),
    audio: { charge: 'mage-lightning-charge', cast: 'mage-lightning-cast', impact: 'mage-lightning-impact' },
  },
  lava: {
    id: 'lava',
    style: 'lava',
    delivery: 'projectile',
    colors: { core: 0xfff0c4, glow: 0xff6a14, secondary: 0xb81910, spark: 0xffc247, smoke: 0x53413d },
    timeline: { chargeStart: 0.16, secondaryCharge: 0.3, magicCircle: 0.38, launch: 0.48, chargeEnd: 0.5, recover: 0.84, end: 1 },
    charge: { scale: 0.9, particleCount: 14, sparkCount: 5, lightIntensity: 0.9, twoHanded: false },
    projectile: { speed: 20, lifetime: 1.35, radius: 0.58, trailLength: 1.35, trailWidth: 0.16 },
    impact: { duration: 0.55, radius: 1.12, shockwaveRadius: 2, cameraShakeIntensity: 0.06, cameraShakeDuration: 0.22, lightIntensity: 1.55, particleCount: 38, debrisCount: 10 },
    hand: 'right',
    qualityParticleMultiplier: multipliers(0.45, 0.78, 1),
    audio: { charge: 'mage-lava-charge', cast: 'mage-lava-cast', impact: 'mage-lava-impact' },
  },
  ice: {
    id: 'ice',
    style: 'ice',
    delivery: 'projectile',
    colors: { core: 0xffffff, glow: 0x92e9ff, secondary: 0x4c83ff, spark: 0xe7fbff, smoke: 0xb6efff },
    timeline: { chargeStart: 0.18, secondaryCharge: 0.32, magicCircle: 0.38, launch: 0.5, chargeEnd: 0.52, recover: 0.86, end: 1 },
    charge: { scale: 0.8, particleCount: 12, sparkCount: 4, lightIntensity: 0.65, twoHanded: false },
    // Visual antigo (cone voando + explosão no acerto) removido: a onda de
    // cristais (IceCrystalWaveVFX) é o único desenho da skill 2. O projétil
    // invisível segue carregando dano/alcance/recarga; o tremor e o som do
    // impacto continuam.
    projectile: { speed: 24, lifetime: 1.25, radius: 0.48, trailLength: 1.6, trailWidth: 0.1, visual: false },
    impact: { duration: 0.42, radius: 1, shockwaveRadius: 1.7, cameraShakeIntensity: 0.032, cameraShakeDuration: 0.15, lightIntensity: 0.9, particleCount: 30, debrisCount: 12 },
    hand: 'right',
    qualityParticleMultiplier: multipliers(0.45, 0.75, 1),
    audio: { charge: 'mage-ice-charge', cast: 'mage-ice-cast', impact: 'mage-ice-impact' },
  },
  laser: {
    id: 'laser',
    style: 'laser',
    delivery: 'beam',
    colors: { core: 0xffffff, glow: 0xb55cff, secondary: 0x49d7ff, spark: 0xf0d5ff, smoke: 0x996cff },
    timeline: { chargeStart: 0.28, secondaryCharge: 0.34, magicCircle: 0.42, launch: 0.58, chargeEnd: 0.6, recover: 0.94, end: 1 },
    charge: { scale: 1.05, particleCount: 18, sparkCount: 6, lightIntensity: 1, twoHanded: true },
    projectile: { speed: 42, lifetime: 0.65, radius: 0.55, trailLength: 2.4, trailWidth: 0.2 },
    impact: { duration: 0.36, radius: 1.05, shockwaveRadius: 1.75, cameraShakeIntensity: 0.045, cameraShakeDuration: 0.18, lightIntensity: 1.2, particleCount: 30, debrisCount: 0 },
    laser: { duration: 0.36, outerWidth: 0.46, bodyWidth: 0.22, coreWidth: 0.07, impactPulseInterval: 0.1 },
    hand: 'both',
    qualityParticleMultiplier: multipliers(0.55, 0.84, 1),
    audio: { charge: 'mage-laser-charge', cast: 'mage-laser-cast', impact: 'mage-laser-impact', loop: 'mage-laser-loop' },
  },
};
