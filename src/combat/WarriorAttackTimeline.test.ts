import { describe, expect, it } from 'vitest';
import { WARRIOR_ATTACK_IDS } from '../characters/CharacterCatalog';
import { getWarriorAttackTimeline } from './WarriorAttackTimeline';

describe('WarriorAttackTimeline', () => {
  it.each(WARRIOR_ATTACK_IDS)('%s has ordered normalized windows and a long fade', (id) => {
    const timeline = getWarriorAttackTimeline(id);

    expect(timeline.trailStart).toBeGreaterThanOrEqual(0);
    expect(timeline.trailStart).toBeLessThan(timeline.trailEnd);
    expect(timeline.damageStart).toBeLessThan(timeline.damageEnd);
    expect(timeline.damageStart).toBeLessThanOrEqual(timeline.hitTimes[0]);
    expect(timeline.damageEnd).toBeGreaterThanOrEqual(
      timeline.hitTimes[timeline.hitTimes.length - 1]
    );
    expect(timeline.recoveryEnd).toBeLessThanOrEqual(1);
    expect(timeline.fadeSeconds).toBeGreaterThanOrEqual(id === 'ataque_basico' ? 0.4 : 0.9);
    expect(timeline.fadeSeconds).toBeLessThanOrEqual(id === 'ataque_basico' ? 0.8 : 1.4);
  });

  it('defines three real hits for triple attack and two for double cut', () => {
    expect(getWarriorAttackTimeline('triplo_ataque').hitTimes).toEqual([
      0.32,
      0.55,
      0.78,
    ]);
    expect(getWarriorAttackTimeline('corte_duplo').hitTimes).toEqual([0.4, 0.7]);
  });

  it('defines the jump impact at its only damage hit', () => {
    const jump = getWarriorAttackTimeline('pulo_atacando');
    expect(jump.impactTime).toBe(0.68);
    expect(jump.hitTimes).toEqual([0.68]);
  });
});
