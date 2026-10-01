import type { HitCounterSnapshot } from '../combat/HitCounter';
import '../styles/hit-counter.css';

/** Compact glass-style hit counter on the right edge of the screen. */
export class HitCounterView {
  public readonly element: HTMLElement;
  private readonly number: HTMLElement;
  private readonly bar: HTMLElement;
  private lastSerial = 0;
  private lastCount = -1;

  public constructor(host: HTMLElement = document.getElementById('app') ?? document.body) {
    this.element = document.createElement('div');
    this.element.className = 'hit-counter';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = `
      <span class="hit-counter__number" data-hit-number>0</span>
      <span class="hit-counter__label">HITS</span>
      <span class="hit-counter__timer"><i data-hit-bar></i></span>
    `;
    this.number = this.element.querySelector<HTMLElement>('[data-hit-number]')!;
    this.bar = this.element.querySelector<HTMLElement>('[data-hit-bar]')!;
    host.appendChild(this.element);
  }

  public render(snapshot: HitCounterSnapshot): void {
    const visible = snapshot.count > 0;
    this.element.classList.toggle('is-visible', visible);
    if (!visible) {
      this.lastCount = -1;
      return;
    }
    if (snapshot.count !== this.lastCount) {
      this.lastCount = snapshot.count;
      this.number.textContent = String(snapshot.count);
      this.element.dataset.tier = snapshot.count >= 50 ? '3' : snapshot.count >= 25 ? '2' : snapshot.count >= 10 ? '1' : '0';
    }
    if (snapshot.serial !== this.lastSerial) {
      this.lastSerial = snapshot.serial;
      this.number.classList.remove('is-pulsing');
      void this.number.offsetWidth;
      this.number.classList.add('is-pulsing');
    }
    const ratio = snapshot.timeout > 0 ? snapshot.remaining / snapshot.timeout : 0;
    this.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio)).toFixed(3)})`;
  }

  public dispose(): void {
    this.element.remove();
  }
}
