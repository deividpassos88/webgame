/**
 * Attributes that can be assigned by the player after choosing a class.
 *
 * Strength was replaced by Vitality: damage already belongs to Attack, and the
 * old Strength mixed a flat health bonus with a physical damage multiplier,
 * which made it overlap both Attack and Vitality. Critical Damage and Life
 * Steal were added so gear can differ beyond flat attack/defense values.
 */
export const ATTRIBUTE_KEYS = [
  'vitality',
  'attack',
  'defense',
  'agility',
  'criticalAttack',
  'criticalDamage',
  'criticalMagic',
  'lifeSteal',
  'dodge',
] as const;

export type CharacterAttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export type CharacterAttributes = Record<CharacterAttributeKey, number>;

export const TOTAL_ATTRIBUTE_POINTS = 40;
/**
 * A build may invest freely in one attribute only through the initial threshold (10).
 * Investing beyond it requires a second attribute to have reached the same milestone,
 * which unlocks +5 points (up to 15), then locking until another reaches 15 to unlock
 * up to 20, and so on in 5-point increments.
 */
export const ATTRIBUTE_INITIAL_CAP = 10;
export const ATTRIBUTE_GATE_STEP = 5;
export const ATTRIBUTE_SOLO_CAP = 10;

const MAX_ATTRIBUTE_VALUE = 100;
const MAX_DEFENSE_REDUCTION = 0.70;
const MAX_MOVEMENT_SPEED_BONUS = 0.40;
const MAX_ATTACK_SPEED_BONUS = 0.35;
const MAX_CRITICAL_CHANCE = 0.50;
const MAX_DODGE_CHANCE = 0.35;
/** Absolute health granted by one Vitality point. */
const HEALTH_PER_VITALITY = 3;
/** Flat damage granted by one Attack point. */
const DAMAGE_PER_ATTACK = 1;
/** Defense points needed to reach 50% damage reduction. */
const DEFENSE_REDUCTION_DENOMINATOR = 40;
const BASE_CRITICAL_MULTIPLIER = 1.5;
const MAX_CRITICAL_DAMAGE_BONUS = 1.5;
const MAX_LIFE_STEAL = 0.20;
/** Maximum bonus fatigue granted by Agility. */
export const MAX_FATIGUE_BONUS = 200;
/** Absolute fatigue reserve added by each Agility point. */
export const FATIGUE_PER_AGILITY = 2;

export interface CharacterCombatBaseStats {
  readonly maxHealth?: number;
  readonly maxFatigue?: number;
  readonly attackDamage?: number;
  readonly movementSpeed?: number;
  readonly attackCooldown?: number;
}

export interface DerivedCharacterStats {
  /** Absolute health added by Vitality. */
  readonly maxHealthBonus: number;
  /** Base health after applying Vitality. */
  readonly maxHealth: number;
  /** Absolute fatigue added by Agility. */
  readonly maxFatigueBonus: number;
  /** Maximum fatigue reserve after applying Agility. */
  readonly maxFatigue: number;
  /**
   * Seam for future damage buffs. No attribute drives it since Strength was
   * replaced by Vitality: physical damage now comes from Attack alone.
   */
  readonly physicalDamageMultiplier: number;
  /** Flat strike damage added by the Attack points. */
  readonly baseAttackBonus: number;
  /** Defense converted to a capped damage-reduction fraction. */
  readonly damageReduction: number;
  /** Multipliers applied to movement and attack speed. */
  readonly movementSpeedMultiplier: number;
  readonly attackSpeedMultiplier: number;
  /** Base values resolved with the speed and damage bonuses. */
  readonly movementSpeed: number;
  readonly attackCooldown: number;
  /**
   * Damage of one strike before critical hits and distance falloff: the weapon
   * base plus the Attack points. This is the number the status sheet prints.
   */
  readonly attackDamage: number;
  /** Chance values are represented as fractions (0.35 = 35%). */
  readonly criticalAttackChance: number;
  readonly magicCriticalChance: number;
  /** Damage multiplier applied on a critical hit (1.5x plus Critical Damage). */
  readonly criticalMultiplier: number;
  readonly dodgeChance: number;
  /** Fraction of the damage dealt that is returned as health (0.15 = 15%). */
  readonly lifeStealFraction: number;
}

export function createDefaultCharacterAttributes(): CharacterAttributes {
  return {
    vitality: 0,
    attack: 0,
    defense: 0,
    agility: 0,
    criticalAttack: 0,
    criticalDamage: 0,
    criticalMagic: 0,
    lifeSteal: 0,
    dodge: 0,
  };
}

/**
 * Converts persisted or UI input into safe integer attribute values.
 * Unknown keys are ignored and missing keys default to zero.
 */
export function normalizeCharacterAttributes(value: unknown): CharacterAttributes {
  const source = isRecord(value) ? value : {};
  const normalized = createDefaultCharacterAttributes();
  for (const key of ATTRIBUTE_KEYS) {
    const candidate = source[key];
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) continue;
    normalized[key] = clamp(Math.floor(candidate), 0, MAX_ATTRIBUTE_VALUE);
  }
  return normalized;
}

export function totalCharacterAttributePoints(attributes: CharacterAttributes): number {
  return ATTRIBUTE_KEYS.reduce((total, key) => total + safeInteger(attributes[key]), 0);
}

export function remainingCharacterAttributePoints(attributes: CharacterAttributes): number {
  return Math.max(0, TOTAL_ATTRIBUTE_POINTS - totalCharacterAttributePoints(attributes));
}

/**
 * Resolves the dynamic allocation cap for a specific attribute based on the gate progression rule:
 * Initial cap is 10. Reaching 10 unlocks +5 (up to 15) only when another attribute reaches >= 10.
 * Reaching 15 unlocks +5 (up to 20) only when another attribute reaches >= 15, and so on.
 */
export function getAttributeAllocationCap(
  attributes: CharacterAttributes,
  attribute: CharacterAttributeKey
): number {
  const normalized = normalizeCharacterAttributes(attributes);
  let maxOther = 0;
  for (const key of ATTRIBUTE_KEYS) {
    if (key !== attribute && normalized[key] > maxOther) {
      maxOther = normalized[key];
    }
  }
  if (maxOther < ATTRIBUTE_INITIAL_CAP) {
    return ATTRIBUTE_INITIAL_CAP;
  }
  return (
    ATTRIBUTE_INITIAL_CAP +
    ATTRIBUTE_GATE_STEP * (Math.floor((maxOther - ATTRIBUTE_INITIAL_CAP) / ATTRIBUTE_GATE_STEP) + 1)
  );
}

/**
 * Resolves how many of a requested batch can be assigned right now. It is
 * intentionally pure so UI previews and persisted-profile writes use exactly
 * the same dynamic gate progression.
 */
export function attributeAllocationAllowance(
  attributes: CharacterAttributes,
  attribute: CharacterAttributeKey,
  requested: number,
  pointsAvailable: number
): number {
  const normalized = normalizeCharacterAttributes(attributes);
  const safeRequest = safeInteger(requested);
  const safeBudget = safeInteger(pointsAvailable);
  if (safeRequest === 0 || safeBudget === 0) return 0;

  const attributeCap = getAttributeAllocationCap(normalized, attribute);
  const remainingForAttribute = Math.max(0, attributeCap - normalized[attribute]);

  return Math.min(safeRequest, safeBudget, remainingForAttribute);
}

/**
 * Applies the approved build formulas. The optional base values let gameplay
 * resolve the same formula against the live player's weapon and movement
 * values while keeping this module pure and independent from Three.js.
 */
export function deriveCharacterStats(
  attributes: CharacterAttributes,
  base: CharacterCombatBaseStats = {}
): DerivedCharacterStats {
  const safe = normalizeCharacterAttributes(attributes);
  const maxHealthBonus = safe.vitality * HEALTH_PER_VITALITY;
  const physicalDamageMultiplier = 1;
  const baseAttackBonus = safe.attack * DAMAGE_PER_ATTACK;
  const defenseReduction =
    safe.defense / (safe.defense + DEFENSE_REDUCTION_DENOMINATOR);
  const damageReduction = clamp(defenseReduction, 0, MAX_DEFENSE_REDUCTION);
  const movementSpeedMultiplier = 1 + Math.min(MAX_MOVEMENT_SPEED_BONUS, safe.agility * 0.004);
  const attackSpeedMultiplier = 1 + Math.min(MAX_ATTACK_SPEED_BONUS, safe.agility * 0.0035);
  const criticalAttackChance = Math.min(MAX_CRITICAL_CHANCE, safe.criticalAttack * 0.005);
  const magicCriticalChance = Math.min(MAX_CRITICAL_CHANCE, safe.criticalMagic * 0.005);
  const dodgeChance = Math.min(MAX_DODGE_CHANCE, safe.dodge * 0.0035);
  const criticalMultiplier = BASE_CRITICAL_MULTIPLIER
    + Math.min(MAX_CRITICAL_DAMAGE_BONUS, safe.criticalDamage * 0.015);
  const lifeStealFraction = Math.min(MAX_LIFE_STEAL, safe.lifeSteal * 0.002);

  const maxHealth = safeBase(base.maxHealth, 100) + maxHealthBonus;
  const maxFatigueBonus = Math.min(MAX_FATIGUE_BONUS, safe.agility * FATIGUE_PER_AGILITY);
  const maxFatigue = safeBase(base.maxFatigue, 500) + maxFatigueBonus;
  const attackDamage = safeBase(base.attackDamage, 0) + baseAttackBonus;
  const movementSpeed = safeBase(base.movementSpeed, 1) * movementSpeedMultiplier;
  const baseCooldown = safeBase(base.attackCooldown, 1);
  const attackCooldown = baseCooldown / attackSpeedMultiplier;

  return {
    maxHealthBonus,
    maxHealth,
    maxFatigueBonus,
    maxFatigue,
    physicalDamageMultiplier,
    baseAttackBonus,
    damageReduction,
    movementSpeedMultiplier,
    attackSpeedMultiplier,
    movementSpeed,
    attackCooldown,
    attackDamage,
    criticalAttackChance,
    magicCriticalChance,
    criticalMultiplier,
    dodgeChance,
    lifeStealFraction,
  };
}

function safeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function safeBase(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
