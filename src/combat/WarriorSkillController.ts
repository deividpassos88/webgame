import {
  WARRIOR_SKILLS,
  getWarriorSkill,
  type WarriorSkillId,
} from './WarriorSkillCatalog';

export type SkillRejectionReason =
  | 'cooldown'
  | 'insufficient-energy'
  | 'busy'
  | 'paused'
  | 'dead';

export type SkillActivationResult =
  | { readonly kind: 'activated'; readonly attackId: WarriorSkillId }
  | { readonly kind: 'rejected'; readonly reason: SkillRejectionReason };

export interface SkillActivationContext {
  readonly busy?: boolean;
  readonly paused?: boolean;
  readonly dead?: boolean;
  /** Admin-only training runs can preview every skill without energy or cooldown cost. */
  readonly free?: boolean;
  /** Skip the cooldown gate without waiving the energy cost. */
  readonly waiveCooldown?: boolean;
}

export interface SkillStateSnapshot {
  readonly cooldown: number;
  readonly cooldownRemaining: number;
  readonly energyCost: number;
  readonly available: boolean;
  /** Mage-only fatigue percent copied onto the HUD snapshot. */
  readonly fatigueCostPercent?: number;
  readonly fatigueAffordable?: boolean;
}

export interface WarriorSkillsSnapshot {
  readonly energy: number;
  readonly maxEnergy: number;
  readonly regenerationDelayRemaining: number;
  readonly skills: Record<WarriorSkillId, SkillStateSnapshot>;
}

const MAX_ENERGY = 50;
/**
 * Mana recovers like the fatigue bar: 100% in 4 seconds while standing
 * still, nothing while moving (the fatigue "parado" signal).
 */
const RECOVERY_PER_SECOND = MAX_ENERGY / 4;
const REGENERATION_DELAY = 1;

export class WarriorSkillController {
  private energy = MAX_ENERGY;
  private regenerationDelayRemaining = 0;
  private readonly cooldowns = Object.fromEntries(
    WARRIOR_SKILLS.map(({ id }) => [id, 0])
  ) as Record<WarriorSkillId, number>;
  private refundableActivation: WarriorSkillId | null = null;

  public tryActivate(
    id: WarriorSkillId,
    context: SkillActivationContext = {}
  ): SkillActivationResult {
    if (context.dead) return { kind: 'rejected', reason: 'dead' };
    if (context.paused) return { kind: 'rejected', reason: 'paused' };
    if (context.busy) return { kind: 'rejected', reason: 'busy' };

    const definition = getWarriorSkill(id);
    const waiveCooldown = context.free || context.waiveCooldown === true;
    if (!waiveCooldown && this.cooldowns[id] > 0) return { kind: 'rejected', reason: 'cooldown' };
    if (!context.free && this.energy < definition.energyCost) {
      return { kind: 'rejected', reason: 'insufficient-energy' };
    }

    if (!context.free) {
      this.energy -= definition.energyCost;
      this.cooldowns[id] = waiveCooldown ? 0 : definition.cooldown;
      this.regenerationDelayRemaining = REGENERATION_DELAY;
      this.refundableActivation = id;
    } else {
      this.cooldowns[id] = 0;
      this.regenerationDelayRemaining = 0;
      this.refundableActivation = null;
    }
    return { kind: 'activated', attackId: id };
  }

  public canSpend(amount: number): boolean {
    const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    return this.energy + 1e-6 >= safe;
  }

  /** Mana spend that is not a skill activation. Used by the Mage blink. */
  public spend(amount: number): boolean {
    const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    if (this.energy + 1e-6 < safe) return false;
    this.energy -= safe;
    this.regenerationDelayRemaining = Math.max(this.regenerationDelayRemaining, REGENERATION_DELAY);
    return true;
  }

  public refund(id: WarriorSkillId): boolean {
    if (this.refundableActivation !== id) return false;
    const definition = getWarriorSkill(id);
    this.energy = Math.min(MAX_ENERGY, this.energy + definition.energyCost);
    this.cooldowns[id] = 0;
    this.regenerationDelayRemaining = 0;
    this.refundableActivation = null;
    return true;
  }

  public update(delta: number, paused: boolean, moving = false): void {
    if (paused || !Number.isFinite(delta) || delta <= 0) return;
    this.refundableActivation = null;

    for (const skill of WARRIOR_SKILLS) {
      this.cooldowns[skill.id] = Math.max(0, this.cooldowns[skill.id] - delta);
    }

    this.regenerationDelayRemaining = Math.max(0, this.regenerationDelayRemaining - delta);
    // Igual à fadiga: parado recupera 100% em 4 segundos; andando não recupera.
    if (!moving) {
      this.energy = Math.min(MAX_ENERGY, this.energy + delta * RECOVERY_PER_SECOND);
    }
  }

  public reset(): void {
    this.energy = MAX_ENERGY;
    this.regenerationDelayRemaining = 0;
    this.refundableActivation = null;
    for (const skill of WARRIOR_SKILLS) this.cooldowns[skill.id] = 0;
  }

  public snapshot(): WarriorSkillsSnapshot {
    const skills = Object.fromEntries(
      WARRIOR_SKILLS.map((definition) => {
        const cooldownRemaining = this.cooldowns[definition.id];
        return [
          definition.id,
          {
            cooldown: definition.cooldown,
            cooldownRemaining,
            energyCost: definition.energyCost,
            available: cooldownRemaining <= 0 && this.energy >= definition.energyCost,
          },
        ];
      })
    ) as Record<WarriorSkillId, SkillStateSnapshot>;

    return {
      energy: this.energy,
      maxEnergy: MAX_ENERGY,
      regenerationDelayRemaining: this.regenerationDelayRemaining,
      skills,
    };
  }
}
