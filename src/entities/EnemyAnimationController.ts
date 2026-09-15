import * as THREE from 'three';
import {
  makeClipInPlace,
  trimDuplicatedLoopEndpoint,
  type RootMotionAxis,
} from '../characters/AnimationClipAdapter';
import type { EnemyAnimator } from './EnemyAnimator';

export type EnemyAnimationState =
  | 'idle'
  | 'walking'
  | 'running'
  | 'attack-primary'
  | 'attack-secondary'
  | 'dead';

const CLIP_NAMES: Record<EnemyAnimationState, string> = {
  idle: 'Character_output.fbx',
  walking: 'Walking',
  running: 'Running',
  'attack-primary': 'Charged_Slash',
  'attack-secondary': 'Charged_Upward_Slash',
  dead: 'dying_backwards',
};

export const ARCHER_CLIP_NAMES: Record<EnemyAnimationState, string> = {
  idle: 'idle',
  walking: 'correndo',
  running: 'correndo',
  'attack-primary': 'atacando',
  'attack-secondary': 'atacando',
  dead: 'morrendo',
};

export const GUARDIAN_CLIP_NAMES: Record<EnemyAnimationState, string> = {
  idle: 'mixamo.com',
  walking: 'correndo',
  running: 'correndo',
  'attack-primary': 'atacando',
  'attack-secondary': 'atacando',
  dead: 'morrendo',
};

export const ENEMY_ATTACK_DURATION = 1.4;

export class EnemyAnimationController implements EnemyAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly nativeClips: readonly THREE.AnimationClip[];
  private readonly actions: Partial<Record<EnemyAnimationState, THREE.AnimationAction>> = {};
  private readonly nativeClipNames: Partial<Record<EnemyAnimationState, string>> = {};
  private currentAction: THREE.AnimationAction | null = null;
  private currentState: EnemyAnimationState | null = null;
  private activeNativeClipName: string | null = null;
  private lastLocomotionState: 'idle' | 'walking' | 'running' | null = null;
  private nextAttack: 'attack-primary' | 'attack-secondary' = 'attack-primary';
  private readonly deathClipDuration: number;

  constructor(
    model: THREE.Group,
    clips: readonly THREE.AnimationClip[],
    private readonly locomotionTimeScale = 1,
    private readonly clipNames: Record<EnemyAnimationState, string> = CLIP_NAMES,
    private readonly animationPrefix = 'regular-enemy',
    private readonly rootMotionAxes: readonly RootMotionAxis[] = ['x', 'z']
  ) {
    this.mixer = new THREE.AnimationMixer(model);
    this.nativeClips = clips;
    const idleReference = this.sourceFor('idle');

    for (const [state, clipName] of Object.entries(this.clipNames) as Array<
      [EnemyAnimationState, string]
    >) {
      const source = this.sourceFor(state);
      if (!source) continue;
      const inPlace = makeClipInPlace(
        source,
        this.rootMotionAxes,
        idleReference ?? source
      );
      const prepared = state === 'walking' || state === 'running'
        ? trimDuplicatedLoopEndpoint(inPlace)
        : inPlace;
      prepared.name = `${this.animationPrefix}:${state}`;
      const action = this.mixer.clipAction(prepared);
      const oneShot = state.startsWith('attack-') || state === 'dead';
      action.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
      action.clampWhenFinished = oneShot;
      if (state.startsWith('attack-')) {
        action.setEffectiveTimeScale(
          prepared.duration > 0 ? prepared.duration / ENEMY_ATTACK_DURATION : 1
        );
      }
      this.actions[state] = action;
      this.nativeClipNames[state] = source.name;
    }

    this.deathClipDuration = this.actions.dead?.getClip().duration ?? 0;
    this.play('idle', 0);
  }

  public get state(): EnemyAnimationState | null {
    return this.currentState;
  }

  public get deathDuration(): number {
    return this.deathClipDuration;
  }

  public get activeClipName(): string | null {
    return this.activeNativeClipName;
  }

  public get activeTimeScale(): number {
    return this.currentAction?.getEffectiveTimeScale() ?? 1;
  }

  public update(delta: number): void {
    this.mixer.update(Math.max(0, delta));
  }

  public play(state: 'idle' | 'walking' | 'running', fadeDuration = 0.15): boolean {
    const resolvedState = this.resolveLocomotionState(state);
    if (!resolvedState) return false;
    const activated = this.activate(resolvedState, fadeDuration);
    if (activated) this.lastLocomotionState = resolvedState;
    return activated;
  }

  public playNextAttack(): EnemyAnimationState | null {
    const primaryAvailable = Boolean(this.actions['attack-primary']);
    const secondaryAvailable = Boolean(this.actions['attack-secondary']);
    if (!primaryAvailable && !secondaryAvailable) return null;

    const selected = primaryAvailable && secondaryAvailable
      ? this.nextAttack
      : primaryAvailable ? 'attack-primary' : 'attack-secondary';
    if (primaryAvailable && secondaryAvailable) {
      this.nextAttack = selected === 'attack-primary'
        ? 'attack-secondary'
        : 'attack-primary';
    }
    this.activate(selected, 0.08, true);
    return selected;
  }

  public playDeath(): number {
    if (!this.actions.dead) {
      this.mixer.stopAllAction();
      this.currentAction = null;
      this.currentState = 'dead';
      this.activeNativeClipName = null;
      return 0;
    }
    this.activate('dead', 0.08, true);
    return this.deathClipDuration;
  }

  private activate(
    state: EnemyAnimationState,
    fadeDuration: number,
    restart = false
  ): boolean {
    const nextAction = this.actions[state];
    if (!nextAction) return false;
    if (!restart && nextAction === this.currentAction) {
      this.currentState = state;
      this.activeNativeClipName = this.nativeClipNames[state] ?? null;
      return true;
    }

    nextAction.reset();
    nextAction.setEffectiveWeight(1);
    if (state === 'walking' || state === 'running') {
      nextAction.setEffectiveTimeScale(this.locomotionTimeScale);
    }
    nextAction.fadeIn(fadeDuration);
    this.currentAction?.fadeOut(fadeDuration);
    nextAction.play();
    this.currentAction = nextAction;
    this.currentState = state;
    this.activeNativeClipName = this.nativeClipNames[state] ?? null;
    return true;
  }

  private sourceFor(state: EnemyAnimationState): THREE.AnimationClip | undefined {
    const exact = this.nativeClips.find((clip) => clip.name === this.clipNames[state]);
    if (exact) return exact;
    if (state === 'idle') {
      return this.nativeClips.find((clip) => clip.name === this.clipNames.walking)
        ?? this.nativeClips.find((clip) => clip.name === this.clipNames.running);
    }
    return undefined;
  }

  private resolveLocomotionState(
    requested: 'idle' | 'walking' | 'running'
  ): 'idle' | 'walking' | 'running' | null {
    if (this.actions[requested]) return requested;
    if (this.lastLocomotionState && this.actions[this.lastLocomotionState]) {
      return this.lastLocomotionState;
    }
    for (const candidate of ['idle', 'walking', 'running'] as const) {
      if (this.actions[candidate]) return candidate;
    }
    return null;
  }
}
