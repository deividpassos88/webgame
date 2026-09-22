import * as THREE from 'three';

export interface VFXTimelineEvent<TName extends string = string> {
  readonly at: number;
  readonly name: TName;
}

const EPSILON = 1e-6;

/**
 * AnimationAction-driven normalized timeline. It never uses timers; events are
 * fired when the real mixer/action time reaches the configured clip progress.
 */
export class VFXTimeline<TName extends string = string> {
  private readonly events: VFXTimelineEvent<TName>[];
  private readonly fired = new Set<TName>();
  private lastProgress = 0;
  private completed = false;

  public constructor(
    private readonly action: THREE.AnimationAction,
    events: readonly VFXTimelineEvent<TName>[]
  ) {
    this.events = [...events].sort((a, b) => a.at - b.at);
  }

  public update(onEvent: (name: TName, progress: number) => void): boolean {
    if (this.completed) return false;
    const progress = this.progress();

    // If the action restarted, allow the same timeline object to start over.
    if (progress + EPSILON < this.lastProgress) {
      this.fired.clear();
    }

    for (const event of this.events) {
      if (this.fired.has(event.name)) continue;
      if (progress + EPSILON < event.at) continue;
      this.fired.add(event.name);
      onEvent(event.name, progress);
    }

    this.lastProgress = progress;
    const running = this.action.isRunning();
    if (progress >= 1 - EPSILON || (!running && progress > 0.02)) {
      this.completed = true;
      return false;
    }
    return true;
  }

  public progress(): number {
    const duration = this.action.getClip().duration || 1;
    const time = THREE.MathUtils.euclideanModulo(this.action.time, duration);
    // LoopOnce actions clamp at duration, but euclideanModulo(duration,duration)=0.
    const clampedTime = !this.action.isRunning() && this.action.time >= duration - EPSILON
      ? duration
      : time;
    return THREE.MathUtils.clamp(clampedTime / duration, 0, 1);
  }

  public hasFired(name: TName): boolean {
    return this.fired.has(name);
  }
}
