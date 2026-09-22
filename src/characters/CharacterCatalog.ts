import type { RootMotionAxis } from './AnimationClipAdapter';

export type CharacterId = 'dragon-miner' | 'paladin' | 'mage';
export type PlayableCharacterId = 'paladin' | 'mage';

export type CharacterAnimationState =
  | 'idle'
  | 'running'
  | 'attacking'
  | 'hit'
  | 'dead';

export const WARRIOR_ATTACK_IDS = [
  'ataque_basico',
  'ataque_giratorio',
  'ataque_giratorio_2',
  'pulo_atacando',
  'triplo_ataque',
  'corte_duplo',
] as const;

export type WarriorAttackId = typeof WARRIOR_ATTACK_IDS[number];

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  modelPath: string;
  /** Optional high-quality/lobby-only model; gameplay systems keep modelPath. */
  lobbyModelPath?: string;
  /** When true, lobby must never silently fall back to gameplay modelPath. */
  strictLobbyModel?: boolean;
  gameScale: number;
  /** Additional vertical gameplay placement after model grounding, in world meters. */
  gameYOffset?: number;
  previewScale: number;
  previewYOffset?: number;
  /** Optional lobby depth offset; negative values move the preview farther from the camera. */
  previewZOffset?: number;
  classRole?: string;
  classSummary?: string;
  initialWeaponLabel?: string;
  clipMap: Partial<Record<CharacterAnimationState, string>>;
  clipAliases?: Partial<Record<CharacterAnimationState, readonly string[]>>;
  idlePoseSource?: string;
  attackClipNames?: readonly WarriorAttackId[];
  /** Maps shared combat skill ids to authored clip names when a class uses different GLB action names. */
  attackClipMap?: Partial<Record<WarriorAttackId, string>>;
  fallbackModelPath?: string;
  inPlaceAxes?: readonly RootMotionAxis[];
  animationTimeScale?: Partial<Record<CharacterAnimationState, number>>;
  /**
   * By default root-motion axes are pinned to the first frame of the reference
   * clip. Some imported rigs carry a converted root track far away from their
   * bind pose; those need the authored rest translation instead to stay grounded.
   */
  rootMotionReference?: 'clip-start' | 'rest-pose';
  fallbackCharacterId?: CharacterId;
  fallbackClipMap?: Partial<Record<CharacterAnimationState, string>>;
}

export const CHARACTERS: readonly CharacterDefinition[] = [
  {
    id: 'dragon-miner',
    name: 'Dragon Miner',
    modelPath: '/models/dragonminer-optimized.glb',
    gameScale: 0.9,
    previewScale: 0.9,
    previewYOffset: -0.72,
    inPlaceAxes: ['x', 'y'],
    clipMap: {
      idle: 'idle',
      attacking: 'ataque',
    },
    animationTimeScale: {
      attacking: 4.5,
    },
    fallbackCharacterId: 'paladin',
    fallbackClipMap: {
      running: 'correndo',
      hit: 'recebe_dano',
      dead: 'morte',
    },
  },
  {
    id: 'paladin',
    name: 'Guerreiro',
    modelPath: '/models/Guerreiro/guerreiro_animado.glb',
    gameScale: 125,
    previewScale: 90,
    classRole: 'Vanguarda • corpo a corpo • força',
    classSummary: 'Vanguarda de espada, resistente e focado em ataques de curto alcance.',
    initialWeaponLabel: 'Espada do Recruta',
    inPlaceAxes: ['x', 'y'],
    clipMap: {
      idle: 'idle_sword',
      running: 'correndo',
      attacking: 'ataque_basico',
      hit: 'recebe_dano',
      dead: 'morte',
    },
    clipAliases: {
      idle: ['Idle'],
      running: ['running'],
      attacking: ['ataque'],
      hit: ['hit'],
    },
    attackClipNames: WARRIOR_ATTACK_IDS,
    animationTimeScale: {
      attacking: 1.45,
    },
  },
  {
    id: 'mage',
    name: 'Maga',
    modelPath: '/models/Maga/Maga-optimized.glb',
    lobbyModelPath: '/models/Maga/Maga.glb',
    strictLobbyModel: true,
    // Match the Mage gameplay silhouette to Guerreiro/guerreiro_animado.glb.
    // The Mage rig is authored in different units, so this smaller scale keeps
    // her apparent in-dungeon height close to the Warrior instead of giant.
    gameScale: 2.25,
    // Same placement policy as Guerreiro, with only the proportional Mage boot
    // lift needed after body-grounding so the feet sit clearly on the stone floor.
    gameYOffset: 0.9,
    previewScale: 1.78,
    // Lobby-only framing/rotation uses the same bounds-centered pivot as Guerreiro;
    // keep her framed lower than the warrior, but a little higher/smaller and
    // farther back so the face texture is not over-magnified in the lobby.
    previewYOffset: -0.12,
    previewZOffset: -0.42,
    classRole: 'Arcana • longo alcance • magia',
    classSummary: 'Conjuradora arcana preparada para magias e combate à distância.',
    initialWeaponLabel: 'Cajado Arcano',
    // Her Mixamo root translation is exported in a converted coordinate basis
    // and lifts the skinned mesh above the lobby when played as-is. Lock every
    // root component to the bind/rest position so only the pose animation moves.
    inPlaceAxes: ['x', 'y', 'z'],
    rootMotionReference: 'rest-pose',
    clipMap: {
      idle: 'idle',
      running: 'correr rapido2',
      attacking: 'ataque basico',
      hit: 'hit',
      dead: 'morrendo',
    },
    clipAliases: {
      // Never use the generic Mixamo export name as a Mage run fallback: in the
      // current asset that clip is a death/fall motion, not locomotion.
      running: [
        'correr rápido2',
        'correr rapido 2',
        'correr rápido 2',
        'correr rapido',
        'correr rápido',
        'correr_rapido2',
        'correr_rapido_2',
        'corrida rapida2',
        'corrida rápida2',
        'correr',
        'correndo',
        'andar',
        'andando',
        'run fast2',
        'fast run2',
        'running',
        'run',
        'walking',
        'walk',
        'correr para tras',
      ],
      attacking: ['ataque agua', 'ataque gelo', 'ataque choque', 'ataque laser'],
      hit: ['Hit'],
      dead: ['death', 'morte'],
    },
    attackClipMap: {
      ataque_basico: 'ataque basico',
      ataque_giratorio: 'ataque agua',
      ataque_giratorio_2: 'ataque gelo',
      pulo_atacando: 'ataque choque',
      triplo_ataque: 'ataque laser',
      corte_duplo: 'ataque de larva',
    },
    animationTimeScale: {
      // Running now follows the same base playback policy as Guerreiro: the
      // authored fast-run clip drives the cadence, while Player adjusts only
      // the small movement-speed playback range at runtime.
      attacking: 1,
    },
  },
] as const;

export const PLAYABLE_CHARACTER_IDS = ['paladin', 'mage'] as const satisfies readonly PlayableCharacterId[];
export const PLAYABLE_CHARACTER_ID: PlayableCharacterId = 'paladin';

export function isPlayableCharacterId(id: unknown): id is PlayableCharacterId {
  return typeof id === 'string'
    && (PLAYABLE_CHARACTER_IDS as readonly string[]).includes(id);
}

export function getPlayableCharacters(): readonly CharacterDefinition[] {
  return CHARACTERS.filter(({ id }) => isPlayableCharacterId(id));
}

export function getCharacterDefinition(id: CharacterId): CharacterDefinition {
  const definition = CHARACTERS.find((character) => character.id === id);
  if (!definition) throw new Error(`Personagem desconhecido: ${id}`);
  return definition;
}
