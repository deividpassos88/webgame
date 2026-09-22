import * as THREE from 'three';
import {
  makeClipInPlace,
  trimDuplicatedLoopEndpoint,
} from '../characters/AnimationClipAdapter';
import type { BossSkillKind } from './BossSkillController';
import type { EnemyAnimator } from './EnemyAnimator';
import { isEnemyHitClipName } from './EnemyHitClip';

const SKILL_CLIPS: Record<BossSkillKind, string> = {
  circle: 'jump_circle',
  rectangle: 'jump_rectangle',
  meteors: 'attack_meteors',
};

interface PendingSkillAnimation {
  clip: string;
  state: string;
  delay: number;
  timeScale: number;
}

export class BossAnimationController implements EnemyAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly durations = new Map<string, number>();
  private currentAction: THREE.AnimationAction | null = null;
  private currentState: string | null = null;
  private currentClip: string | null = null;
  private lastLocomotion: 'idle' | 'walking' | 'running' = 'idle';
  private lastLocomotionTimeScale = 1;
  private lockedRemaining = 0;
  private dead = false;
  private timeScale = 1;
  private nextClawAttack = 0;
  private pendingSkill: PendingSkillAnimation | null = null;
  private lyingHeld = false;
  private hitHeld = false;

  constructor(model: THREE.Group, clips: readonly THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(model);
    const idle = clips.find((clip) => clip.name === 'idle');
    for (const source of clips) {
      // O rig do Boss foi exportado com avanço no eixo local Y e altura no Z,
      // igual ao Paladino. O deslocamento de mundo pertence ao Enemy.root.
      const inPlace = makeClipInPlace(source, ['x', 'y'], idle ?? source);
      const prepared = source.name === 'walking' || source.name === 'running'
        ? trimDuplicatedLoopEndpoint(inPlace)
        : inPlace;
      prepared.name = `boss:${source.name}`;
      const action = this.mixer.clipAction(prepared);
      const looping = source.name === 'idle'
        || source.name === 'walking'
        || source.name === 'running';
      action.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, looping ? Infinity : 1);
      action.clampWhenFinished = !looping;
      this.actions.set(source.name, action);
      this.durations.set(source.name, prepared.duration);
    }
    this.play('idle', 0);
  }

  public get state(): string | null {
    return this.currentState;
  }

  public get deathDuration(): number {
    return this.durations.get('death') ?? 0;
  }

  public get activeClipName(): string | null {
    return this.currentClip;
  }

  public get activeTimeScale(): number {
    return this.timeScale;
  }

  public update(delta: number): void {
    if (this.lyingHeld) {
      const action = this.actions.get('death');
      if (action) action.paused = true;
      return;
    }
    if (this.hitHeld) {
      this.mixer.update(Math.max(0, delta));
      return;
    }
    const elapsed = Math.max(0, delta);
    if (this.dead) {
      this.mixer.update(elapsed);
      return;
    }

    if (this.lockedRemaining > 0) {
      this.advanceLocked(elapsed);
      return;
    }
    this.mixer.update(elapsed);
  }

  public play(
    state: 'idle' | 'walking' | 'running',
    fadeDuration = 0.15
  ): boolean {
    if (this.dead || this.lockedRemaining > 0 || this.lyingHeld || this.hitHeld) return false;
    const resolved = state === 'idle'
      ? 'idle'
      : state === 'walking' && this.actions.has('walking') ? 'walking' : 'running';
    const timeScale = 1;
    const activated = this.activate(resolved, state, fadeDuration, false, timeScale);
    if (activated) {
      this.lastLocomotion = resolved;
      this.lastLocomotionTimeScale = timeScale;
    }
    return activated;
  }

  public playNextAttack(): string | null {
    if (this.dead || this.lockedRemaining > 0 || this.lyingHeld || this.hitHeld) return null;
    const available = ['attack_meteors', 'attack_dash'].filter((clip) =>
      this.actions.has(clip)
    );
    const clip = available.length > 0
      ? available[this.nextClawAttack % available.length]
      : null;
    if (!clip) return null;
    const state = this.nextClawAttack % 2 === 0
      ? 'attack-primary'
      : 'attack-secondary';
    this.nextClawAttack++;
    const duration = Math.min(this.durations.get(clip) ?? 0, 1.4);
    const sourceDuration = this.durations.get(clip) ?? duration;
    const scale = duration > 0 ? sourceDuration / duration : 1;
    this.activate(clip, state, 0.08, true, scale);
    this.lockedRemaining = duration;
    return state;
  }

  public scheduleSkill(skill: BossSkillKind, secondsUntilImpact: number): boolean {
    if (this.dead) return false;
    const clip = SKILL_CLIPS[skill];
    const duration = this.durations.get(clip);
    if (!duration || !this.actions.has(clip)) return false;
    const warning = Math.max(0, secondsUntilImpact);
    if (warning <= 1e-9) {
      this.activate(clip, `skill:${skill}`, 0.08, true, 1);
      this.lockedRemaining = duration;
      return true;
    }
    const delay = Math.max(0, warning - duration);
    const timeScale = duration > warning ? duration / warning : 1;
    this.lockedRemaining = warning;
    if (delay <= 1e-9) {
      this.activate(clip, `skill:${skill}`, 0.08, true, timeScale);
    } else {
      this.pendingSkill = { clip, state: `skill:${skill}`, delay, timeScale };
    }
    return true;
  }

  public playApproachJump(): number {
    if (this.dead || this.lockedRemaining > 0) return 0;
    const duration = this.durations.get('jump_circle') ?? 0;
    if (duration <= 0 || !this.actions.has('jump_circle')) return 0;
    this.activate('jump_circle', 'approach-jump', 0.08, true, 1);
    this.lockedRemaining = duration;
    return duration;
  }

  public playHit(): boolean {
    if (this.dead || this.lyingHeld) return false;
    const clip = [...this.actions.keys()].find((name) => isEnemyHitClipName(name));
    if (!clip) return false;
    this.pendingSkill = null;
    this.lockedRemaining = 0;
    this.hitHeld = true;
    return this.activate(clip, 'hit', 0.04, true, 1);
  }

  public releaseHit(): void {
    if (!this.hitHeld) return;
    this.hitHeld = false;
    this.play('idle', 0.08);
  }

  public holdLyingPose(): boolean {
    const action = this.actions.get('death');
    if (!action) return false;
    this.pendingSkill = null;
    this.lockedRemaining = 0;
    this.lyingHeld = true;
    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(0);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    const duration = this.durations.get('death') ?? action.getClip().duration;
    action.time = Math.max(0.05, duration * 0.9);
    action.paused = true;
    this.currentAction = action;
    this.currentState = 'lying';
    this.currentClip = 'death';
    return true;
  }

  public releaseLyingPose(): void {
    this.lyingHeld = false;
    const action = this.actions.get('death');
    if (action) {
      action.paused = false;
      action.stop();
    }
    this.currentAction = null;
    this.play('idle', 0.1);
  }

  public playDeath(): number {
    this.dead = true;
    this.lockedRemaining = 0;
    this.pendingSkill = null;
    if (!this.activate('death', 'dead', 0.08, true, 1)) {
      this.mixer.stopAllAction();
      this.currentState = 'dead';
      this.currentClip = null;
      return 0;
    }
    return this.deathDuration;
  }

  private advanceLocked(delta: number): void {
    let animationDelta = delta;
    if (this.pendingSkill) {
      const beforeStart = Math.min(animationDelta, this.pendingSkill.delay);
      this.mixer.update(beforeStart);
      this.pendingSkill.delay -= beforeStart;
      animationDelta -= beforeStart;
      if (this.pendingSkill.delay <= 1e-9) {
        const pending = this.pendingSkill;
        this.pendingSkill = null;
        this.activate(pending.clip, pending.state, 0.08, true, pending.timeScale);
      }
    }
    if (animationDelta > 0) this.mixer.update(animationDelta);
    this.lockedRemaining = Math.max(0, this.lockedRemaining - delta);
    if (this.lockedRemaining <= 1e-9 && !this.dead) {
      this.activate(
        this.lastLocomotion,
        this.lastLocomotion,
        0.08,
        false,
        this.lastLocomotionTimeScale
      );
    }
  }

  private activate(
    clip: string,
    state: string,
    fadeDuration: number,
    restart: boolean,
    timeScale: number
  ): boolean {
    const next = this.actions.get(clip);
    if (!next) return false;
    if (!restart && next === this.currentAction) {
      next.setEffectiveTimeScale(timeScale);
      this.currentState = state;
      this.currentClip = clip;
      this.timeScale = timeScale;
      return true;
    }
    next.reset();
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(timeScale);
    next.fadeIn(fadeDuration);
    this.currentAction?.fadeOut(fadeDuration);
    next.play();
    this.currentAction = next;
    this.currentState = state;
    this.currentClip = clip;
    this.timeScale = timeScale;
    return true;
  }
}
