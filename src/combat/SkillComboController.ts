import type { WarriorSkillId } from './WarriorSkillCatalog';
import {
  comboDamageMultiplier,
  comboPlaybackMultiplier,
} from './ComboEmpowerment';

/**
 * Skill combo gauge (Cabal Online style).
 *
 * Casting a skill while another unlocked skill is still available opens a
 * gauge. A cursor sweeps the bar **back and forth** (ida e volta) and clicking
 * while it is over the green zone "links" the combo: the next skill (any order)
 * is cast right away, cutting the tail of the previous animation. Every link
 * makes the green zone smaller and the cursor faster. A miss, a timeout or
 * running out of skills ends the combo. Skills that took part in a successful
 * link recharge 2x slower, and from the first link on every skill is faster and
 * hits double damage (see `ComboEmpowerment`).
 */
/** Green zone width, as a fraction of the bar, per number of links. */
export const COMBO_GREEN_WIDTHS = [0.15, 0.12, 0.1, 0.08] as const;
/**
 * Seconds of ONE cursor pass (left → right). The cursor then returns, so a full
 * "ida e volta" costs twice this. Much faster than the old single sweep.
 */
export const COMBO_SWEEP_SECONDS = [0.55, 0.5, 0.45, 0.4] as const;
/** Passes the gauge stays open for when no skill timing is known. */
export const COMBO_FALLBACK_PASSES = 2;
/** Seconds after a successful click to start the next skill of the combo. */
export const COMBO_LINK_WINDOW_SECONDS = 2.5;
export const COMBO_COOLDOWN_MULTIPLIER = 2;
/**
 * The gauge always resolves this long before the skill animation ends, so the
 * next skill is chained "a little before the end" instead of at the very end.
 */
export const COMBO_END_MARGIN_SECONDS = 0.35;
/** Narrowest green zone, in seconds of one cursor pass. */
export const COMBO_MIN_GREEN_SECONDS = 0.03;
/** Shortest gauge window: at least most of one pass, so the cursor is visible. */
const MIN_WINDOW_SECONDS = 0.4;
const MIN_SWEEP_SECONDS = 0.2;
/** The green zone never spawns in the first part of the bar, so it stays fair. */
const GREEN_MIN_START = 0.28;
const GREEN_MAX_END = 0.94;
const GREEN_ABSOLUTE_END = 1;
/** Latest allowed start of the green zone, so it always fits in the bar. */
const GREEN_MAX_START = 0.85;
/**
 * The green zone must always be reachable: with a short animation the window
 * can be smaller than one full pass, so the zone is pulled forward until the
 * cursor can cross it inside the window (at most 3/4 of the first pass). A hit
 * before the skill's last damage never cuts damage: the next skill is queued
 * until that hit lands.
 */
const GREEN_REACH_WINDOW_RATIO = 0.75;
/** Tolerance (fraction of the bar) that forgives a click a few pixels early. */
const HIT_TOLERANCE = 0.006;

export type ComboPhase = 'idle' | 'gauge' | 'linked';
export type ComboResult = 'hit' | 'miss' | 'timeout' | 'finished';
export type ComboClickOutcome = 'hit' | 'miss' | 'none';
/** `1` while the cursor goes right, `-1` while it comes back. */
export type ComboCursorDirection = 1 | -1;

export interface ComboSnapshot {
  readonly phase: ComboPhase;
  readonly chain: readonly WarriorSkillId[];
  /** Number of successful clicks in the current combo. */
  readonly hits: number;
  /** Cursor position from 0 (left) to 1 (right). */
  readonly cursor: number;
  /** Which way the cursor is travelling right now. */
  readonly cursorDirection: ComboCursorDirection;
  readonly greenStart: number;
  readonly greenEnd: number;
  /** Seconds of one cursor pass (ida). */
  readonly sweepSeconds: number;
  /** Seconds the gauge stays open before it resolves by itself. */
  readonly windowSeconds: number;
  readonly linkRemaining: number;
  readonly linkWindow: number;
  readonly lastResult: ComboResult | null;
  /** Increments each time a result is produced so the view can flash it. */
  readonly resultSerial: number;
  /** True from the first green hit on: skills are faster and hit double. */
  readonly empowered: boolean;
}

/** Timing of the skill being cast, used to tie the gauge to its animation. */
export interface ComboSkillTiming {
  /** Full length of the skill animation (including landing recovery). */
  readonly durationSeconds: number;
  /** When the skill delivers its last damage, from the start of the cast. */
  readonly lastHitSeconds: number;
}

export interface ComboGaugeTiming {
  /** Seconds of ONE cursor pass; the cursor ping-pongs inside the window. */
  readonly sweepSeconds: number;
  /** Total seconds the gauge stays open (it resolves before the skill ends). */
  readonly windowSeconds: number;
  readonly zoneMin: number;
  readonly zoneMax: number;
  readonly greenWidth: number;
}

/**
 * Position of the cursor, which travels the bar and comes back (triangle wave)
 * instead of sweeping once. `elapsedSeconds` is measured from the gauge opening
 * and `sweepSeconds` is the length of ONE pass.
 */
export function comboCursorPosition(elapsedSeconds: number, sweepSeconds: number): number {
  if (!Number.isFinite(sweepSeconds) || sweepSeconds <= 0) return 0;
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const phase = (elapsed / sweepSeconds) % 2;
  return phase <= 1 ? phase : 2 - phase;
}

/** Direction of the cursor at the same instant (`1` ida, `-1` volta). */
export function comboCursorDirection(
  elapsedSeconds: number,
  sweepSeconds: number
): ComboCursorDirection {
  if (!Number.isFinite(sweepSeconds) || sweepSeconds <= 0) return 1;
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  return (elapsed / sweepSeconds) % 2 <= 1 ? 1 : -1;
}

/**
 * The gauge stays open for the whole skill animation minus
 * `COMBO_END_MARGIN_SECONDS`, so a hit, a miss or a timeout is always decided
 * while the skill is still playing and the next one can be chained before the
 * animation ends. Inside that window the cursor ping-pongs, one pass every
 * `comboSweepSeconds(hits)`. The green zone never starts before the skill's last
 * damage, so chaining the next skill never cuts damage.
 */
export function comboGaugeTiming(hits: number, skill?: ComboSkillTiming): ComboGaugeTiming {
  const sweepSeconds = comboSweepSeconds(hits);
  if (!skill) {
    return {
      sweepSeconds,
      windowSeconds: sweepSeconds * COMBO_FALLBACK_PASSES,
      zoneMin: GREEN_MIN_START,
      zoneMax: GREEN_MAX_END,
      greenWidth: Math.max(
        comboGreenWidth(hits),
        COMBO_MIN_GREEN_SECONDS / sweepSeconds
      ),
    };
  }
  const windowSeconds = Math.max(
    MIN_WINDOW_SECONDS,
    skill.durationSeconds - COMBO_END_MARGIN_SECONDS
  );
  const zoneMax = Math.min(GREEN_ABSOLUTE_END, GREEN_MAX_END + 0.03);
  const reachCap = Math.max(
    GREEN_MIN_START,
    (windowSeconds * GREEN_REACH_WINDOW_RATIO) / sweepSeconds
  );
  const zoneMin = Math.min(
    GREEN_MAX_START,
    Math.max(GREEN_MIN_START, skill.lastHitSeconds / windowSeconds),
    reachCap
  );
  const width = Math.max(comboGreenWidth(hits), COMBO_MIN_GREEN_SECONDS / sweepSeconds);
  return { sweepSeconds, windowSeconds, zoneMin, zoneMax, greenWidth: Math.min(width, zoneMax - zoneMin) };
}

export function comboGreenWidth(hits: number): number {
  const index = Math.min(COMBO_GREEN_WIDTHS.length - 1, Math.max(0, Math.floor(hits)));
  return COMBO_GREEN_WIDTHS[index];
}

/** Seconds of ONE cursor pass for the given number of links. */
export function comboSweepSeconds(hits: number): number {
  const index = Math.min(COMBO_SWEEP_SECONDS.length - 1, Math.max(0, Math.floor(hits)));
  return Math.max(MIN_SWEEP_SECONDS, COMBO_SWEEP_SECONDS[index]);
}

export class SkillComboController {
  private phase: ComboPhase = 'idle';
  private chain: WarriorSkillId[] = [];
  private hits = 0;
  private elapsed = 0;
  private sweepSeconds: number = COMBO_SWEEP_SECONDS[0];
  private windowSeconds: number = COMBO_SWEEP_SECONDS[0] * COMBO_FALLBACK_PASSES;
  private greenStart = 0;
  private greenEnd = 0;
  private linkRemaining = 0;
  private lastResult: ComboResult | null = null;
  private resultSerial = 0;
  private cooldownDoubles: WarriorSkillId[] = [];

  public constructor(private readonly random: () => number = Math.random) {}

  public get active(): boolean {
    return this.phase !== 'idle';
  }

  /** True while the gauge is sweeping and a click must be judged. */
  public get gaugeActive(): boolean {
    return this.phase === 'gauge';
  }

  /** True when `id` would continue the current combo (a link was just hit). */
  public canChain(id: WarriorSkillId): boolean {
    return this.phase === 'linked' && !this.chain.includes(id);
  }

  public get chainedSkills(): readonly WarriorSkillId[] {
    return this.chain;
  }

  /**
   * True from the first green hit until the combo ends: every skill cast while
   * empowered is faster and deals double damage.
   */
  public get empowered(): boolean {
    return this.hits > 0 && this.phase !== 'idle';
  }

  /** Damage multiplier of a skill cast right now. */
  public get damageMultiplier(): number {
    return comboDamageMultiplier(this.empowered);
  }

  /** Animation speed multiplier of a skill cast right now. */
  public get playbackMultiplier(): number {
    return comboPlaybackMultiplier(this.empowered);
  }

  /**
   * Registers an accepted skill cast. `remainingSkills` is how many other
   * skills could still follow in this combo; the gauge only opens when there
   * is at least one.
   */
  public registerCast(
    id: WarriorSkillId,
    remainingSkills: number,
    timing?: ComboSkillTiming
  ): void {
    const linked = this.canChain(id);
    if (!linked) {
      this.chain = [];
      this.hits = 0;
    } else {
      this.cooldownDoubles.push(id);
    }
    this.chain.push(id);
    this.linkRemaining = 0;

    if (remainingSkills > 0) {
      this.openGauge(timing);
    } else {
      this.phase = 'idle';
      if (linked) this.setResult('finished');
    }
  }

  public click(): ComboClickOutcome {
    if (this.phase !== 'gauge') return 'none';
    const cursor = this.cursor;
    const inside =
      cursor >= this.greenStart - HIT_TOLERANCE && cursor <= this.greenEnd + HIT_TOLERANCE;
    if (inside) {
      this.hits += 1;
      this.phase = 'linked';
      this.linkRemaining = COMBO_LINK_WINDOW_SECONDS;
      this.cooldownDoubles.push(this.chain[this.chain.length - 1]);
      this.setResult('hit');
      return 'hit';
    }
    this.phase = 'idle';
    this.setResult('miss');
    return 'miss';
  }

  public update(delta: number): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    if (this.phase === 'gauge') {
      this.elapsed += delta;
      if (this.elapsed >= this.windowSeconds) {
        this.phase = 'idle';
        this.setResult('timeout');
      }
    } else if (this.phase === 'linked') {
      this.linkRemaining = Math.max(0, this.linkRemaining - delta);
      if (this.linkRemaining <= 0) {
        this.phase = 'idle';
        this.setResult('timeout');
      }
    }
  }

  /** Skills whose cooldown must be doubled. Drained by the caller. */
  public consumeCooldownDoubles(): WarriorSkillId[] {
    const pending = this.cooldownDoubles;
    this.cooldownDoubles = [];
    return pending;
  }

  public reset(): void {
    this.phase = 'idle';
    this.chain = [];
    this.hits = 0;
    this.elapsed = 0;
    this.linkRemaining = 0;
    this.cooldownDoubles = [];
    this.lastResult = null;
  }

  public snapshot(): ComboSnapshot {
    return {
      phase: this.phase,
      chain: [...this.chain],
      hits: this.hits,
      cursor: this.cursor,
      cursorDirection: this.cursorDirection,
      greenStart: this.greenStart,
      greenEnd: this.greenEnd,
      sweepSeconds: this.sweepSeconds,
      windowSeconds: this.windowSeconds,
      linkRemaining: this.linkRemaining,
      linkWindow: COMBO_LINK_WINDOW_SECONDS,
      lastResult: this.lastResult,
      resultSerial: this.resultSerial,
      empowered: this.empowered,
    };
  }

  private get cursor(): number {
    if (this.phase !== 'gauge') return 0;
    return comboCursorPosition(this.elapsed, this.sweepSeconds);
  }

  private get cursorDirection(): ComboCursorDirection {
    if (this.phase !== 'gauge') return 1;
    return comboCursorDirection(this.elapsed, this.sweepSeconds);
  }

  private openGauge(skill?: ComboSkillTiming): void {
    this.phase = 'gauge';
    this.elapsed = 0;
    const timing = comboGaugeTiming(this.hits, skill);
    this.sweepSeconds = timing.sweepSeconds;
    this.windowSeconds = timing.windowSeconds;
    const room = Math.max(0, timing.zoneMax - timing.zoneMin - timing.greenWidth);
    this.greenStart = timing.zoneMin + this.random() * room;
    this.greenEnd = this.greenStart + timing.greenWidth;
  }

  private setResult(result: ComboResult): void {
    this.lastResult = result;
    this.resultSerial += 1;
  }
}
