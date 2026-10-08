import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';

interface DodgeHarness {
  player: {
    root: { position: unknown };
    hp: number;
    takeBossSkillDamage: (damage: number) => void;
  };
  getCharacterStats: () => { dodgeChance: number; damageReduction: number };
  resolveIncomingDamage(damage: number, dodgeResult?: { dodged: boolean }): number;
  showFloatingMessage(position: unknown, message: string, variant: string): void;
  onBossSkillHitPlayer(damage: number): void;
}

function gameWithDodgeChance(chance: number): DodgeHarness {
  const game = Object.create(Game.prototype) as DodgeHarness;
  const position = { x: 0, y: 0, z: 0 };
  game.player = {
    root: { position },
    hp: 100,
    takeBossSkillDamage: vi.fn(),
  };
  game.getCharacterStats = () => ({ dodgeChance: chance, damageReduction: 0 });
  game.showFloatingMessage = vi.fn();
  return game;
}

afterEach(() => vi.restoreAllMocks());

describe('esquiva em combate', () => {
  it('evita todo o dano e mostra o feedback quando o sorteio de esquiva funciona', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const game = gameWithDodgeChance(0.35);

    game.onBossSkillHitPlayer(40);

    expect(game.player.takeBossSkillDamage).not.toHaveBeenCalled();
    expect(game.showFloatingMessage).toHaveBeenCalledWith(
      game.player.root.position,
      'Esquivou!',
      'dodge'
    );
  });

  it('aplica o dano normalmente quando o sorteio fica fora da chance', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const game = gameWithDodgeChance(0.35);
    const result = { dodged: false };

    expect(game.resolveIncomingDamage(40, result)).toBe(40);
    expect(result.dodged).toBe(false);
  });
});
