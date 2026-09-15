import type { RootMotionAxis } from './AnimationClipAdapter';

export type CharacterId = 'dragon-miner' | 'paladin';

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
  gameScale: number;
  previewScale: number;
  previewYOffset?: number;
  clipMap: Partial<Record<CharacterAnimationState, string>>;
  clipAliases?: Partial<Record<CharacterAnimationState, readonly string[]>>;
  idlePoseSource?: string;
  attackClipNames?: readonly WarriorAttackId[];
  fallbackModelPath?: string;
  inPlaceAxes?: readonly RootMotionAxis[];
  animationTimeScale?: Partial<Record<CharacterAnimationState, number>>;
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
] as const;

export const PLAYABLE_CHARACTER_ID: CharacterId = 'paladin';

export function getPlayableCharacters(): readonly CharacterDefinition[] {
  return CHARACTERS.filter(({ id }) => id === PLAYABLE_CHARACTER_ID);
}

export function getCharacterDefinition(id: CharacterId): CharacterDefinition {
  const definition = CHARACTERS.find((character) => character.id === id);
  if (!definition) throw new Error(`Personagem desconhecido: ${id}`);
  return definition;
}
