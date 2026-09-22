import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
  GLTFLoader,
  type GLTF,
} from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  CHARACTERS,
  type CharacterDefinition,
  type CharacterId,
} from './CharacterCatalog';

/*
 * The decoder ships with the app (public/draco, copied to /draco by Vite).
 * It used to be fetched from a public CDN, which added a network dependency
 * on every cold start and broke the models entirely when it was unreachable.
 */
const DRACO_DECODER_PATH = '/draco/';

export type CharacterLoadProgress = (
  completed: number,
  total: number,
  characterId: CharacterId
) => void;

export type CharacterAssetVariant = 'gameplay' | 'lobby';

export interface CharacterModelLoader {
  loadAsync(path: string): Promise<GLTF>;
}

function createDefaultLoader(): GLTFLoader {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  dracoLoader.setDecoderConfig({ type: 'wasm' });

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

export class CharacterAssetStore {
  private readonly assets = new Map<CharacterId, GLTF>();
  private readonly lobbyAssets = new Map<CharacterId, GLTF>();
  private readonly strictLobbyAssets = new Set<CharacterId>();
  private readonly errors = new Map<CharacterId, unknown>();
  private readonly fallbackWarnings = new Map<CharacterId, unknown>();

  constructor(private readonly loader: CharacterModelLoader = createDefaultLoader()) {}

  public async loadAll(
    onProgress?: CharacterLoadProgress,
    definitions: readonly CharacterDefinition[] = CHARACTERS
  ): Promise<void> {
    let completed = 0;
    await Promise.all(
      definitions.map(async (definition) => {
        try {
          const asset = await this.loader.loadAsync(definition.modelPath);
          this.assets.set(definition.id, asset);
          this.errors.delete(definition.id);
          this.fallbackWarnings.delete(definition.id);
          await this.loadLobbyAsset(definition, asset);
        } catch (error) {
          if (definition.fallbackModelPath) {
            try {
              const fallback = await this.loader.loadAsync(definition.fallbackModelPath);
              this.assets.set(definition.id, fallback);
              this.errors.delete(definition.id);
              this.fallbackWarnings.set(definition.id, error);
              await this.loadLobbyAsset(definition, fallback);
            } catch (fallbackError) {
              this.assets.delete(definition.id);
              this.lobbyAssets.delete(definition.id);
              this.fallbackWarnings.delete(definition.id);
              this.errors.set(definition.id, {
                primary: error,
                fallback: fallbackError,
              });
            }
          } else {
            this.assets.delete(definition.id);
            this.fallbackWarnings.delete(definition.id);
            this.errors.set(definition.id, error);
          }
        } finally {
          completed += 1;
          onProgress?.(completed, definitions.length, definition.id);
        }
      })
    );
  }

  public has(id: CharacterId, variant: CharacterAssetVariant = 'gameplay'): boolean {
    if (variant === 'lobby' && this.strictLobbyAssets.has(id)) {
      return this.lobbyAssets.has(id);
    }
    return this.assets.has(id);
  }

  public getError(id: CharacterId): unknown {
    return this.errors.get(id);
  }

  public getFallbackWarning(id: CharacterId): unknown {
    return this.fallbackWarnings.get(id);
  }

  public get(id: CharacterId, variant: CharacterAssetVariant = 'gameplay'): GLTF {
    if (variant === 'lobby') {
      const lobbyAsset = this.lobbyAssets.get(id);
      if (lobbyAsset) return lobbyAsset;
      if (this.strictLobbyAssets.has(id)) {
        throw new Error(`Modelo de lobby não carregado: ${id}`);
      }
    }
    const asset = this.assets.get(id);
    if (!asset) throw new Error(`Modelo não carregado: ${id}`);
    return asset;
  }

  public getAnimations(id: CharacterId, variant: CharacterAssetVariant = 'gameplay'): THREE.AnimationClip[] {
    return this.get(id, variant).animations;
  }

  public getBoneNames(id: CharacterId, variant: CharacterAssetVariant = 'gameplay'): ReadonlySet<string> {
    const names = new Set<string>();
    this.get(id, variant).scene.traverse((object) => {
      if ((object as THREE.Bone).isBone && object.name) names.add(object.name);
    });
    return names;
  }

  public getBoneRestRotations(
    id: CharacterId,
    variant: CharacterAssetVariant = 'gameplay'
  ): ReadonlyMap<string, THREE.Quaternion> {
    const rotations = new Map<string, THREE.Quaternion>();
    this.get(id, variant).scene.traverse((object) => {
      if ((object as THREE.Bone).isBone && object.name) {
        rotations.set(object.name, object.quaternion.clone());
      }
    });
    return rotations;
  }

  public getBoneRestTranslations(
    id: CharacterId,
    variant: CharacterAssetVariant = 'gameplay'
  ): ReadonlyMap<string, THREE.Vector3> {
    const translations = new Map<string, THREE.Vector3>();
    this.get(id, variant).scene.traverse((object) => {
      if ((object as THREE.Bone).isBone && object.name) {
        translations.set(object.name, object.position.clone());
      }
    });
    return translations;
  }

  public createModel(id: CharacterId, variant: CharacterAssetVariant = 'gameplay'): THREE.Group {
    return cloneSkeleton(this.get(id, variant).scene) as THREE.Group;
  }

  private async loadLobbyAsset(definition: CharacterDefinition, gameplayAsset: GLTF): Promise<void> {
    this.strictLobbyAssets.delete(definition.id);
    if (!definition.lobbyModelPath || definition.lobbyModelPath === definition.modelPath) {
      this.lobbyAssets.set(definition.id, gameplayAsset);
      return;
    }
    if (definition.strictLobbyModel) this.strictLobbyAssets.add(definition.id);
    try {
      const lobbyAsset = await this.loader.loadAsync(definition.lobbyModelPath);
      this.lobbyAssets.set(definition.id, lobbyAsset);
    } catch (error) {
      this.lobbyAssets.delete(definition.id);
      this.fallbackWarnings.set(definition.id, error);
      if (!definition.strictLobbyModel) {
        this.lobbyAssets.set(definition.id, gameplayAsset);
      }
    }
  }
}
