import { describe, expect, it } from 'vitest';
import { getPlayableCharacters } from './CharacterCatalog';

describe('playable character policy', () => {
  it('includes warrior and maga as playable models', () => {
    const characters = getPlayableCharacters().map(({ id, name, modelPath, gameScale, previewScale, clipMap }) => ({
      id,
      name,
      modelPath,
      gameScale,
      previewScale,
      clipMap,
    }));
    expect(characters).toEqual(
      expect.arrayContaining([
        {
          id: 'paladin',
          name: 'Guerreiro',
          modelPath: '/models/Guerreiro/guerreiro_animado.glb',
          gameScale: 125,
          previewScale: 90,
          clipMap: {
            idle: 'idle_sword',
            running: 'correndo',
            attacking: 'ataque_basico',
            hit: 'recebe_dano',
            dead: 'morte',
          },
        },
        {
          id: 'maga',
          name: 'Maga',
          modelPath: '/models/maga.glb',
          gameScale: 11,
          previewScale: 8,
          clipMap: {
            idle: 'idle',
            running: 'correr para frente',
            attacking: 'ataque basico',
            hit: 'hit',
            dead: 'morrendo',
          },
        },
      ])
    );
    expect(characters).toHaveLength(2);
  });
});
