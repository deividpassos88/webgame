import { describe, expect, it } from 'vitest';
import { WARRIOR_SKILLS } from '../combat/WarriorSkillCatalog';
import {
  allSkillVisualEffectEntries,
  getSkillMageSpellId,
  getSkillVisualEffects,
  getSkillVisualEffectsForStage,
  isMageSkillVisualEffectKind,
  isWarriorSkillVisualEffectKind,
} from './SkillVisualBindings';

describe('SkillVisualBindings', () => {
  it('binds effects to every Warrior skill and leaves only Corte Duplo stripped on the Mage', () => {
    for (const skill of WARRIOR_SKILLS) {
      expect(getSkillVisualEffects('paladin', skill.id).length).toBeGreaterThan(0);
    }
    // Laser Rajante (Golpe Flamejante da Maga) voltou com o feitiço EXCLUSIVO
    // dele. Corte Duplo segue sem feitiço, sem efeito algum — só a animação.
    expect(getSkillVisualEffects('mage', 'triplo_ataque').map((effect) => effect.effectId))
      .toEqual(['mage.triplo_ataque.radiant-laser-spell']);
    expect(getSkillVisualEffects('mage', 'corte_duplo')).toEqual([]);
    for (const skill of WARRIOR_SKILLS) {
      if (skill.id === 'corte_duplo') continue;
      expect(getSkillVisualEffects('mage', skill.id).length).toBeGreaterThan(0);
    }
  });

  it('never reuses an effectId in another skill, class or stage', () => {
    const seen = new Map<string, string>();
    for (const { playerClass, skillId, effect } of allSkillVisualEffectEntries()) {
      const owner = `${playerClass}:${skillId}`;
      const previous = seen.get(effect.effectId);
      expect(previous, `efeito ${effect.effectId} compartilhado com ${previous}`).toBeUndefined();
      seen.set(effect.effectId, owner);
      // O id carrega o dono: impossível confundir de quem é o efeito.
      expect(effect.effectId.startsWith(`${playerClass}.${skillId}.`)).toBe(true);
    }
    expect(seen.size).toBe(allSkillVisualEffectEntries().length);
  });

  it('keeps the warrior kit out of the mage and the mage kit out of the warrior', () => {
    for (const skill of WARRIOR_SKILLS) {
      for (const effect of getSkillVisualEffects('paladin', skill.id)) {
        expect(isWarriorSkillVisualEffectKind(effect.kind)).toBe(true);
        expect(isMageSkillVisualEffectKind(effect.kind)).toBe(false);
      }
      for (const effect of getSkillVisualEffects('mage', skill.id)) {
        expect(isMageSkillVisualEffectKind(effect.kind)).toBe(true);
        expect(isWarriorSkillVisualEffectKind(effect.kind)).toBe(false);
      }
    }
  });

  it('gives each mage skill its own spell, so no spell is shared', () => {
    const spells = WARRIOR_SKILLS.map((skill) => getSkillMageSpellId('mage', skill.id));
    // triplo_ataque = Laser Rajante (`radiant_laser`, exclusivo dele); o Laser
    // genérico não é usado por skill nenhuma. Corte Duplo segue sem feitiço.
    expect(spells).toEqual(['water', 'ice', 'lightning', 'radiant_laser', null]);
    const bound = spells.filter((spell): spell is Exclude<(typeof spells)[number], null> => spell !== null);
    expect(new Set(bound).size).toBe(bound.length);
    // O Guerreiro não emite feitiço nenhum.
    for (const skill of WARRIOR_SKILLS) {
      expect(getSkillMageSpellId('paladin', skill.id)).toBeNull();
    }
  });

  it('gives each warrior skill its own effect kind, even for the two spins', () => {
    const kinds = (id: (typeof WARRIOR_SKILLS)[number]['id']) =>
      getSkillVisualEffects('paladin', id).map((effect) => effect.kind);

    expect(kinds('ataque_giratorio')).toContain('warrior-spin-ring');
    expect(kinds('ataque_giratorio_2')).toContain('warrior-frost-spin-ring');
    expect(kinds('ataque_giratorio')).not.toContain('warrior-frost-spin-ring');
    expect(kinds('ataque_giratorio_2')).not.toContain('warrior-spin-ring');
    expect(kinds('pulo_atacando')).toEqual(['warrior-jump-dive']);
    // Golpe Flamejante trocou o leque de fogo pelo vórtice de água: a skill
    // tem UM efeito só, e é ele.
    expect(kinds('triplo_ataque')).toEqual(['warrior-water-vortex']);
    expect(kinds('corte_duplo')).toContain('warrior-dark-flame-fan');
    expect(kinds('corte_duplo')).toContain('warrior-blade-storm');

    // Cada skill tem o seu clarão de impacto, com estilo próprio.
    const flashes = new Map<string, number>();
    for (const skill of WARRIOR_SKILLS) {
      for (const effect of getSkillVisualEffectsForStage('paladin', skill.id, 'impact')) {
        if (effect.kind !== 'warrior-impact-flash') continue;
        expect(flashes.has(effect.style)).toBe(false);
        flashes.set(effect.style, effect.scale);
      }
    }
    // O clarão de fogo saiu junto com o leque do Golpe Flamejante.
    expect([...flashes.keys()].sort()).toEqual(['dark_flame', 'frost', 'plain']);
  });

  it('separates the effects by stage of the skill', () => {
    for (const skill of WARRIOR_SKILLS) {
      const all = getSkillVisualEffects('paladin', skill.id);
      const staged = [
        ...getSkillVisualEffectsForStage('paladin', skill.id, 'cast'),
        ...getSkillVisualEffectsForStage('paladin', skill.id, 'hit-window'),
        ...getSkillVisualEffectsForStage('paladin', skill.id, 'impact'),
      ];
      expect(staged.map((effect) => effect.effectId).sort())
        .toEqual(all.map((effect) => effect.effectId).sort());
    }
    // A Maga só dispara no cast (o projétil cuida do impacto). Corte Duplo não
    // tem feitiço: nenhuma etapa sobra para ele.
    for (const skill of WARRIOR_SKILLS) {
      expect(getSkillVisualEffectsForStage('mage', skill.id, 'hit-window')).toEqual([]);
      const castEffects = getSkillVisualEffectsForStage('mage', skill.id, 'cast');
      if (skill.id === 'corte_duplo') {
        expect(castEffects).toEqual([]);
      } else {
        expect(castEffects).toHaveLength(1);
      }
    }
  });
});
