import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterDefinition } from './CharacterCatalog';
import {
  CharacterAssetStore,
  type CharacterModelLoader,
} from './CharacterAssetStore';

function asset(name: string): GLTF {
  const scene = new THREE.Group();
  scene.name = name;
  return {
    scene,
    scenes: [scene],
    animations: [],
    cameras: [],
    asset: {},
  } as unknown as GLTF;
}

function definition(fallbackModelPath?: string): CharacterDefinition {
  return {
    id: 'paladin',
    name: 'Guerreiro',
    modelPath: '/models/primary.glb',
    ...(fallbackModelPath ? { fallbackModelPath } : {}),
    gameScale: 1,
    previewScale: 1,
    clipMap: {},
  };
}

describe('CharacterAssetStore', () => {
  it('loads the primary model once and exposes no error or warning', async () => {
    const requested: string[] = [];
    const loader: CharacterModelLoader = {
      async loadAsync(path) {
        requested.push(path);
        return asset(path);
      },
    };
    const store = new CharacterAssetStore(loader);

    await store.loadAll(undefined, [definition()]);

    expect(requested).toEqual(['/models/primary.glb']);
    expect(store.has('paladin')).toBe(true);
    expect(store.getError('paladin')).toBeUndefined();
    expect(store.getFallbackWarning('paladin')).toBeUndefined();
  });

  it('can load a separate lobby model while keeping gameplay on the optimized asset', async () => {
    const requested: string[] = [];
    const loader: CharacterModelLoader = {
      async loadAsync(path) {
        requested.push(path);
        return asset(path);
      },
    };
    const store = new CharacterAssetStore(loader);
    const mageDefinition = {
      ...definition(),
      id: 'mage' as const,
      name: 'Maga',
      modelPath: '/models/Maga/Maga-optimized.glb',
      lobbyModelPath: '/models/Maga/Maga.glb',
    };

    await store.loadAll(undefined, [mageDefinition]);

    expect(requested).toEqual(['/models/Maga/Maga-optimized.glb', '/models/Maga/Maga.glb']);
    expect(store.createModel('mage').name).toBe('/models/Maga/Maga-optimized.glb');
    expect(store.createModel('mage', 'lobby').name).toBe('/models/Maga/Maga.glb');
  });

  it('does not fall back to the gameplay model when a strict lobby model fails', async () => {
    const lobbyFailure = new Error('lobby missing');
    const requested: string[] = [];
    const loader: CharacterModelLoader = {
      async loadAsync(path) {
        requested.push(path);
        if (path === '/models/Maga/Maga.glb') throw lobbyFailure;
        return asset(path);
      },
    };
    const store = new CharacterAssetStore(loader);
    const mageDefinition = {
      ...definition(),
      id: 'mage' as const,
      name: 'Maga',
      modelPath: '/models/Maga/Maga-optimized.glb',
      lobbyModelPath: '/models/Maga/Maga.glb',
      strictLobbyModel: true,
    };

    await store.loadAll(undefined, [mageDefinition]);

    expect(requested).toEqual(['/models/Maga/Maga-optimized.glb', '/models/Maga/Maga.glb']);
    expect(store.has('mage')).toBe(true);
    expect(store.has('mage', 'lobby')).toBe(false);
    expect(store.createModel('mage').name).toBe('/models/Maga/Maga-optimized.glb');
    expect(() => store.createModel('mage', 'lobby')).toThrow('Modelo de lobby não carregado: mage');
    expect(store.getFallbackWarning('mage')).toBe(lobbyFailure);
  });

  it('loads the fallback after a primary failure and retains a non-fatal warning', async () => {
    const primaryFailure = new Error('primary missing');
    const requested: string[] = [];
    const loader: CharacterModelLoader = {
      async loadAsync(path) {
        requested.push(path);
        if (path === '/models/primary.glb') throw primaryFailure;
        return asset(path);
      },
    };
    const store = new CharacterAssetStore(loader);

    await store.loadAll(undefined, [definition('/models/fallback.glb')]);

    expect(requested).toEqual(['/models/primary.glb', '/models/fallback.glb']);
    expect(store.has('paladin')).toBe(true);
    expect(store.getError('paladin')).toBeUndefined();
    expect(store.getFallbackWarning('paladin')).toBe(primaryFailure);
  });

  it('retains both original failures when primary and fallback loading fail', async () => {
    const primaryFailure = new Error('primary missing');
    const fallbackFailure = new Error('fallback missing');
    const loader: CharacterModelLoader = {
      async loadAsync(path) {
        if (path === '/models/primary.glb') throw primaryFailure;
        throw fallbackFailure;
      },
    };
    const store = new CharacterAssetStore(loader);

    await store.loadAll(undefined, [definition('/models/fallback.glb')]);

    expect(store.has('paladin')).toBe(false);
    expect(store.getError('paladin')).toEqual({
      primary: primaryFailure,
      fallback: fallbackFailure,
    });
    expect(store.getFallbackWarning('paladin')).toBeUndefined();
  });

  it('reports progress exactly once for a definition even when fallback is used', async () => {
    const progress: Array<[number, number, string]> = [];
    const loader: CharacterModelLoader = {
      async loadAsync(path) {
        if (path === '/models/primary.glb') throw new Error('primary missing');
        return asset(path);
      },
    };
    const store = new CharacterAssetStore(loader);

    await store.loadAll(
      (completed, total, characterId) => progress.push([completed, total, characterId]),
      [definition('/models/fallback.glb')]
    );

    expect(progress).toEqual([[1, 1, 'paladin']]);
  });
});
