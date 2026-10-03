import {
  COMBO_EMPOWER_DAMAGE_MULTIPLIER,
  COMBO_EMPOWER_PLAYBACK_MULTIPLIER,
} from './ComboEmpowerment';
import {
  COMBO_IMMUNITY_COMPLETE_TAIL_SECONDS,
  COMBO_IMMUNITY_FAIL_SECONDS,
} from './ComboImmunity';
import { COMBO_COOLDOWN_MULTIPLIER } from './SkillComboController';

/**
 * Fonte única dos benefícios do Combo de skills.
 *
 * O lobby mostra exatamente esta lista no tooltip do botão de Combo. Como os
 * números vêm dos próprios módulos de combate, o texto nunca descola do que o
 * jogo realmente faz: se o dano x2 ou a imunidade mudarem, o tooltip muda junto.
 */
export interface ComboBenefit {
  /** Título curto, com o número já formatado quando existe. */
  readonly title: string;
  /** Uma linha explicando o efeito em combate. */
  readonly detail: string;
}

const percentFaster = Math.round((COMBO_EMPOWER_PLAYBACK_MULTIPLIER - 1) * 100);

export const COMBO_BENEFITS: readonly ComboBenefit[] = Object.freeze([
  Object.freeze({
    title: `Dano x${COMBO_EMPOWER_DAMAGE_MULTIPLIER} nas skills encadeadas`,
    detail: 'Do primeiro acerto na zona verde em diante, cada skill do combo bate com o dobro do dano.',
  }),
  Object.freeze({
    title: `Skills ${percentFaster}% mais rápidas`,
    detail: 'A animação acelera junto: o combo inteiro sai mais curto e você encaixa mais golpes.',
  }),
  Object.freeze({
    title: 'Imunidade durante o combo',
    detail: `Você fica imune da primeira skill até o fim. Se acertar todos os links, a imunidade ainda cobre ${COMBO_IMMUNITY_COMPLETE_TAIL_SECONDS.toFixed(1)}s depois do último golpe (${COMBO_IMMUNITY_FAIL_SECONDS.toFixed(1)}s se errar).`,
  }),
  Object.freeze({
    title: 'Encadeamento automático',
    detail: 'Acertando a zona verde, a próxima skill entra sozinha, cortando o fim da animação anterior.',
  }),
]);

/** Contrapartida honesta: o que o jogador paga ao usar o combo. */
export const COMBO_TRADE_OFF =
  `Skills usadas no combo recarregam ${COMBO_COOLDOWN_MULTIPLIER}x mais devagar.`;

/** Chamada curta exibida no cabeçalho do tooltip. */
export const COMBO_SUMMARY =
  'Encadeie skills clicando na zona verde do medidor. Quanto mais links, menor a zona verde, maior a recompensa.';

/** Texto do botão de informação (acessibilidade). */
export const COMBO_HELP_LABEL = 'Ver os benefícios do Combo de skills';

/** Estado do toggle de Combo. */
export interface ComboToggleState {
  readonly enabled: boolean;
  readonly label: string;
  readonly hint: string;
}

export function comboToggleState(enabled: boolean): ComboToggleState {
  return enabled
    ? {
        enabled,
        label: 'Ligado',
        hint: 'Combo ativo: as skills podem ser encadeadas na zona verde do medidor.',
      }
    : {
        enabled,
        label: 'Desligado',
        hint: 'Combo desligado: as skills saem uma por vez, sem medidor e sem bônus.',
      };
}

/**
 * O medidor de combo só pode abrir quando o jogador quer usar o combo e ainda
 * existe pelo menos uma skill candidata para encadear.
 */
export function comboCanOpen(enabled: boolean, remainingCandidates: number): boolean {
  return enabled && Number.isFinite(remainingCandidates) && remainingCandidates > 0;
}
