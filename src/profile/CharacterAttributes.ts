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

export const TOTAL_ATTRIBUTE_POINTS = 100;
/**
 * A build may invest freely in one attribute only through this threshold.
 * Investing beyond it requires a second attribute to have reached the same
 * milestone, which keeps early builds from becoming one-dimensional.
 */
export const ATTRIBUTE_SOLO_CAP = 30;

const MAX_ATTRIBUTE_VALUE = TOTAL_ATTRIBUTE_POINTS;
const MAX_DEFENSE_REDUCTION = 0.55;
const MAX_MOVEMENT_SPEED_BONUS = 0.25;
const MAX_ATTACK_SPEED_BONUS = 0.2;
const MAX_CRITICAL_CHANCE = 0.35;
const MAX_DODGE_CHANCE = 0.25;
/** Absolute health granted by one Vitality point. */
const HEALTH_PER_VITALITY = 3;
/**
 * Flat damage granted by one Attack point.
 *
 * One point equals one point of damage on purpose: the sheet prints the Attack
 * reading and the weapon damage as a single number, so that number has to be
 * the damage the strike actually deals. At 0.2/point a geared warrior added
 * less than one damage to a hit and every equipment upgrade disappeared in the
 * combat rounding.
 */
const DAMAGE_PER_ATTACK = 1;
/**
 * Defense points needed to reach 50% damage reduction (before the 55% cap).
 * The old denominator (160) turned a full set into ~9% reduction, which the
 * player could not feel: a 12 damage hit landed as 11 instead of 12.
 */
const DEFENSE_REDUCTION_DENOMINATOR = 40;
const BASE_CRITICAL_MULTIPLIER = 1.5;
const MAX_CRITICAL_DAMAGE_BONUS = 1;
const MAX_LIFE_STEAL = 0.15;

export interface CharacterCombatBaseStats {
  readonly maxHealth?: number;
  readonly attackDamage?: number;
  readonly movementSpeed?: number;
  readonly attackCooldown?: number;
}

export interface DerivedCharacterStats {
  /** Absolute health added by Vitality. */
  readonly maxHealthBonus: number;
  /** Base health after applying Vitality. */
  readonly maxHealth: number;
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
 * Resolves how many of a requested batch can be assigned right now. It is
 * intentionally pure so UI previews and persisted-profile writes use exactly
 * the same 30-point gate.
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

  const anotherAttributeReachedGate = ATTRIBUTE_KEYS.some(
    (key) => key !== attribute && normalized[key] >= ATTRIBUTE_SOLO_CAP
  );
  const attributeCap = anotherAttributeReachedGate ? MAX_ATTRIBUTE_VALUE : ATTRIBUTE_SOLO_CAP;
  const remainingForAttribute = Math.max(0, attributeCap - normalized[attribute]);
  const remainingOverall = Math.max(0, TOTAL_ATTRIBUTE_POINTS - totalCharacterAttributePoints(normalized));

  return Math.min(safeRequest, safeBudget, remainingForAttribute, remainingOverall);
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
  const movementSpeedMultiplier = 1 + Math.min(MAX_MOVEMENT_SPEED_BONUS, safe.agility * 0.0025);
  const attackSpeedMultiplier = 1 + Math.min(MAX_ATTACK_SPEED_BONUS, safe.agility * 0.002);
  const criticalAttackChance = Math.min(MAX_CRITICAL_CHANCE, safe.criticalAttack * 0.003);
  const magicCriticalChance = Math.min(MAX_CRITICAL_CHANCE, safe.criticalMagic * 0.003);
  const dodgeChance = Math.min(MAX_DODGE_CHANCE, safe.dodge * 0.0025);
  const criticalMultiplier = BASE_CRITICAL_MULTIPLIER
    + Math.min(MAX_CRITICAL_DAMAGE_BONUS, safe.criticalDamage * 0.01);
  const lifeStealFraction = Math.min(MAX_LIFE_STEAL, safe.lifeSteal * 0.0015);

  const maxHealth = safeBase(base.maxHealth, 100) + maxHealthBonus;
  const attackDamage = safeBase(base.attackDamage, 0) + baseAttackBonus;
  const movementSpeed = safeBase(base.movementSpeed, 1) * movementSpeedMultiplier;
  const baseCooldown = safeBase(base.attackCooldown, 1);
  const attackCooldown = baseCooldown / attackSpeedMultiplier;

  return {
    maxHealthBonus,
    maxHealth,
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
