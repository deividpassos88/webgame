import type { PlayableCharacterId } from '../characters/CharacterCatalog';
import { WARRIOR_SKILLS, type WarriorSkillId } from '../combat/WarriorSkillCatalog';
import type { MageSpellId } from './VFXTypes';

/**
 * Vínculo exclusivo entre skill e efeito visual.
 *
 * Cada linha desta tabela é UM efeito que pertence a UMA skill de UMA classe.
 * Nada aqui é compartilhado: o efeito do Guerreiro não aparece na Maga e o
 * efeito da Maga não aparece no Guerreiro, e duas skills diferentes nunca
 * apontam para o mesmo `effectId`.
 *
 * Quando uma skill nova precisa de um efeito, o efeito de outra skill serve só
 * de BASE/EXEMPLO: copia-se a receita (kind + parâmetros) e registra-se aqui um
 * `effectId` novo, próprio da skill nova. O teste
 * `SkillVisualBindings.test.ts` falha se algum `effectId` for reaproveitado.
 */

/** Momento em que o efeito é disparado dentro da skill. */
export type SkillVFXStage =
  /** Sai no instante em que a skill é aceita (junto do cast). */
  | 'cast'
  /** Sai em cada janela de dano autoral da animação. */
  | 'hit-window'
  /** Sai nos alvos/impactos resolvidos pela skill. */
  | 'impact';

/** Aparência do clarão de impacto no monstro (cada skill tem a sua). */
export type SkillImpactFlashStyle = 'plain' | 'frost' | 'fire' | 'dark_flame';

export type SkillVisualEffect =
  | {
      readonly effectId: string;
      readonly kind: 'warrior-spin-ring';
      readonly stage: 'cast';
      readonly slashType: 'spin';
      readonly scale: number;
      readonly maxRadius: number;
    }
  | {
      readonly effectId: string;
      readonly kind: 'warrior-frost-spin-ring';
      readonly stage: 'cast';
      readonly slashType: 'spin_frost';
      readonly scale: number;
      readonly maxRadius: number;
    }
  | {
      readonly effectId: string;
      readonly kind: 'warrior-jump-dive';
      readonly stage: 'cast';
      readonly scale: number;
    }
  | {
      readonly effectId: string;
      readonly kind: 'warrior-flame-fan';
      readonly stage: 'hit-window';
      readonly slashType: 'flame';
      readonly scale: number;
      readonly speed: number;
    }
  | {
      readonly effectId: string;
      readonly kind: 'warrior-dark-flame-fan';
      readonly stage: 'hit-window';
      readonly slashType: 'dark_flame';
      readonly scale: number;
      readonly speed: number;
    }
  | {
      readonly effectId: string;
      readonly kind: 'warrior-blade-storm';
      readonly stage: 'impact';
    }
  | {
      readonly effectId: string;
      readonly kind: 'warrior-impact-flash';
      readonly stage: 'impact';
      readonly scale: number;
      readonly style: SkillImpactFlashStyle;
    }
  | {
      readonly effectId: string;
      readonly kind: 'mage-spell';
      readonly stage: 'cast';
      readonly spellId: Exclude<MageSpellId, 'basic'>;
    };

export type SkillVisualEffectKind = SkillVisualEffect['kind'];

/** Efeitos que só existem no kit visual do Guerreiro ( Paladin). */
const WARRIOR_ONLY_KINDS: readonly SkillVisualEffectKind[] = [
  'warrior-spin-ring',
  'warrior-frost-spin-ring',
  'warrior-jump-dive',
  'warrior-flame-fan',
  'warrior-dark-flame-fan',
  'warrior-blade-storm',
  'warrior-impact-flash',
];

/** Efeitos que só existem no kit visual da Maga. */
const MAGE_ONLY_KINDS: readonly SkillVisualEffectKind[] = ['mage-spell'];

/**
 * Guerreiro (Paladino): uma receita própria por skill, do rastro ao clarão.
 * Skill 1 e skill 2 parecem parecidas (duas giratórias), mas cada uma tem o seu
 * efeito registrado aqui — a glacial usa anel/clarão de gelo próprios.
 */
const PALADIN_SKILL_VISUAL_EFFECTS: Readonly<Record<WarriorSkillId, readonly SkillVisualEffect[]>> =
  Object.freeze({
    ataque_giratorio: Object.freeze([
      Object.freeze({
        effectId: 'paladin.ataque_giratorio.spin-ring',
        kind: 'warrior-spin-ring',
        stage: 'cast',
        slashType: 'spin',
        scale: 1.15,
        maxRadius: 7,
      }),
      Object.freeze({
        effectId: 'paladin.ataque_giratorio.impact-flash',
        kind: 'warrior-impact-flash',
        stage: 'impact',
        scale: 1.15,
        style: 'plain',
      }),
    ]),
    ataque_giratorio_2: Object.freeze([
      Object.freeze({
        effectId: 'paladin.ataque_giratorio_2.frost-spin-ring',
        kind: 'warrior-frost-spin-ring',
        stage: 'cast',
        slashType: 'spin_frost',
        scale: 1.2,
        maxRadius: 7,
      }),
      Object.freeze({
        effectId: 'paladin.ataque_giratorio_2.impact-flash',
        kind: 'warrior-impact-flash',
        stage: 'impact',
        scale: 1.15,
        style: 'frost',
      }),
    ]),
    pulo_atacando: Object.freeze([
      Object.freeze({
        effectId: 'paladin.pulo_atacando.jump-dive',
        kind: 'warrior-jump-dive',
        stage: 'cast',
        scale: 1,
      }),
    ]),
    triplo_ataque: Object.freeze([
      Object.freeze({
        effectId: 'paladin.triplo_ataque.flame-fan',
        kind: 'warrior-flame-fan',
        stage: 'hit-window',
        slashType: 'flame',
        scale: 1,
        speed: 12.5,
      }),
      Object.freeze({
        effectId: 'paladin.triplo_ataque.impact-flash',
        kind: 'warrior-impact-flash',
        stage: 'impact',
        scale: 1.1,
        style: 'fire',
      }),
    ]),
    corte_duplo: Object.freeze([
      Object.freeze({
        effectId: 'paladin.corte_duplo.dark-flame-fan',
        kind: 'warrior-dark-flame-fan',
        stage: 'hit-window',
        slashType: 'dark_flame',
        scale: 2,
        speed: 14.5,
      }),
      Object.freeze({
        effectId: 'paladin.corte_duplo.blade-storm',
        kind: 'warrior-blade-storm',
        stage: 'impact',
      }),
      Object.freeze({
        effectId: 'paladin.corte_duplo.impact-flash',
        kind: 'warrior-impact-flash',
        stage: 'impact',
        scale: 1.55,
        style: 'dark_flame',
      }),
    ]),
  });

/**
 * Maga: cada skill tem o SEU feitiço (água, gelo, raio, laser, lava). Nenhum
 * efeito do kit do Guerreiro entra aqui — o rastro/anel de lâmina é exclusivo
 * dele, assim como o feitiço é exclusivo dela.
 */
const MAGE_SKILL_VISUAL_EFFECTS: Readonly<Record<WarriorSkillId, readonly SkillVisualEffect[]>> =
  Object.freeze({
    ataque_giratorio: Object.freeze([
      Object.freeze({
        effectId: 'mage.ataque_giratorio.water-spell',
        kind: 'mage-spell',
        stage: 'cast',
        spellId: 'water',
      }),
    ]),
    ataque_giratorio_2: Object.freeze([
      Object.freeze({
        effectId: 'mage.ataque_giratorio_2.ice-spell',
        kind: 'mage-spell',
        stage: 'cast',
        spellId: 'ice',
      }),
    ]),
    pulo_atacando: Object.freeze([
      Object.freeze({
        effectId: 'mage.pulo_atacando.lightning-spell',
        kind: 'mage-spell',
        stage: 'cast',
        spellId: 'lightning',
      }),
    ]),
    triplo_ataque: Object.freeze([
      Object.freeze({
        effectId: 'mage.triplo_ataque.laser-spell',
        kind: 'mage-spell',
        stage: 'cast',
        spellId: 'laser',
      }),
    ]),
    corte_duplo: Object.freeze([
      Object.freeze({
        effectId: 'mage.corte_duplo.lava-spell',
        kind: 'mage-spell',
        stage: 'cast',
        spellId: 'lava',
      }),
    ]),
  });

export const SKILL_VISUAL_EFFECTS: Readonly<
  Record<PlayableCharacterId, Readonly<Record<WarriorSkillId, readonly SkillVisualEffect[]>>>
> = Object.freeze({
  paladin: PALADIN_SKILL_VISUAL_EFFECTS,
  mage: MAGE_SKILL_VISUAL_EFFECTS,
});

/** Todos os efeitos vinculados a uma skill de uma classe. */
export function getSkillVisualEffects(
  playerClass: PlayableCharacterId,
  skillId: WarriorSkillId
): readonly SkillVisualEffect[] {
  return SKILL_VISUAL_EFFECTS[playerClass][skillId] ?? [];
}

/** Só os efeitos de um momento da skill (cast, janela de dano ou impacto). */
export function getSkillVisualEffectsForStage(
  playerClass: PlayableCharacterId,
  skillId: WarriorSkillId,
  stage: SkillVFXStage
): readonly SkillVisualEffect[] {
  return getSkillVisualEffects(playerClass, skillId).filter((effect) => effect.stage === stage);
}

/**
 * Feitiço vinculado à skill da Maga. Devolve `null` para o Guerreiro, então é
 * impossível uma skill dele emitir um feitiço (e vice-versa).
 */
export function getSkillMageSpellId(
  playerClass: PlayableCharacterId,
  skillId: WarriorSkillId
): MageSpellId | null {
  if (playerClass !== 'mage') return null;
  for (const effect of getSkillVisualEffects(playerClass, skillId)) {
    if (effect.kind === 'mage-spell') return effect.spellId;
  }
  return null;
}

/** true quando o efeito pertence ao kit visual do Guerreiro. */
export function isWarriorSkillVisualEffectKind(kind: SkillVisualEffectKind): boolean {
  return WARRIOR_ONLY_KINDS.includes(kind);
}

/** true quando o efeito pertence ao kit visual da Maga. */
export function isMageSkillVisualEffectKind(kind: SkillVisualEffectKind): boolean {
  return MAGE_ONLY_KINDS.includes(kind);
}

export interface SkillVisualEffectEntry {
  readonly playerClass: PlayableCharacterId;
  readonly skillId: WarriorSkillId;
  readonly effect: SkillVisualEffect;
}

/** Tabela completa, usada pelos testes de exclusividade. */
export function allSkillVisualEffectEntries(): readonly SkillVisualEffectEntry[] {
  const entries: SkillVisualEffectEntry[] = [];
  for (const skill of WARRIOR_SKILLS) {
    for (const playerClass of ['paladin', 'mage'] as const) {
      for (const effect of getSkillVisualEffects(playerClass, skill.id)) {
        entries.push({ playerClass, skillId: skill.id, effect });
      }
    }
  }
  return entries;
}
