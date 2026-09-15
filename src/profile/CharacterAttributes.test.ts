import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_SOLO_CAP,
  ATTRIBUTE_KEYS,
  attributeAllocationAllowance,
  createDefaultCharacterAttributes,
  deriveCharacterStats,
  normalizeCharacterAttributes,
  type CharacterAttributeKey,
} from './CharacterAttributes';

describe('CharacterAttributes', () => {
  it('creates a zeroed allocation for every supported attribute', () => {
    expect(createDefaultCharacterAttributes()).toEqual({
      strength: 0,
      attack: 0,
      defense: 0,
      agility: 0,
      criticalAttack: 0,
      criticalMagic: 0,
      dodge: 0,
    });
    expect(ATTRIBUTE_KEYS).toHaveLength(7);
  });

  it('normalizes malformed values without allowing negative or fractional points', () => {
    const malformed: Partial<Record<CharacterAttributeKey, unknown>> = {
      strength: 4.9,
      attack: -2,
      defense: 999,
      agility: 'fast',
    };

    expect(normalizeCharacterAttributes(malformed)).toEqual({
      strength: 4,
      attack: 0,
      defense: 100,
      agility: 0,
      criticalAttack: 0,
      criticalMagic: 0,
      dodge: 0,
    });
  });

  it('derives the approved warrior formulas and caps from the allocation', () => {
    const stats = deriveCharacterStats({
      strength: 10,
      attack: 10,
      defense: 80,
      agility: 100,
      criticalAttack: 100,
      criticalMagic: 50,
      dodge: 100,
    });

    expect(stats.maxHealthBonus).toBeCloseTo(3);
    expect(stats.physicalDamageMultiplier).toBeCloseTo(1.05);
    expect(stats.baseAttackBonus).toBeCloseTo(2);
    expect(stats.damageReduction).toBeCloseTo(80 / 240);
    expect(stats.movementSpeedMultiplier).toBeCloseTo(1.25);
    expect(stats.attackSpeedMultiplier).toBeCloseTo(1.2);
    // 100 points produce 30%; the independent 35% cap still protects
    // callers that later support bonuses outside the allocation budget.
    expect(stats.criticalAttackChance).toBeCloseTo(0.3);
    expect(stats.magicCriticalChance).toBeCloseTo(0.15);
    expect(stats.criticalMultiplier).toBeCloseTo(1.5);
    expect(stats.dodgeChance).toBeCloseTo(0.25);
  });

  it('resolves derived values against caller-provided base combat stats', () => {
    const stats = deriveCharacterStats(
      { strength: 20, attack: 5, defense: 0, agility: 50, criticalAttack: 0, criticalMagic: 0, dodge: 0 },
      { maxHealth: 100, attackDamage: 8, movementSpeed: 4.5, attackCooldown: 0.67 }
    );

    expect(stats.maxHealth).toBeCloseTo(106);
    expect(stats.attackDamage).toBeCloseTo(9);
    expect(stats.movementSpeed).toBeCloseTo(4.5 * 1.125);
    expect(stats.attackCooldown).toBeCloseTo(0.67 / 1.1);
  });

  it('stops a five-point allocation at 30 until a second attribute reaches 30', () => {
    const attributes = { ...createDefaultCharacterAttributes(), attack: 28 };

    expect(ATTRIBUTE_SOLO_CAP).toBe(30);
    expect(attributeAllocationAllowance(attributes, 'attack', 5, 5)).toBe(2);
    expect(attributeAllocationAllowance(
      { ...attributes, attack: 30 },
      'attack',
      1,
      5
    )).toBe(0);
    expect(attributeAllocationAllowance(
      { ...attributes, attack: 30, defense: 30 },
      'attack',
      5,
      5
    )).toBe(5);
  });
});
