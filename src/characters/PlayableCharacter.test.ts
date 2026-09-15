import { describe, expect, it } from 'vitest';
import { getPlayableCharacters } from './CharacterCatalog';

describe('playable character policy', () => {
  it('starts with the animated warrior GLB as the only playable model', () => {
    expect(
      getPlayableCharacters().map(({ id, name, modelPath, gameScale, previewScale, clipMap }) => ({
        id,
        name,
        modelPath,
        gameScale,
        previewScale,
        clipMap,
      }))
    ).toEqual([
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
    ]);
  });
});
