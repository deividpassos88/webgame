import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';

type PlayableTestClass = 'paladin' | 'mage';

interface CriticalRollState {
  isCritical: boolean;
}

interface GameCriticalDamageHarness {
  profile: { selectedClass: PlayableTestClass };
  getCharacterStats: () => {
    criticalAttackChance: number;
    magicCriticalChance: number;
    criticalMultiplier: number;
  };
  resolveOutgoingDamage(
    baseDamage: number,
    elemental: boolean,
    criticalHit?: CriticalRollState
  ): number;
}

afterEach(() => vi.restoreAllMocks());

function gameWithCriticalStats(selectedClass: PlayableTestClass): GameCriticalDamageHarness {
  const game = Object.create(Game.prototype) as unknown as GameCriticalDamageHarness;
  game.profile = { selectedClass };
  game.getCharacterStats = () => ({
    criticalAttackChance: 0.25,
    magicCriticalChance: 0.4,
    criticalMultiplier: 3,
  });
  return game;
}

describe('acerto crítico por classe', () => {
  it('Guerreiro usa Ataque Crítico e causa 3× no sorteio, mesmo em skill elemental', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.3);
    const game = gameWithCriticalStats('paladin');
    const critical = { isCritical: false };
    const normal = { isCritical: true };

    // O sinal elemental do golpe não troca Guerreiro para Ataque Mágico.
    expect(game.resolveOutgoingDamage(80, true, critical)).toBe(240);
    expect(critical.isCritical).toBe(true);
    expect(game.resolveOutgoingDamage(80, false, normal)).toBe(80);
    expect(normal.isCritical).toBe(false);
  });

  it('Maga usa Ataque Mágico até no básico sem elemento explícito e causa 3×', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.35);
    const game = gameWithCriticalStats('mage');
    const critical = { isCritical: false };

    expect(game.resolveOutgoingDamage(50, false, critical)).toBe(150);
    expect(critical.isCritical).toBe(true);
  });
});
