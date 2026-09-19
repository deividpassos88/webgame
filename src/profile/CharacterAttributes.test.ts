import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_INITIAL_CAP,
  ATTRIBUTE_GATE_STEP,
  ATTRIBUTE_SOLO_CAP,
  ATTRIBUTE_KEYS,
  attributeAllocationAllowance,
  getAttributeAllocationCap,
  createDefaultCharacterAttributes,
  deriveCharacterStats,
  normalizeCharacterAttributes,
  type CharacterAttributeKey,
} from './CharacterAttributes';

describe('CharacterAttributes', () => {
  it('creates a zeroed allocation for every supported attribute', () => {
    expect(createDefaultCharacterAttributes()).toEqual({
      vitality: 0,
      attack: 0,
      defense: 0,
      agility: 0,
      criticalAttack: 0,
      criticalDamage: 0,
      criticalMagic: 0,
      lifeSteal: 0,
      dodge: 0,
    });
    // Nine attributes since the Força -> Vitalidade rework.
    expect(ATTRIBUTE_KEYS).toHaveLength(9);
    expect(ATTRIBUTE_KEYS).toContain('vitality');
    expect(ATTRIBUTE_KEYS).not.toContain('strength');
  });

  it('normalizes malformed values without allowing negative or fractional points', () => {
    const malformed: Partial<Record<CharacterAttributeKey, unknown>> = {
      vitality: 4.9,
      attack: -2,
      defense: 999,
      agility: 'fast',
    };

    expect(normalizeCharacterAttributes(malformed)).toEqual({
      vitality: 4,
      attack: 0,
      defense: 100,
      agility: 0,
      criticalAttack: 0,
      criticalDamage: 0,
      criticalMagic: 0,
      lifeSteal: 0,
      dodge: 0,
    });
  });

  it('derives the approved formulas and caps from the allocation', () => {
    const stats = deriveCharacterStats({
      vitality: 10,
      attack: 10,
      defense: 80,
      agility: 100,
      criticalAttack: 100,
      criticalDamage: 100,
      criticalMagic: 50,
      lifeSteal: 100,
      dodge: 100,
    });

    // Vitality: 3 HP per point.
    expect(stats.maxHealthBonus).toBeCloseTo(30);
    expect(stats.physicalDamageMultiplier).toBeCloseTo(1);
    expect(stats.baseAttackBonus).toBeCloseTo(10);
    // Defense 80 reaches 80/120 = 66.67% reduction (under 70% cap).
    expect(stats.damageReduction).toBeCloseTo(80 / 120);
    expect(stats.movementSpeedMultiplier).toBeCloseTo(1.40);
    expect(stats.attackSpeedMultiplier).toBeCloseTo(1.35);
    expect(stats.criticalAttackChance).toBeCloseTo(0.50);
    expect(stats.magicCriticalChance).toBeCloseTo(0.25);
    // Critical Damage: 1.5x base + 1.5% per point, capped at +150% (3.0x total).
    expect(stats.criticalMultiplier).toBeCloseTo(3.0);
    // Life Steal: 0.20% per point, capped at 20%.
    expect(stats.lifeStealFraction).toBeCloseTo(0.20);
    expect(stats.dodgeChance).toBeCloseTo(0.35);
  });

  it('caps life steal and critical damage below their maximum allocations', () => {
    const base = createDefaultCharacterAttributes();
    const stats = deriveCharacterStats({ ...base, criticalDamage: 250, lifeSteal: 400 });

    expect(stats.criticalMultiplier).toBeCloseTo(3.0);
    expect(stats.lifeStealFraction).toBeCloseTo(0.20);
  });

  it('resolves derived values against caller-provided base combat stats', () => {
    const stats = deriveCharacterStats(
      { vitality: 20, attack: 5, defense: 0, agility: 50, criticalAttack: 0, criticalDamage: 0, criticalMagic: 0, lifeSteal: 0, dodge: 0 },
      { maxHealth: 100, attackDamage: 8, movementSpeed: 4.5, attackCooldown: 0.67 }
    );

    expect(stats.maxHealth).toBeCloseTo(160);
    // Base weapon damage 8 + 5 Attack points.
    expect(stats.attackDamage).toBeCloseTo(13);
    expect(stats.movementSpeed).toBeCloseTo(4.5 * 1.2);
    expect(stats.attackCooldown).toBeCloseTo(0.67 / 1.175);
  });

  it('enforces gate progression: initial cap 10, unlocks +5 up to 15 when another reaches 10, then +5 up to 20 when another reaches 15', () => {
    const base = createDefaultCharacterAttributes();

    expect(ATTRIBUTE_INITIAL_CAP).toBe(10);
    expect(ATTRIBUTE_GATE_STEP).toBe(5);

    // When all other stats are < 10, cap is 10.
    expect(getAttributeAllocationCap(base, 'attack')).toBe(10);
    expect(attributeAllocationAllowance(base, 'attack', 12, 12)).toBe(10);

    const withAttack10 = { ...base, attack: 10 };
    expect(attributeAllocationAllowance(withAttack10, 'attack', 5, 5)).toBe(0);

    // Defense reaches 10 -> unlocks attack up to 15.
    const withDefense10 = { ...base, attack: 10, defense: 10 };
    expect(getAttributeAllocationCap(withDefense10, 'attack')).toBe(15);
    expect(attributeAllocationAllowance(withDefense10, 'attack', 5, 5)).toBe(5);

    // Attack is 15, defense is 10 -> attack is capped at 15.
    const withAttack15 = { ...base, attack: 15, defense: 10 };
    expect(getAttributeAllocationCap(withAttack15, 'attack')).toBe(15);
    expect(attributeAllocationAllowance(withAttack15, 'attack', 5, 5)).toBe(0);

    // Defense reaches 15 -> unlocks attack up to 20.
    const withDefense15 = { ...base, attack: 15, defense: 15 };
    expect(getAttributeAllocationCap(withDefense15, 'attack')).toBe(20);
    expect(attributeAllocationAllowance(withDefense15, 'attack', 5, 5)).toBe(5);

    // Defense reaches 20 -> unlocks attack up to 25.
    const withDefense20 = { ...base, attack: 20, defense: 20 };
    expect(getAttributeAllocationCap(withDefense20, 'attack')).toBe(25);
    expect(attributeAllocationAllowance(withDefense20, 'attack', 5, 5)).toBe(5);
  });
});
