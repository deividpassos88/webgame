export class VictoryLobbyTransition {
  private remaining = 0;
  private active = false;
  private fired = false;

  public constructor(
    private readonly delaySeconds: number,
    private readonly onReturn: () => void
  ) {}

  public start(): void {
    this.remaining = Math.max(0, this.delaySeconds);
    this.active = true;
    this.fired = false;
  }

  public update(delta: number): void {
    if (!this.active || this.fired) return;
    this.remaining = Math.max(0, this.remaining - Math.max(0, delta));
    if (this.remaining > 0) return;
    this.completeNow();
  }

  /** Completes an already-scheduled victory return without starting a new run. */
  public completeNow(): void {
    if (!this.active || this.fired) return;
    this.fired = true;
    this.active = false;
    this.onReturn();
  }

  public reset(): void {
    this.remaining = 0;
    this.active = false;
    this.fired = false;
  }
}
