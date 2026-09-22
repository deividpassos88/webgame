import type { BossSkillKind } from './BossSkillController';

export interface EnemyAnimator {
  readonly state: string | null;
  readonly deathDuration: number;
  readonly activeClipName: string | null;
  update(delta: number): void;
  play(state: 'idle' | 'walking' | 'running', fadeDuration?: number): boolean;
  playNextAttack(): string | null;
  playDeath(): number;
  scheduleSkill?(skill: BossSkillKind, secondsUntilImpact: number): boolean;
  playApproachJump?(): number;
  /** Holds the authored lying-down frame without starting the death sequence. */
  holdLyingPose?(): boolean;
  releaseLyingPose?(): void;
  /** Plays an authored hit clip when the model has one. */
  playHit?(): boolean;
  releaseHit?(): void;
}
