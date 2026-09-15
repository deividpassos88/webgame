import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
  GLTFLoader,
  type GLTF,
} from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  WEAPONS,
  type EquipmentId,
} from './EquipmentCatalog';
import {
  createRuntimeWarriorSword,
  isRuntimeWeapon,
} from '../characters/RuntimeWarriorWeapon';

const CHEST_PATH = '/models/chest.glb';
const DRACO_DECODER_PATH =
  'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export interface RewardModelLoader {
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

export class RewardAssetStore {
  private chest?: GLTF;
  private chestError?: unknown;
  private readonly weapons = new Map<EquipmentId, GLTF>();
  private readonly weaponErrors = new Map<EquipmentId, unknown>();

  constructor(private readonly loader: RewardModelLoader = createDefaultLoader()) {}

  public async loadAll(
    onProgress?: (completed: number, total: number) => void
  ): Promise<void> {
    const runtimeWeapons = WEAPONS.filter(({ id }) => isRuntimeWeapon(id));
    const jobs: Array<{ path: string; id: 'chest' | EquipmentId }> = [
      { path: CHEST_PATH, id: 'chest' },
      ...WEAPONS
        .filter(({ id }) => !isRuntimeWeapon(id))
        .map(({ modelPath, id }) => ({ path: modelPath, id })),
    ];
    const total = jobs.length + runtimeWeapons.length;
    let completed = 0;

    // Runtime weapons are available as soon as their factory module is
    // present. Count them as completed work without touching the network.
    for (const { id } of runtimeWeapons) {
      this.weapons.delete(id);
      this.weaponErrors.delete(id);
      completed += 1;
      onProgress?.(completed, total);
    }

    await Promise.all(
      jobs.map(async ({ path, id }) => {
        try {
          const loaded = await this.loader.loadAsync(path);
          if (id === 'chest') {
            this.chest = loaded;
            this.chestError = undefined;
          } else {
            this.weapons.set(id, loaded);
            this.weaponErrors.delete(id);
          }
        } catch (error) {
          if (id === 'chest') {
            this.chest = undefined;
            this.chestError = error;
          } else {
            this.weapons.delete(id);
            this.weaponErrors.set(id, error);
          }
        } finally {
          completed += 1;
          onProgress?.(completed, total);
        }
      })
    );
  }

  public hasChest(): boolean {
    return this.chest !== undefined;
  }

  public hasWeapon(id: EquipmentId): boolean {
    return isRuntimeWeapon(id) || this.weapons.has(id);
  }

  public createChest(): THREE.Group {
    if (!this.chest) throw new Error('Modelo do baú não carregado.');
    return cloneSkeleton(this.chest.scene) as THREE.Group;
  }

  public createWeapon(id: EquipmentId): THREE.Group {
    if (isRuntimeWeapon(id)) return createRuntimeWarriorSword();
    const asset = this.weapons.get(id);
    if (!asset) throw new Error(`Modelo da arma não carregado: ${id}`);
    return cloneSkeleton(asset.scene) as THREE.Group;
  }

  public getChestError(): unknown {
    return this.chestError;
  }

  public getWeaponError(id: EquipmentId): unknown {
    return this.weaponErrors.get(id);
  }
}
