/**
 * Counts consecutive damaging hits dealt to monsters. The streak resets after
 * a short pause without hitting anything.
 *
 * Quem alimenta é o `Game`, e só durante o combo de skills: hits de ataque
 * básico (Maga e Guerreiro, incluindo o respingo de área) não contam — o
 * contador é do combo. Fora da janela do combo o `Game` zera o contador, então
 * ele também desaparece da tela.
 */
export const HIT_COUNTER_TIMEOUT_SECONDS = 3;

export interface HitCounterSnapshot {
  readonly count: number;
  /** Seconds left before the streak resets. */
  readonly remaining: number;
  readonly timeout: number;
  /** Increments on every hit so the view can pulse. */
  readonly serial: number;
}

export class HitCounter {
  private count = 0;
  private remaining = 0;
  private serial = 0;

  public constructor(private readonly timeout: number = HIT_COUNTER_TIMEOUT_SECONDS) {}

  public registerHit(): void {
    this.count += 1;
    this.serial += 1;
    this.remaining = this.timeout;
  }

  public update(delta: number): void {
    if (this.count === 0 || !Number.isFinite(delta) || delta <= 0) return;
    this.remaining = Math.max(0, this.remaining - delta);
    if (this.remaining <= 0) this.count = 0;
  }

  public reset(): void {
    this.count = 0;
    this.remaining = 0;
  }

  public snapshot(): HitCounterSnapshot {
    return {
      count: this.count,
      remaining: this.remaining,
      timeout: this.timeout,
      serial: this.serial,
    };
  }
}
