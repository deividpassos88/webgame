import { INVENTORY_ITEMS } from '../inventory/InventoryCatalog';
import type { WaveSnapshot } from '../waves/WaveManager';
import type { AdminCommand, AdminWave } from './AdminCommandGate';
import type { AdminCommandResult } from './AdminGameActions';

export interface AdminPanelDefinition {
  waveButtons: readonly AdminWave[];
  actions: readonly ['jump-boss', 'hitkill-boss', 'immortality', 'admin-camera', 'add-inventory-item'];
}

const DEFINITION: AdminPanelDefinition = Object.freeze({
  waveButtons: Object.freeze([1, 2, 3, 4, 5, 6] as AdminWave[]),
  actions: Object.freeze([
    'jump-boss', 'hitkill-boss', 'immortality', 'admin-camera',
    'add-inventory-item',
  ] as const),
});

export function getAdminPanelDefinition(
  authorized: boolean
): AdminPanelDefinition | null {
  return authorized ? DEFINITION : null;
}

export class AdminPanel {
  private lastPhase = '';
  private lastBossAlive: boolean | null = null;
  private readonly phaseLabel: HTMLElement;
  private readonly hitkillButton: HTMLButtonElement;
  private readonly immortalityButton: HTMLButtonElement;
  private readonly cameraButton: HTMLButtonElement;
  private drag: { pointerId: number; startX: number; startY: number; left: number; top: number; moved: boolean } | null = null;
  private ignoreToggleClick = false;

  private constructor(
    private readonly root: HTMLElement,
    private readonly onCommand: (command: AdminCommand) => AdminCommandResult
  ) {
    this.phaseLabel = root.querySelector<HTMLElement>('[data-admin-phase]')!;
    this.hitkillButton = root.querySelector<HTMLButtonElement>('[data-admin-command="hitkill-boss"]')!;
    this.immortalityButton = root.querySelector<HTMLButtonElement>('[data-admin-command="immortality"]')!;
    this.cameraButton = root.querySelector<HTMLButtonElement>('[data-admin-command="admin-camera"]')!;
    this.bindEvents();
  }

  public static mount(
    host: HTMLElement,
    authorized: boolean,
    onCommand: (command: AdminCommand) => AdminCommandResult
  ): AdminPanel | null {
    const definition = getAdminPanelDefinition(authorized);
    if (!definition) return null;
    const root = document.createElement('section');
    root.id = 'admin-panel';
    root.className = 'is-collapsed';
    root.setAttribute('aria-label', 'Ferramentas de administrador');
    root.innerHTML = `
      <button type="button" class="admin-panel-toggle admin-control" aria-expanded="false">
        <strong>ADM</strong><span data-admin-phase>Aguardando</span>
      </button>
      <div class="admin-panel-body">
        <div class="admin-wave-grid" aria-label="Selecionar wave">
          ${definition.waveButtons.map(wave => `<button type="button" class="admin-control" data-wave="${wave}" disabled>Wave ${wave}</button>`).join('')}
        </div>
        <button type="button" class="admin-control" data-admin-command="jump-boss" disabled>Ir para o Boss</button>
        <button type="button" class="admin-control" data-admin-command="hitkill-boss" disabled>Hitkill Boss</button>
        <button type="button" class="admin-control admin-toggle" data-admin-command="immortality" aria-pressed="false" disabled>Imortalidade</button>
        <button type="button" class="admin-control admin-toggle" data-admin-command="admin-camera" aria-pressed="false" disabled>Câmera ADM</button>
        <section class="admin-inventory" aria-label="Adicionar item ao inventário">
          <label>Item
            <select data-admin-inventory-item>
              ${Object.values(INVENTORY_ITEMS).map((item) => `<option value="${item.id}">${item.label}</option>`).join('')}
            </select>
          </label>
          <label>Quantidade
            <input type="number" min="1" step="1" value="1" inputmode="numeric" data-admin-inventory-quantity>
          </label>
          <label class="admin-opacity-control">Transparencia
            <input type="range" min="25" max="90" value="40" data-admin-opacity aria-label="Transparencia da janela administrativa">
          </label>
          <button type="button" class="admin-control" data-admin-command="add-inventory-item">Adicionar item</button>
          <output data-admin-inventory-message aria-live="polite"></output>
        </section>
      </div>`;
    host.appendChild(root);
    return new AdminPanel(root, onCommand);
  }

  public update(snapshot: WaveSnapshot, bossAlive: boolean): void {
    const phase = snapshot.phase === 'final-battle'
      ? 'Boss'
      : snapshot.phase === 'regular-wave'
        ? `Wave ${snapshot.wave}`
        : snapshot.phase;
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      this.phaseLabel.textContent = phase;
    }
    if (bossAlive !== this.lastBossAlive) {
      this.lastBossAlive = bossAlive;
      this.hitkillButton.disabled = !bossAlive;
    }
  }

  /** Enables combat-only controls after the player enters the dungeon. */
  public setGameplayAvailable(available: boolean): void {
    const selector = [
      '[data-wave]',
      '[data-admin-command="jump-boss"]',
      '[data-admin-command="immortality"]',
      '[data-admin-command="admin-camera"]',
    ].join(', ');
    this.root.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => {
      button.disabled = !available;
    });
    this.hitkillButton.disabled = true;
  }

  public resetToggles(): void {
    this.setToggle(this.immortalityButton, false);
    this.setToggle(this.cameraButton, false);
  }

  private bindEvents(): void {
    const disclosure = this.root.querySelector<HTMLButtonElement>('.admin-panel-toggle')!;
    disclosure.addEventListener('click', () => {
      if (this.ignoreToggleClick) {
        this.ignoreToggleClick = false;
        return;
      }
      const collapsed = this.root.classList.toggle('is-collapsed');
      disclosure.setAttribute('aria-expanded', String(!collapsed));
    });
    disclosure.addEventListener('pointerdown', (event) => this.startDrag(event));
    window.addEventListener('pointermove', this.moveDrag);
    window.addEventListener('pointerup', this.endDrag);
    this.root.querySelector<HTMLInputElement>('[data-admin-opacity]')?.addEventListener('input', (event) => {
      const input = event.currentTarget as HTMLInputElement;
      this.root.style.setProperty('--admin-panel-opacity', String(Number(input.value) / 100));
    });
    this.root.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.admin-control');
      if (!button || button === disclosure || button.disabled) return;
      const wave = Number(button.dataset.wave);
      if (Number.isInteger(wave) && wave >= 1 && wave <= 6) {
        this.onCommand({ type: 'jump-wave', wave: wave as AdminWave });
        return;
      }
      const command = button.dataset.adminCommand;
      if (command === 'add-inventory-item') {
        this.addInventoryItem();
      } else if (command === 'jump-boss' || command === 'hitkill-boss') {
        this.onCommand({ type: command });
      } else if (command === 'immortality' || command === 'admin-camera') {
        const enabled = button.getAttribute('aria-pressed') !== 'true';
        this.setToggle(button, enabled);
        this.onCommand({ type: command, enabled });
      }
    });
  }

  private startDrag(event: PointerEvent): void {
    if (event.button !== 0) return;
    const bounds = this.root.getBoundingClientRect();
    this.root.style.left = `${bounds.left}px`;
    this.root.style.top = `${bounds.top}px`;
    this.root.style.right = 'auto';
    this.root.style.bottom = 'auto';
    this.root.style.transform = 'none';
    this.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: bounds.left,
      top: bounds.top,
      moved: false,
    };
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  private moveDrag = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const offsetX = event.clientX - drag.startX;
    const offsetY = event.clientY - drag.startY;
    if (Math.abs(offsetX) + Math.abs(offsetY) > 3) {
      drag.moved = true;
      this.root.classList.add('is-moved');
    }
    const bounds = this.root.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - bounds.width);
    const maxTop = Math.max(0, window.innerHeight - bounds.height);
    this.root.style.left = `${Math.min(maxLeft, Math.max(0, drag.left + offsetX))}px`;
    this.root.style.top = `${Math.min(maxTop, Math.max(0, drag.top + offsetY))}px`;
  };

  private endDrag = (event: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    this.ignoreToggleClick = this.drag.moved;
    this.drag = null;
  };

  private addInventoryItem(): void {
    const item = this.root.querySelector<HTMLSelectElement>('[data-admin-inventory-item]')!;
    const quantityInput = this.root.querySelector<HTMLInputElement>('[data-admin-inventory-quantity]')!;
    const quantity = Number(quantityInput.value);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      this.setInventoryMessage('Informe uma quantidade inteira positiva.');
      return;
    }
    const result = this.onCommand({ type: 'add-inventory-item', itemId: item.value, quantity });
    this.setInventoryMessage(this.inventoryMessage(result));
  }

  private setInventoryMessage(message: string): void {
    this.root.querySelector<HTMLOutputElement>('[data-admin-inventory-message]')!.textContent = message;
  }

  private inventoryMessage(result: AdminCommandResult): string {
    if (result.ok) return 'Item adicionado à mochila.';
    switch (result.reason) {
      case 'backpack-full':
        return 'Não há espaço livre na mochila.';
      case 'stack-limit':
        return 'A quantidade excede o limite da pilha.';
      case 'invalid-quantity':
        return 'Informe uma quantidade inteira positiva.';
      case 'unknown-item':
        return 'O item selecionado não existe no catálogo.';
      case 'persistence-failed':
        return 'Não foi possível salvar o item. Nenhuma alteração foi aplicada.';
      case 'unauthorized':
        return 'Sessão sem autorização administrativa.';
      case 'unavailable':
        return 'O comando não está disponível no estado atual.';
    }
  }

  private setToggle(button: HTMLButtonElement, enabled: boolean): void {
    button.setAttribute('aria-pressed', String(enabled));
    button.classList.toggle('is-active', enabled);
  }
}
