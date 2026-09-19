export const SWORD_COMBO_STAGES = [
  { duration: 0.48, damageOpen: 0.34, damageClose: 0.64, bufferOpen: 0.48 },
  { duration: 0.52, damageOpen: 0.30, damageClose: 0.62, bufferOpen: 0.46 },
  { duration: 0.58, damageOpen: 0.28, damageClose: 0.64, bufferOpen: 0.44 },
] as const;

export type SwordComboEvent =
  | { readonly type: 'stage-started'; readonly stage: number }
  | { readonly type: 'damage-opened'; readonly stage: number }
  | { readonly type: 'damage-closed'; readonly stage: number }
  | { readonly type: 'combo-ended' };

const STAGE_STARTED_EVENTS: readonly SwordComboEvent[] = [
  Object.freeze({ type: 'stage-started', stage: 0 }),
  Object.freeze({ type: 'stage-started', stage: 1 }),
  Object.freeze({ type: 'stage-started', stage: 2 }),
];

const DAMAGE_OPENED_EVENTS: readonly SwordComboEvent[] = [
  Object.freeze({ type: 'damage-opened', stage: 0 }),
  Object.freeze({ type: 'damage-opened', stage: 1 }),
  Object.freeze({ type: 'damage-opened', stage: 2 }),
];

const DAMAGE_CLOSED_EVENTS: readonly SwordComboEvent[] = [
  Object.freeze({ type: 'damage-closed', stage: 0 }),
  Object.freeze({ type: 'damage-closed', stage: 1 }),
  Object.freeze({ type: 'damage-closed', stage: 2 }),
];

const COMBO_ENDED_EVENT: SwordComboEvent = Object.freeze({ type: 'combo-ended' });
const TIME_EPSILON = 1e-12;

export class SwordComboController {
  private readonly events: SwordComboEvent[] = [];
  private stage: number | null = null;
  private elapsed = 0;
  private buffered = false;
  private damageOpened = false;
  private damageClosed = false;

  public request(): boolean {
    if (this.stage === null) {
      this.stage = 0;
      this.elapsed = 0;
      this.buffered = false;
      this.damageOpened = false;
      this.damageClosed = false;
      return true;
    }

    if (this.stage >= SWORD_COMBO_STAGES.length - 1 || this.buffered) {
      return false;
    }

    const config = SWORD_COMBO_STAGES[this.stage];
    if (this.elapsed < config.duration * config.bufferOpen) {
      return false;
    }

    this.buffered = true;
    return true;
  }

  public update(delta: number): readonly SwordComboEvent[] {
    this.events.length = 0;

    // Invalid or negative frame times are explicitly treated as no elapsed time.
    if (this.stage === null || !Number.isFinite(delta) || delta <= 0) {
      return this.events;
    }

    let remaining = delta;
    while (this.stage !== null && remaining > 0) {
      const stage: number = this.stage;
      const config = SWORD_COMBO_STAGES[stage];
      const damageOpenAt = config.duration * config.damageOpen;
      const damageCloseAt = config.duration * config.damageClose;

      const toDamageOpen = damageOpenAt - this.elapsed;
      if (!this.damageOpened && remaining + TIME_EPSILON >= toDamageOpen) {
        if (toDamageOpen > 0) {
          remaining -= toDamageOpen;
        }
        this.elapsed = damageOpenAt;
        this.damageOpened = true;
        this.events.push(DAMAGE_OPENED_EVENTS[stage]);
        continue;
      }

      const toDamageClose = damageCloseAt - this.elapsed;
      if (!this.damageClosed && remaining + TIME_EPSILON >= toDamageClose) {
        if (toDamageClose > 0) {
          remaining -= toDamageClose;
        }
        this.elapsed = damageCloseAt;
        this.damageClosed = true;
        this.events.push(DAMAGE_CLOSED_EVENTS[stage]);
        continue;
      }

      const toStageEnd = config.duration - this.elapsed;
      if (remaining + TIME_EPSILON < toStageEnd) {
        this.elapsed += remaining;
        remaining = 0;
        continue;
      }

      if (toStageEnd > 0) {
        remaining -= toStageEnd;
      }
      if (remaining <= TIME_EPSILON) {
        remaining = 0;
      }
      this.elapsed = config.duration;

      // The configured damage close is before the stage end, but keep this
      // guard so a threshold can never be omitted if timings are edited.
      if (!this.damageOpened) {
        this.damageOpened = true;
        this.events.push(DAMAGE_OPENED_EVENTS[stage]);
      }
      if (!this.damageClosed) {
        this.damageClosed = true;
        this.events.push(DAMAGE_CLOSED_EVENTS[stage]);
      }

      if (this.buffered && stage < SWORD_COMBO_STAGES.length - 1) {
        const nextStage = stage + 1;
        this.stage = nextStage;
        this.elapsed = 0;
        this.buffered = false;
        this.damageOpened = false;
        this.damageClosed = false;
        this.events.push(STAGE_STARTED_EVENTS[nextStage]);
        continue;
      }

      this.stage = null;
      this.elapsed = 0;
      this.buffered = false;
      this.damageOpened = false;
      this.damageClosed = false;
      this.events.push(COMBO_ENDED_EVENT);
    }

    return this.events;
  }

  public cancel(): void {
    this.stage = null;
    this.elapsed = 0;
    this.buffered = false;
    this.damageOpened = false;
    this.damageClosed = false;
  }

  public get activeStage(): number | null {
    return this.stage;
  }

  public get active(): boolean {
    return this.stage !== null;
  }
}
