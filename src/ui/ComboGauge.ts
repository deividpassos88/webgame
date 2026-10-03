import { WARRIOR_SKILLS, type WarriorSkillId } from '../combat/WarriorSkillCatalog';
import type { ComboResult, ComboSnapshot } from '../combat/SkillComboController';
import '../styles/combo-gauge.css';

export interface ComboGaugeContext {
  /** Skills the character has unlocked; locked ones are dimmed in the chain row. */
  readonly unlocked: ReadonlySet<WarriorSkillId>;
  /** Text printed on each chain pip (the configured hotkey). */
  readonly keyLabels?: Partial<Record<WarriorSkillId, string>>;
}

const RESULT_TEXT: Record<ComboResult, string> = {
  hit: 'ÓTIMO!',
  miss: 'ERROU',
  timeout: 'COMBO ENCERRADO',
  finished: 'COMBO COMPLETO!',
};
const RESULT_SECONDS = 0.9;

/**
 * Cabal-style combo gauge: a translucent, rounded, gold-framed bar in the
 * middle of the screen. A cursor sweeps a red track with a small green zone.
 * It never receives pointer events, so the click reaches the game canvas.
 */
export class ComboGauge {
  public readonly element: HTMLElement;
  private readonly track: HTMLElement;
  private readonly zone: HTMLElement;
  private readonly cursor: HTMLElement;
  private readonly count: HTMLElement;
  private readonly buff: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly result: HTMLElement;
  private readonly pips = new Map<WarriorSkillId, HTMLElement>();
  private lastSerial = 0;
  private resultRemaining = 0;
  private lastTime = 0;

  public constructor(host: HTMLElement = document.getElementById('app') ?? document.body) {
    this.element = document.createElement('div');
    this.element.className = 'combo-gauge';
    this.element.dataset.phase = 'idle';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = `
      <div class="combo-gauge__head">
        <span class="combo-gauge__title">COMBO</span>
        <span class="combo-gauge__count" data-combo-count></span>
        <span class="combo-gauge__buff" data-combo-buff></span>
      </div>
      <div class="combo-gauge__frame">
        <i class="combo-gauge__gem combo-gauge__gem--left"></i>
        <i class="combo-gauge__gem combo-gauge__gem--right"></i>
        <div class="combo-gauge__track" data-combo-track>
          <div class="combo-gauge__zone" data-combo-zone></div>
          <div class="combo-gauge__timer" data-combo-timer></div>
          <div class="combo-gauge__cursor" data-combo-cursor></div>
        </div>
      </div>
      <div class="combo-gauge__hint" data-combo-hint></div>
      <div class="combo-gauge__chain" data-combo-chain></div>
      <div class="combo-gauge__result" data-combo-result></div>
    `;
    const query = <T extends HTMLElement>(selector: string): T =>
      this.element.querySelector<T>(selector)!;
    this.track = query('[data-combo-track]');
    this.zone = query('[data-combo-zone]');
    this.cursor = query('[data-combo-cursor]');
    this.count = query('[data-combo-count]');
    this.buff = query('[data-combo-buff]');
    this.hint = query('[data-combo-hint]');
    this.timer = query('[data-combo-timer]');
    this.result = query('[data-combo-result]');

    const chain = query('[data-combo-chain]');
    for (const skill of WARRIOR_SKILLS) {
      const pip = document.createElement('span');
      pip.className = 'combo-gauge__pip';
      pip.textContent = skill.input;
      pip.dataset.skill = skill.id;
      chain.appendChild(pip);
      this.pips.set(skill.id, pip);
    }
    host.appendChild(this.element);
  }

  public render(snapshot: ComboSnapshot, context: ComboGaugeContext, nowSeconds: number): void {
    const delta = this.lastTime > 0 ? Math.max(0, nowSeconds - this.lastTime) : 0;
    this.lastTime = nowSeconds;

    if (snapshot.resultSerial !== this.lastSerial) {
      this.lastSerial = snapshot.resultSerial;
      if (snapshot.lastResult) this.showResult(snapshot.lastResult);
    }
    this.resultRemaining = Math.max(0, this.resultRemaining - delta);

    const visible = snapshot.phase !== 'idle' || this.resultRemaining > 0;
    this.element.dataset.phase = snapshot.phase;
    this.element.classList.toggle('is-visible', visible);
    if (!visible) return;

    this.count.textContent = snapshot.hits > 0 ? `x${snapshot.hits}` : '';
    // Do primeiro link em diante as skills saem mais rápidas e com dano dobrado.
    this.buff.textContent = snapshot.empowered ? 'RÁPIDO · DANO x2' : '';
    this.element.dataset.empowered = String(snapshot.empowered);
    this.track.dataset.linked = String(snapshot.phase === 'linked');

    if (snapshot.phase === 'gauge') {
      this.zone.style.left = `${(snapshot.greenStart * 100).toFixed(2)}%`;
      this.zone.style.width = `${((snapshot.greenEnd - snapshot.greenStart) * 100).toFixed(2)}%`;
      this.cursor.style.left = `${(snapshot.cursor * 100).toFixed(2)}%`;
      // O cursor vai e volta: a seta aponta para o lado do movimento.
      this.cursor.dataset.direction = String(snapshot.cursorDirection);
      this.hint.textContent = 'Clique com o mouse na zona verde!';
    } else if (snapshot.phase === 'linked') {
      const ratio = snapshot.linkWindow > 0 ? snapshot.linkRemaining / snapshot.linkWindow : 0;
      this.timer.style.transform = `scaleX(${ratio.toFixed(3)})`;
      this.hint.textContent = 'COMBO!';
    } else {
      this.hint.textContent = '';
    }

    for (const [id, pip] of this.pips) {
      const key = context.keyLabels?.[id];
      if (key && pip.textContent !== key) pip.textContent = key;
      const state = snapshot.chain.includes(id)
        ? 'used'
        : context.unlocked.has(id)
          ? 'open'
          : 'locked';
      if (pip.dataset.state !== state) pip.dataset.state = state;
    }
  }

  public dispose(): void {
    this.element.remove();
  }

  private showResult(result: ComboResult): void {
    this.result.textContent = RESULT_TEXT[result];
    this.result.dataset.result = result;
    this.resultRemaining = RESULT_SECONDS;
    // Restart the CSS pop animation.
    this.result.classList.remove('is-showing');
    void this.result.offsetWidth;
    this.result.classList.add('is-showing');
    this.element.dataset.result = result;
    this.element.classList.remove('is-flashing');
    void this.element.offsetWidth;
    this.element.classList.add('is-flashing');
  }
}
