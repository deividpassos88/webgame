import type { WarriorSkillId } from './WarriorSkillCatalog';

/**
 * Skill combo gauge (Cabal Online style).
 *
 * Casting a skill while another unlocked skill is still available opens a
 * gauge. A cursor sweeps the bar; clicking while it is over the green zone
 * "links" the combo: the next skill (any order) can be cast immediately,
 * cancelling the recovery of the previous one. Every link makes the green zone
 * smaller and the sweep faster. A miss, a timeout or running out of skills
 * ends the combo. Skills that took part in a successful link recharge 2x slower.
 */
export const COMBO_GREEN_WIDTHS = [0.2, 0.15, 0.11, 0.08] as const;
export const COMBO_SWEEP_SECONDS = [1.7, 1.55, 1.4, 1.25] as const;
/** Seconds after a successful click to start the next skill of the combo. */
export const COMBO_LINK_WINDOW_SECONDS = 2.5;
export const COMBO_COOLDOWN_MULTIPLIER = 2;
/** The gauge always resolves this long before the skill animation ends. */
export const COMBO_END_MARGIN_SECONDS = 0.15;
/** Narrowest green zone in seconds, so the last links stay humanly clickable. */
export const COMBO_MIN_GREEN_SECONDS = 0.12;
const MIN_SWEEP_SECONDS = 0.6;
/** The green zone never spawns in the first part of the sweep, so it stays fair. */
const GREEN_MIN_START = 0.28;
const GREEN_MAX_END = 0.94;
const GREEN_ABSOLUTE_END = 1;
/** Tolerance (fraction of the bar) that forgives a click a few pixels early. */
const HIT_TOLERANCE = 0.006;

export type ComboPhase = 'idle' | 'gauge' | 'linked';
export type ComboResult = 'hit' | 'miss' | 'timeout' | 'finished';
export type ComboClickOutcome = 'hit' | 'miss' | 'none';

export interface ComboSnapshot {
  readonly phase: ComboPhase;
  readonly chain: readonly WarriorSkillId[];
  /** Number of successful clicks in the current combo. */
  readonly hits: number;
  /** Cursor position from 0 (left) to 1 (right). */
  readonly cursor: number;
  readonly greenStart: number;
  readonly greenEnd: number;
  readonly linkRemaining: number;
  readonly linkWindow: number;
  readonly lastResult: ComboResult | null;
  /** Increments each time a result is produced so the view can flash it. */
  readonly resultSerial: number;
}

/** Timing of the skill being cast, used to tie the gauge to its animation. */
export interface ComboSkillTiming {
  /** Full length of the skill animation (including landing recovery). */
  readonly durationSeconds: number;
  /** When the skill delivers its last damage, from the start of the cast. */
  readonly lastHitSeconds: number;
}

export interface ComboGaugeTiming {
  readonly sweepSeconds: number;
  readonly zoneMin: number;
  readonly zoneMax: number;
  readonly greenWidth: number;
}

/**
 * The cursor sweeps for the whole skill animation and finishes
 * `COMBO_END_MARGIN_SECONDS` before it ends, so a hit, a miss or a timeout is
 * always decided while the skill is still playing. The green zone never starts
 * before the skill's last damage, so chaining the next skill never cuts damage.
 */
export function comboGaugeTiming(hits: number, skill?: ComboSkillTiming): ComboGaugeTiming {
  if (!skill) {
    return {
      sweepSeconds: comboSweepSeconds(hits),
      zoneMin: GREEN_MIN_START,
      zoneMax: GREEN_MAX_END,
      greenWidth: comboGreenWidth(hits),
    };
  }
  const sweepSeconds = Math.max(MIN_SWEEP_SECONDS, skill.durationSeconds - COMBO_END_MARGIN_SECONDS);
  const zoneMax = Math.min(GREEN_ABSOLUTE_END, GREEN_MAX_END + 0.03);
  const zoneMin = Math.min(0.85, Math.max(GREEN_MIN_START, skill.lastHitSeconds / sweepSeconds));
  const width = Math.max(comboGreenWidth(hits), COMBO_MIN_GREEN_SECONDS / sweepSeconds);
  return { sweepSeconds, zoneMin, zoneMax, greenWidth: Math.min(width, zoneMax - zoneMin) };
}

export function comboGreenWidth(hits: number): number {
  const index = Math.min(COMBO_GREEN_WIDTHS.length - 1, Math.max(0, Math.floor(hits)));
  return COMBO_GREEN_WIDTHS[index];
}

export function comboSweepSeconds(hits: number): number {
  const index = Math.min(COMBO_SWEEP_SECONDS.length - 1, Math.max(0, Math.floor(hits)));
  return COMBO_SWEEP_SECONDS[index];
}

export class SkillComboController {
  private phase: ComboPhase = 'idle';
  private chain: WarriorSkillId[] = [];
  private hits = 0;
  private elapsed = 0;
  private sweepSeconds: number = COMBO_SWEEP_SECONDS[0];
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
      if (this.elapsed >= this.sweepSeconds) {
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
      greenStart: this.greenStart,
      greenEnd: this.greenEnd,
      linkRemaining: this.linkRemaining,
      linkWindow: COMBO_LINK_WINDOW_SECONDS,
      lastResult: this.lastResult,
      resultSerial: this.resultSerial,
    };
  }

  private get cursor(): number {
    if (this.phase !== 'gauge') return 0;
    return Math.min(1, this.elapsed / this.sweepSeconds);
  }

  private openGauge(skill?: ComboSkillTiming): void {
    this.phase = 'gauge';
    this.elapsed = 0;
    const timing = comboGaugeTiming(this.hits, skill);
    this.sweepSeconds = timing.sweepSeconds;
    const room = Math.max(0, timing.zoneMax - timing.zoneMin - timing.greenWidth);
    this.greenStart = timing.zoneMin + this.random() * room;
    this.greenEnd = this.greenStart + timing.greenWidth;
  }

  private setResult(result: ComboResult): void {
    this.lastResult = result;
    this.resultSerial += 1;
  }
}
