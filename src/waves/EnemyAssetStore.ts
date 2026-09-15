import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
  GLTFLoader,
  type GLTF,
} from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

const REGULAR_ENEMY_PATH = '/models/Monstros/fase%201-1/monstro_normal.glb';
const ARCHER_ENEMY_PATH = '/models/Monstros/fase%201-1/monster_arch.glb';
const GUARDIAN_ENEMY_PATH = '/models/Monstros/fase%201-1/monstro_guardiao.glb';
const DRACO_DECODER_PATH =
  'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export interface EnemyModelLoader {
  loadAsync(path: string): Promise<GLTF>;
}

export interface RegularEnemyVisual {
  model: THREE.Group;
  animations: THREE.AnimationClip[];
}

export type ArcherEnemyVisual = RegularEnemyVisual;
export type GuardianEnemyVisual = RegularEnemyVisual;

export function createModelLoader(): GLTFLoader {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  dracoLoader.setDecoderConfig({ type: 'wasm' });

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

export class EnemyAssetStore {
  private regularAsset?: GLTF;
  private archerAsset?: GLTF;
  private guardianAsset?: GLTF;
  private regularError?: unknown;
  private archerError?: unknown;
  private guardianError?: unknown;

  constructor(private readonly loader: EnemyModelLoader = createModelLoader()) {}

  public async load(): Promise<void> {
    const [regular, archer, guardian] = await Promise.allSettled([
      this.loader.loadAsync(REGULAR_ENEMY_PATH),
      this.loader.loadAsync(ARCHER_ENEMY_PATH),
      this.loader.loadAsync(GUARDIAN_ENEMY_PATH),
    ]);
    this.regularAsset = regular.status === 'fulfilled' ? regular.value : undefined;
    this.regularError = regular.status === 'rejected' ? regular.reason : undefined;
    this.archerAsset = archer.status === 'fulfilled' ? archer.value : undefined;
    this.archerError = archer.status === 'rejected' ? archer.reason : undefined;
    this.guardianAsset = guardian.status === 'fulfilled' ? guardian.value : undefined;
    this.guardianError = guardian.status === 'rejected' ? guardian.reason : undefined;
  }

  public hasRegularEnemy(): boolean {
    return this.regularAsset !== undefined;
  }

  public createRegularEnemyVisual(): RegularEnemyVisual {
    if (!this.regularAsset) {
      throw new Error('Modelo do monstro normal não carregado.');
    }
    return {
      model: cloneSkeleton(this.regularAsset.scene) as THREE.Group,
      animations: this.regularAsset.animations.map((clip) => clip.clone()),
    };
  }

  public hasArcherEnemy(): boolean {
    return this.archerAsset !== undefined;
  }

  public createArcherEnemyVisual(): ArcherEnemyVisual {
    if (!this.archerAsset) {
      throw new Error('Archer enemy model is not loaded.');
    }
    return {
      model: cloneSkeleton(this.archerAsset.scene) as THREE.Group,
      animations: this.archerAsset.animations.map((clip) => clip.clone()),
    };
  }

  public hasGuardianEnemy(): boolean {
    return this.guardianAsset !== undefined;
  }

  public createGuardianEnemyVisual(): GuardianEnemyVisual {
    if (!this.guardianAsset) {
      throw new Error('Guardian enemy model is not loaded.');
    }
    return {
      model: cloneSkeleton(this.guardianAsset.scene) as THREE.Group,
      animations: this.guardianAsset.animations.map((clip) => clip.clone()),
    };
  }

  public getError(): unknown {
    return this.regularError ?? this.archerError ?? this.guardianError;
  }
}
