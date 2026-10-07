/**
 * Contador de FPS do menu de Configurações.
 *
 * O jogo já mede quadros no `FramePerformanceMonitor`, mas ele é diagnóstico
 * (relatórios no console a cada 2/10 s). Aqui é a versão visível: uma janela
 * curta de quadros vira um número no canto da tela, sem depender de Three.js.
 */

export const FPS_BADGE_ID = 'fps-badge';
const WINDOW_SIZE = 30;
const REFRESH_INTERVAL_MS = 400;
/** Abaixo disso a média é ruído (um ou dois quadros), então nada é escrito. */
const MIN_SAMPLES = 8;

/** Média de FPS de uma janela de quadros, arredondada para inteiro. */
export function averageFps(frameTimes: readonly number[]): number {
  if (frameTimes.length < 2) return 0;
  const first = frameTimes[0];
  const last = frameTimes[frameTimes.length - 1];
  const elapsed = last - first;
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  return Math.round(((frameTimes.length - 1) * 1000) / elapsed);
}

export function formatFps(fps: number): string {
  return `${Math.max(0, Math.round(fps))} FPS`;
}

export class FpsBadge {
  private readonly frames: number[] = [];
  private lastRenderAt = Number.NEGATIVE_INFINITY;
  private lastText = '';

  private constructor(private readonly root: HTMLElement) {}

  public static mount(host: HTMLElement = document.body): FpsBadge {
    const existing = host.querySelector<HTMLElement>(`#${FPS_BADGE_ID}`);
    if (existing) return new FpsBadge(existing);
    const root = document.createElement('div');
    root.id = FPS_BADGE_ID;
    root.className = 'fps-badge hidden';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'off');
    root.setAttribute('aria-label', 'Quadros por segundo');
    host.appendChild(root);
    return new FpsBadge(root);
  }

  /** Chamado a cada quadro desenhado (lobby e partida). */
  public frame(nowMs: number): void {
    if (!Number.isFinite(nowMs)) return;
    this.frames.push(nowMs);
    if (this.frames.length > WINDOW_SIZE) this.frames.shift();
    if (this.frames.length < MIN_SAMPLES) return;
    if (nowMs - this.lastRenderAt < REFRESH_INTERVAL_MS) return;
    this.lastRenderAt = nowMs;
    const text = formatFps(averageFps(this.frames));
    if (text === this.lastText) return;
    this.lastText = text;
    this.root.textContent = text;
  }

  public setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
    if (!visible) {
      // Recomeça a janela: o primeiro número depois de religar não herda os
      // quadros antigos (que podem ter passado minutos atrás).
      this.frames.length = 0;
      this.lastRenderAt = Number.NEGATIVE_INFINITY;
    }
  }

  public isVisible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  public dispose(): void {
    this.frames.length = 0;
    this.root.remove();
  }
}
