import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const game = readFileSync(new URL('./Game.ts', import.meta.url), 'utf8');

describe('dano em área dos ataques básicos (contrato do Game)', () => {
  it('a Maga respinga 1/4 do dano da arma pelos 2 m do impacto', () => {
    const start = game.indexOf('private applyMageBasicSplashDamage');
    const end = game.indexOf('private applyMageSkillBodyDamage', start);
    const splash = game.slice(start, end);

    expect(splash).toContain('basicAttackAreaDamage(baseDamage)');
    expect(splash).toContain('MAGE_BASIC_SPLASH_RADIUS_METERS');
  });

  it('o leque do Guerreiro para no alvo: alvo cheio, vizinhos de 2 m a 1/4', () => {
    const start = game.indexOf('private applyWarriorBasicWaveDamage');
    const end = game.indexOf('private onWarriorSkillHit', start);
    const wave = game.slice(start, end);

    // O alvo leva o dano cheio (com o falloff normal do leque)...
    expect(wave).toContain("applyDistanceFalloff(baseDamage, closestDist, 'warrior-wave')");
    // ...e o respingo é 1/4 do dano do alvo, limitado a 2 m dele.
    expect(wave).toContain('basicAttackAreaDamage(primaryDamage)');
    expect(wave).toContain('isInsideBasicAttackArea(');
    // Nada de dano cheio para todo mundo do cone: o alvo é escolhido antes.
    expect(wave).toContain('O leque para no primeiro corpo');
    expect(wave).not.toContain(`for (const record of records) {
      const target = record.enemy.root.position;`);
  });

  it('o contador HITS só conta e só vive durante o combo de skills', () => {
    // Dano de ataque básico (e o respingo) não conta hit.
    expect(game).toContain(
      "if (variant === 'damage' && this.comboHitWindowActive()) this.hitCounter.registerHit();"
    );
    // Fora do combo o contador é zerado, então ele some da tela.
    expect(game).toContain(
      'if (this.player.isDead || !this.comboHitWindowActive()) this.hitCounter.reset();'
    );
    // A janela é o combo de skills (barra aberta ou skill do combo rodando).
    expect(game).toContain(
      'return this.skillCombo.active || this.player.activeSkillRemainingSeconds > 0;'
    );
  });
});
