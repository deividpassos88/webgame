import * as THREE from 'three';

export interface FinalBossRewardChestPort {
  readonly root: THREE.Group;
  readonly openingComplete: boolean;
  readonly removable: boolean;
  beginOpening(): boolean;
  claim(): void;
  update(delta: number): void;
  dispose(): void;
}

export type FinalBossRewardState = 'idle' | 'opening' | 'collapsing' | 'settling' | 'finished';

export interface FinalBossRewardCoordinatorOptions {
  readonly scene: THREE.Scene;
  /** Returns null on an asset failure; rewards still settle safely on the next frame. */
  readonly createChest: () => FinalBossRewardChestPort | null;
  readonly onSettle: () => void;
  readonly onFinished: () => void;
}

/** Runs the automatic, non-blocking final chest sequence after the boss dies. */
export class FinalBossRewardCoordinator {
  private currentState: FinalBossRewardState = 'idle';
  private chest: FinalBossRewardChestPort | null = null;
  private settled = false;
  private finished = false;

  public constructor(private readonly options: FinalBossRewardCoordinatorOptions) {}

  public get state(): FinalBossRewardState {
    return this.currentState;
  }

  public start(position: THREE.Vector3): THREE.Group | null {
    if (this.currentState !== 'idle') return null;
    try {
      this.chest = this.options.createChest();
    } catch {
      this.chest = null;
    }

    if (!this.chest) {
      this.currentState = 'settling';
      return null;
    }

    this.chest.root.position.copy(position);
    this.options.scene.add(this.chest.root);
    if (this.chest.beginOpening()) {
      this.currentState = 'opening';
    } else {
      this.chest.claim();
      this.currentState = 'collapsing';
    }
    return this.chest.root;
  }

  public update(delta: number): void {
    if (this.currentState === 'idle' || this.currentState === 'finished') return;

    if (this.currentState === 'settling') {
      this.settleAndFinish();
      return;
    }

    const chest = this.chest;
    if (!chest) {
      this.currentState = 'settling';
      this.settleAndFinish();
      return;
    }

    chest.update(Math.max(0, delta));
    if (this.currentState === 'opening' && chest.openingComplete) {
      chest.claim();
      this.currentState = 'collapsing';
      return;
    }

    if (this.currentState === 'collapsing' && chest.removable) {
      chest.dispose();
      this.chest = null;
      this.currentState = 'settling';
      this.settleAndFinish();
    }
  }

  public reset(): void {
    this.chest?.dispose();
    this.chest = null;
    this.currentState = 'idle';
    this.settled = false;
    this.finished = false;
  }

  private settleAndFinish(): void {
    if (!this.settled) {
      this.settled = true;
      this.options.onSettle();
    }
    if (!this.finished) {
      this.finished = true;
      this.options.onFinished();
    }
    this.currentState = 'finished';
  }
}
