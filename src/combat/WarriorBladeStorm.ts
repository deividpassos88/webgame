/**
 * Agenda os arcos de lâmina em vertical do Corte Duplo. Cada arco é disparado
 * em um intervalo curto e vira um acerto próprio na área, então o corte
 * rasga o grupo várias vezes em vez de bater uma vez só.
 */
export interface BladeStormSchedule {
  readonly arcCount: number;
  readonly intervalSeconds: number;
}

export class WarriorBladeStorm {
  private remainingArcs = 0;
  private elapsed = 0;
  private intervalSeconds = 0.17;

  public constructor(private readonly onArc: (index: number) => void) {}

  /** Reinicia a sequência. O primeiro arco sai na hora. */
  public start(schedule: BladeStormSchedule): void {
    this.remainingArcs = Math.max(0, Math.floor(schedule.arcCount));
    this.intervalSeconds = Math.max(0.01, schedule.intervalSeconds);
    this.elapsed = 0;
    if (this.remainingArcs > 0) this.emit();
  }

  public update(delta: number): void {
    if (this.remainingArcs <= 0) return;
    const step = Math.max(0, delta);
    if (step <= 0) return;
    this.elapsed += step;
    // Um frame longo não pode furar a fila inteira de arcos de uma vez.
    let guard = this.remainingArcs;
    while (this.remainingArcs > 0 && this.elapsed >= this.intervalSeconds && guard > 0) {
      this.elapsed -= this.intervalSeconds;
      this.emit();
      guard -= 1;
    }
  }

  public clear(): void {
    this.remainingArcs = 0;
    this.elapsed = 0;
  }

  public get active(): boolean {
    return this.remainingArcs > 0;
  }

  public get pendingArcs(): number {
    return this.remainingArcs;
  }

  private emit(): void {
    this.remainingArcs -= 1;
    this.onArc(this.remainingArcs);
  }
}
