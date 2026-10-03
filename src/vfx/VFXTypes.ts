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
  /**
   * Cometa incandescente: cabeça esticada no sentido do voo, cauda de brasa
   * comprida e uma faixa de fumaça incandescente atrás. É o projétil do ataque
   * básico da Maga (referência: o cometa/meteoro de fogo da imagem enviada —
   * núcleo branco-quente, corpo laranja-avermelhado, brasas soltas no rastro).
   */
  readonly comet?: {
    /** Alongamento da cabeça no sentido do voo (múltiplos do raio). */
    readonly headStretch: number;
    /** Multiplicador do comprimento da cauda em relação ao rastro base. */
    readonly tailLength: number;
    /** Largura da faixa de fumaça incandescente. */
    readonly smokeWidth: number;
    /** Brasas soltas que ficam para trás no rastro. */
    readonly emberCount: number;
    /** Escala das brasas (menores = pontos mais finos). */
    readonly emberSize: number;
  };
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
  /**
   * Sigilo rúnico carimbado no chão sob o impacto. É a assinatura do ataque
   * básico: dá peso ao golpe sem precisar de uma explosão grande.
   */
  readonly runeSigil?: {
    /** Raio final do sigilo, em metros. */
    readonly radius: number;
    /** Giro das duas camadas concêntricas (rad/s). */
    readonly spin: number;
    /** Intensidade do brilho do sigilo. */
    readonly intensity: number;
    /**
     * Carimba o sigilo no CHÃO sob o impacto em vez de deixá-lo na altura do
     * golpe. O impacto de um feitiço costuma acontecer no peito do monstro, e
     * um selo "de chão" ali dentro do corpo não seria visto.
     */
    readonly groundStamp?: boolean;
  };
  /** Coluna de luz vertical no impacto (leitura forte de longe). */
  readonly pillar?: {
    readonly height: number;
    readonly radius: number;
  };
  /** Estilhaços rúnicos em estrela, disparados para fora no impacto. */
  readonly spikes?: {
    readonly count: number;
    readonly length: number;
  };
  /**
   * Jatos de plasma que rasgam o impacto para fora. São riscos finos e
   * alongados, não fagulhas redondas: é o que dá a leitura "elétrica" do
   * plasma em vez de uma explosão genérica.
   */
  readonly jets?: {
    readonly count: number;
    /** Comprimento do jato em metros. */
    readonly length: number;
  };
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
  /**
   * Clarão do disparo (a "explosão" curta na mão do conjurador no momento em
   * que o feitiço sai). Quando ausente, o clarão deriva do preset de impacto;
   * presets rápidos usam este bloco para um estouro pequeno e discreto.
   */
  readonly muzzle?: {
    /** Multiplicador de tamanho do clarão na mão. */
    readonly scale: number;
    readonly particleCount: number;
    /** Intensidade da luz do clarão na mão. */
    readonly lightIntensity: number;
  };
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
