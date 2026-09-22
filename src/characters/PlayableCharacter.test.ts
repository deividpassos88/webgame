import { describe, expect, it } from 'vitest';
import { getPlayableCharacters } from './CharacterCatalog';

describe('playable character policy', () => {
  it('offers Guerreiro and Maga as playable class choices', () => {
    expect(
      getPlayableCharacters().map(({ id, name, modelPath, lobbyModelPath, gameScale, gameYOffset, previewScale, previewYOffset, previewZOffset, clipMap }) => ({
        id,
        name,
        modelPath,
        lobbyModelPath,
        gameScale,
        gameYOffset,
        previewScale,
        previewYOffset,
        previewZOffset,
        clipMap,
      }))
    ).toEqual([
      {
        id: 'paladin',
        name: 'Guerreiro',
        modelPath: '/models/Guerreiro/guerreiro_animado.glb',
        lobbyModelPath: undefined,
        gameScale: 125,
        gameYOffset: undefined,
        previewScale: 90,
        previewYOffset: undefined,
        previewZOffset: undefined,
        clipMap: {
          idle: 'idle_sword',
          running: 'correndo',
          attacking: 'ataque_basico',
          hit: 'recebe_dano',
          dead: 'morte',
        },
      },
      {
        id: 'mage',
        name: 'Maga',
        modelPath: '/models/Maga/Maga-optimized.glb',
        lobbyModelPath: '/models/Maga/Maga_High.glb',
        gameScale: 2.25,
        gameYOffset: 0.9,
        previewScale: 1.78,
        previewYOffset: -0.12,
        previewZOffset: -0.42,
        clipMap: {
          idle: 'idle',
          running: 'correr rapido2',
          attacking: 'ataque basico',
          hit: 'hit',
          dead: 'morrendo',
        },
      },
    ]);
  });
});
