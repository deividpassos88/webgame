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

const DRACO_DECODER_PATH =
  'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export type CharacterLoadProgress = (
  completed: number,
  total: number,
  characterId: CharacterId
) => void;

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
        } catch (error) {
          if (definition.fallbackModelPath) {
            try {
              const fallback = await this.loader.loadAsync(definition.fallbackModelPath);
              this.assets.set(definition.id, fallback);
              this.errors.delete(definition.id);
              this.fallbackWarnings.set(definition.id, error);
            } catch (fallbackError) {
              this.assets.delete(definition.id);
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

  public has(id: CharacterId): boolean {
    return this.assets.has(id);
  }

  public getError(id: CharacterId): unknown {
    return this.errors.get(id);
  }

  public getFallbackWarning(id: CharacterId): unknown {
    return this.fallbackWarnings.get(id);
  }

  public get(id: CharacterId): GLTF {
    const asset = this.assets.get(id);
    if (!asset) throw new Error(`Modelo não carregado: ${id}`);
    return asset;
  }

  public getAnimations(id: CharacterId): THREE.AnimationClip[] {
    return this.get(id).animations;
  }

  public getBoneNames(id: CharacterId): ReadonlySet<string> {
    const names = new Set<string>();
    this.get(id).scene.traverse((object) => {
      if ((object as THREE.Bone).isBone && object.name) names.add(object.name);
    });
    return names;
  }

  public getBoneRestRotations(
    id: CharacterId
  ): ReadonlyMap<string, THREE.Quaternion> {
    const rotations = new Map<string, THREE.Quaternion>();
    this.get(id).scene.traverse((object) => {
      if ((object as THREE.Bone).isBone && object.name) {
        rotations.set(object.name, object.quaternion.clone());
      }
    });
    return rotations;
  }

  public createModel(id: CharacterId): THREE.Group {
    return cloneSkeleton(this.get(id).scene) as THREE.Group;
  }
}
