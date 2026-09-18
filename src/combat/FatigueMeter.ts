export const MAX_FATIGUE = 500;
export const FATIGUE_SKILL_RECOVERY_PERCENT = 7;
/** Cada dash (Shift) custa metade da barra de fadiga. */
export const DASH_FATIGUE_COST_PERCENT = 50;
export const DASH_FATIGUE_COST = MAX_FATIGUE * DASH_FATIGUE_COST_PERCENT / 100;
export const MIN_FATIGUE_TO_RESUME_SKILLS = Math.ceil(
  MAX_FATIGUE * FATIGUE_SKILL_RECOVERY_PERCENT / 100
);
const DRAIN_PER_SECOND = 2.4;
const RECOVERY_PER_SECOND = 18;

/**
 * UI-facing exertion meter. It deliberately has no authority over movement
 * speed or input, keeping the recently stabilised movement controller intact.
 */
export class FatigueMeter {
  private value = MAX_FATIGUE;
  private skillExhausted = false;

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

  public update(delta: number, moving: boolean): number {
    const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    const rate = moving ? -DRAIN_PER_SECOND : RECOVERY_PER_SECOND;
    this.value = Math.min(MAX_FATIGUE, Math.max(0, this.value + rate * safeDelta));
    if (this.value <= 0) this.skillExhausted = true;
    if (this.skillExhausted && this.value >= MIN_FATIGUE_TO_RESUME_SKILLS) {
      this.skillExhausted = false;
    }
    return Math.round(this.value);
  }

  public get canUseSkills(): boolean {
    return !this.skillExhausted;
  }

  public get isSkillExhausted(): boolean {
    return this.skillExhausted;
  }

  public reset(): number {
    this.value = MAX_FATIGUE;
    this.skillExhausted = false;
    return this.value;
  }
}
