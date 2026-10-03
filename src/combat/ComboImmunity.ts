import type { ComboSnapshot } from './SkillComboController';

/**
 * Imunidade do combo de skills.
 *
 * Regras pedidas pelo design:
 * - a imunidade começa na PRIMEIRA skill do combo (não só depois do link);
 * - se o combo FALHAR (clicou fora do verde ou o cursor chegou ao fim),
 *   sobram apenas 0.2 s de imunidade;
 * - se TODOS os combos forem acertados, a imunidade cobre o fim da última
 *   skill e ainda dura 0.8 s depois do término.
 *
 * O controlador não conhece o Player: ele devolve, a cada frame, quantos
 * segundos de imunidade o dono do combo deve aplicar.
 */

/** Imunidade que resta quando o combo falha. */
export const COMBO_IMMUNITY_FAIL_SECONDS = 0.2;
/** Imunidade extra depois do término de um combo completo. */
export const COMBO_IMMUNITY_COMPLETE_TAIL_SECONDS = 0.8;

export interface ComboImmunityFrame {
  readonly delta: number;
  readonly snapshot: ComboSnapshot;
  /** Segundos que faltam para a skill em execução terminar (0 sem skill). */
  readonly skillRemainingSeconds: number;
}

function safeSeconds(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export class ComboImmunityController {
  private remaining = 0;
  private lastResultSerial = 0;

  /** Segundos de imunidade ainda ativos. */
  public get secondsRemaining(): number {
    return this.remaining;
  }

  public get active(): boolean {
    return this.remaining > 0;
  }

  /**
   * A primeira skill do combo abre a imunidade. `comboOpen` diz se o combo
   * realmente começou (uma gauge abriu ou um link segue vivo); uma skill
   * lançada sozinha, sem nenhum combo possível, não concede nada.
   */
  public onSkillCast(skillRemainingSeconds: number, comboOpen: boolean): void {
    if (!comboOpen) return;
    this.remaining = Math.max(this.remaining, safeSeconds(skillRemainingSeconds));
  }

  /**
   * Avança a imunidade e devolve quantos segundos devem ser aplicados agora.
   * Enquanto o combo estiver vivo (gauge varrendo ou link aguardando a próxima
   * skill) a imunidade acompanha a animação em execução.
   */
  public update(frame: ComboImmunityFrame): number {
    const delta = safeSeconds(frame.delta);
    const snapshot = frame.snapshot;

    if (snapshot.resultSerial !== this.lastResultSerial) {
      this.lastResultSerial = snapshot.resultSerial;
      switch (snapshot.lastResult) {
        case 'miss':
        case 'timeout':
          // Falhou: corta tudo e deixa só o respiro de 0.2 s.
          this.remaining = COMBO_IMMUNITY_FAIL_SECONDS;
          break;
        case 'finished':
          // Combo completo: cobre o resto da última skill + 0.8 s.
          this.remaining =
            safeSeconds(frame.skillRemainingSeconds) + COMBO_IMMUNITY_COMPLETE_TAIL_SECONDS;
          break;
        default:
          break;
      }
    }

    if (snapshot.phase === 'gauge' || snapshot.phase === 'linked') {
      this.remaining = Math.max(this.remaining, safeSeconds(frame.skillRemainingSeconds));
    }

    this.remaining = Math.max(0, this.remaining - delta);
    return this.remaining;
  }

  /** Zera a imunidade (morte, reset de partida, overlay aberto). */
  public reset(): void {
    this.remaining = 0;
  }
}
