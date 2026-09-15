import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { RegularEnemyVisual } from '../waves/EnemyAssetStore';
import {
  createModelLoader,
  type EnemyModelLoader,
} from '../waves/EnemyAssetStore';

const BOSS_MODEL_PATH = '/models/Boss/Boss.glb?v=20260828-walking';

export class BossAssetStore {
  private asset?: GLTF;
  private error?: unknown;

  constructor(private readonly loader: EnemyModelLoader = createModelLoader()) {}

  public async load(): Promise<void> {
    try {
      this.asset = await this.loader.loadAsync(BOSS_MODEL_PATH);
      this.error = undefined;
    } catch (error) {
      this.asset = undefined;
      this.error = error;
    }
  }

  public hasBoss(): boolean {
    return this.asset !== undefined;
  }

  public createBossVisual(): RegularEnemyVisual {
    if (!this.asset) throw new Error('Modelo do boss não carregado.');
    return {
      model: cloneSkeleton(this.asset.scene) as RegularEnemyVisual['model'],
      animations: this.asset.animations.map((clip) => clip.clone()),
    };
  }

  public getError(): unknown {
    return this.error;
  }
}
