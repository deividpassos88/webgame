import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BOSS_BASE_HP,
  FINAL_BOSS_HP_BARS,
  FINAL_BOSS_MINION_HP_MULTIPLIER,
  finalBossTotalHp,
} from '../waves/WaveDifficultyScaling';
import { resolveBossBarLayer } from '../ui/BossHealthView';

const game = readFileSync(new URL('./Game.ts', import.meta.url), 'utf8');

/** Recorte do método que cria o boss e os lacaios da batalha final. */
function spawnFinalBattleSource(): string {
  const start = game.indexOf('private spawnFinalBattle(');
  const end = game.indexOf('private fullRunReset(', start);
  return game.slice(start, end);
}

describe('Game final boss contract', () => {
  it('aplica o dobro de vida só nos lacaios da batalha final', () => {
    const source = spawnFinalBattleSource();

    // O multiplicador do pedido (escala por equipamento) é dobrado uma vez só...
    expect(source).toContain(
      'const minionHpMultiplier = request.hpMultiplier * FINAL_BOSS_MINION_HP_MULTIPLIER;'
    );
    // ...e é ele que vai para os três tipos de lacaio, no lugar do cru.
    expect(source.match(/minionHpMultiplier,/g)).toHaveLength(3);
    expect(source).not.toContain('request.hpMultiplier,\n                request.damageMultiplier');
  });

  it('não dobra a vida do boss nem das waves normais', () => {
    const boss = readFileSync(new URL('../entities/Boss.ts', import.meta.url), 'utf8');
    expect(boss).toContain('hp: finalBossTotalHp()');

    // A wave regular continua usando o multiplicador do pedido, sem dobra.
    const regularBatch = game.slice(
      game.indexOf('private spawnRegularBatch('),
      game.indexOf('private spawnFinalBattle(')
    );
    expect(regularBatch).toContain('request.hpMultiplier,');
    expect(regularBatch).not.toContain('FINAL_BOSS_MINION_HP_MULTIPLIER');
    expect(FINAL_BOSS_MINION_HP_MULTIPLIER).toBe(2);
  });

  it('envelhece os efeitos do boss em TODOS os caminhos, sem congelar o aviso', () => {
    const start = game.indexOf('private updateBossSkills(');
    const end = game.indexOf('private updateMiniBossSkills(', start);
    const update = game.slice(start, end);

    // O `update` dos efeitos roda antes de qualquer decisão de IA...
    const effectsUpdate = update.indexOf('this.bossEffects.update(delta);');
    const earlyReturn = update.indexOf('if (!shouldUpdateBossSkills(mode)) {');
    expect(effectsUpdate).toBeGreaterThan(-1);
    expect(effectsUpdate).toBeLessThan(earlyReturn);
    // ...e só existe uma vez: no fim do método ele congelava quando o boss
    // entrava em modo `follow` e o aviso vermelho ficava no chão.
    expect(update.match(/this\.bossEffects\.update\(delta\);/g)).toHaveLength(1);

    // Cancelar o aviso também apaga o desenho no chão.
    expect(update).toContain('this.bossSkills.reset();');
    expect(update).toContain('this.bossEffects.clear();');
  });

  it('corta 20% do total mantendo as 5 barras coloridas', () => {
    expect(finalBossTotalHp()).toBe(5600);
    expect(finalBossTotalHp()).toBe(FINAL_BOSS_HP_BARS * BOSS_BASE_HP);

    const full = resolveBossBarLayer(finalBossTotalHp(), finalBossTotalHp());
    expect(full).toMatchObject({ index: 0, barsRemaining: 5, fill: 1, totalBars: 5 });

    // Cada barra agora vale 1120: metade da primeira barra é 5040 de HP.
    const half = resolveBossBarLayer(5040, finalBossTotalHp());
    expect(half.index).toBe(0);
    expect(half.fill).toBeCloseTo(0.5, 5);
    expect(half.barsRemaining).toBe(5);
  });
});
