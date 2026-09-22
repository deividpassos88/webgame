export const MAX_FATIGUE = 500;
export const FATIGUE_SKILL_RECOVERY_PERCENT = 7;
/** Cada dash (Shift) custa 20% da barra de fadiga. */
export const DASH_FATIGUE_COST_PERCENT = 20;
export const DASH_FATIGUE_COST = MAX_FATIGUE * DASH_FATIGUE_COST_PERCENT / 100;
export const MIN_FATIGUE_TO_RESUME_SKILLS = Math.ceil(
  MAX_FATIGUE * FATIGUE_SKILL_RECOVERY_PERCENT / 100
);
const DRAIN_PER_SECOND = 2.4;
const RECOVERY_PER_SECOND = 125;

/**
 * UI-facing exertion meter. It deliberately has no authority over movement
 * speed or input, keeping the recently stabilised movement controller intact.
 */
export class FatigueMeter {
  private maxFatigue: number;
  private value: number;
  private skillExhausted = false;

  constructor(maxFatigue = MAX_FATIGUE) {
    this.maxFatigue = maxFatigue;
    this.value = maxFatigue;
  }

  public setMaxFatigue(maxFatigue: number): void {
    const safe = Number.isFinite(maxFatigue) ? Math.max(MAX_FATIGUE, maxFatigue) : MAX_FATIGUE;
    const diff = safe - this.maxFatigue;
    this.maxFatigue = safe;
    if (diff > 0) {
      this.value = Math.min(this.maxFatigue, this.value + diff);
    } else {
      this.value = Math.min(this.maxFatigue, this.value);
    }
  }

  public get currentMaxFatigue(): number {
    return this.maxFatigue;
  }

  public costForPercent(percent: number): number {
    const safe = Number.isFinite(percent) ? Math.max(0, percent) : 0;
    return this.maxFatigue * safe / 100;
  }

  public canAffordPercent(percent: number): boolean {
    return this.canUseSkills && this.value + 1e-6 >= this.costForPercent(percent);
  }

  public consumePercent(percent: number): number {
    return this.consume(this.costForPercent(percent));
  }

  /** Custo imediato (dash etc.): derruba a barra e pode exaurir skills. */
  public consume(amount: number): number {
    const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    this.value = Math.max(0, this.value - safe);
    if (this.value <= 0) this.skillExhausted = true;
    if (this.skillExhausted && this.value >= MIN_FATIGUE_TO_RESUME_SKILLS) {
      this.skillExhausted = false;
    }
    return Math.round(this.value);
  }

  public update(delta: number, moving: boolean, hold = false): number {
    if (hold) return Math.round(this.value);
    const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    const rate = moving ? -DRAIN_PER_SECOND : RECOVERY_PER_SECOND;
    this.value = Math.min(this.maxFatigue, Math.max(0, this.value + rate * safeDelta));
    if (this.value <= 0) this.skillExhausted = true;
    if (this.skillExhausted && this.value >= MIN_FATIGUE_TO_RESUME_SKILLS) {
      this.skillExhausted = false;
    }
    return Math.round(this.value);
  }

  public get canUseSkills(): boolean {
    return !this.skillExhausted && this.value > 0;
  }

  public get canDash(): boolean {
    return !this.skillExhausted && this.value >= DASH_FATIGUE_COST;
  }

  public get isSkillExhausted(): boolean {
    return this.skillExhausted;
  }

  public reset(): number {
    this.value = this.maxFatigue;
    this.skillExhausted = false;
    return this.value;
  }
}


