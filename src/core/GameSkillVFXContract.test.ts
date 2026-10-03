import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const game = readFileSync(new URL('./Game.ts', import.meta.url), 'utf8');
const player = readFileSync(new URL('../entities/Player.ts', import.meta.url), 'utf8');

/** Recorta o corpo de um método do Game.ts (até o início do próximo método). */
function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `assinatura ausente: ${signature}`).toBeGreaterThan(-1);
  const boundaries = ['\n  private ', '\n  public ', '\n  protected ']
    .map((marker) => source.indexOf(marker, start + signature.length))
    .filter((index) => index >= 0);
  const end = boundaries.length > 0 ? Math.min(...boundaries) : source.length;
  return source.slice(start, end);
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('Game skill VFX binding contract', () => {
  it('routes every cast effect through the per-skill binding table', () => {
    expect(game).toContain('this.playSkillCastEffects(id);');
    expect(game).toContain("getSkillVisualEffectsForStage(playerClass, id, 'cast')");
    // Nenhum atalho hardcoded por id de skill sobreviveu no cast.
    expect(game).not.toMatch(/if \(id === 'ataque_giratorio'/);
    expect(game).not.toMatch(/if \(id === 'pulo_atacando'/);
  });

  it('keeps the warrior spin and jump-dive effects inside the binding dispatcher', () => {
    const dispatcher = methodBody(game, 'private playSkillVisualEffect(');
    expect(count(dispatcher, 'this.warriorSlashVFX.playSpin({')).toBe(2);
    expect(count(dispatcher, 'this.warriorSlashVFX.playJumpDive({')).toBe(1);
    expect(dispatcher).toContain("case 'warrior-spin-ring':");
    expect(dispatcher).toContain("case 'warrior-frost-spin-ring':");
    expect(dispatcher).toContain("case 'warrior-jump-dive':");

    // Fora do dispatcher o Game não dispara esses efeitos em lugar nenhum.
    expect(count(game, 'this.warriorSlashVFX.playSpin({'))
      .toBe(count(dispatcher, 'this.warriorSlashVFX.playSpin({'));
    expect(count(game, 'this.warriorSlashVFX.playJumpDive({'))
      .toBe(count(dispatcher, 'this.warriorSlashVFX.playJumpDive({'));
  });

  it('never draws a warrior effect for the mage spell binding', () => {
    const dispatcher = methodBody(game, 'private playSkillVisualEffect(');
    const mageCase = dispatcher.slice(dispatcher.indexOf("case 'mage-spell':"));
    expect(mageCase).not.toContain('warriorSlashVFX');
  });

  it('takes the hit-window fans and the impact flashes from the binding table too', () => {
    const window = methodBody(game, 'private onWarriorAttackWindow(');
    expect(window).toContain("getSkillVisualEffectsForStage(");
    expect(window).toContain("'hit-window'");
    expect(window).not.toContain("event.attackId === 'triplo_ataque'");
    expect(window).not.toContain("event.attackId === 'corte_duplo'");

    const hit = methodBody(game, 'private onWarriorSkillHit(');
    expect(hit).toContain('this.playSkillImpactFlash(event.attackId, record.enemy.root.position);');
    expect(hit).not.toContain('this.warriorSlashVFX.playImpact(');

    const flash = methodBody(game, 'private playSkillImpactFlash(');
    expect(flash).toContain("'impact'");
    expect(flash).toContain('this.warriorSlashVFX.playImpact(position, effect.scale, effect.style);');
  });

  it('binds each mage spell in the shared table instead of a private map', () => {
    expect(player).toContain("getSkillMageSpellId('mage', skillId)");
    expect(player).not.toContain('MAGE_SPELL_BY_ATTACK_ID');
  });
});

describe('Game combo reward contract', () => {
  it('speeds up and doubles the damage of every skill after the first link', () => {
    expect(game).toContain('const empowered = this.skillCombo.empowered;');
    expect(game).toContain('playbackScale: comboPlaybackMultiplier(empowered),');
    expect(game).toContain('this.comboDamageBySkill.set(id, comboDamageMultiplier(empowered));');
    // Guerreiro e Maga multiplicam o dano da skill pelo bônus gravado no cast.
    expect(count(game, '* this.comboDamageMultiplierFor(')).toBe(2);
    expect(game).toContain('this.comboDamageMultiplierFor(event.attackId)');
    expect(game).toContain('this.comboDamageMultiplierFor(attackId)');
  });

  it('applies the combo immunity from the first skill until the combo resolves', () => {
    expect(game).toContain('this.comboImmunity.onSkillCast(');
    expect(game).toContain('this.player.setComboInvulnerability(');
    expect(game).toContain('this.comboImmunity.update({');
    expect(game).toContain('skillRemainingSeconds: this.player.activeSkillRemainingSeconds,');
    // Morte/overlay/reset derrubam a imunidade junto com o combo.
    expect(count(game, 'this.comboImmunity.reset();')).toBeGreaterThanOrEqual(2);
  });
});
