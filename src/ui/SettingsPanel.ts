import {
  CAMERA_SENSITIVITY_MAX,
  CAMERA_SENSITIVITY_MIN,
  CAMERA_SENSITIVITY_STEP,
  GRAPHICS_QUALITIES,
  createDefaultPlayerSettings,
  graphicsQualityLabel,
  normalizePlayerSettings,
  type GraphicsQuality,
  type PlayerSettings,
} from '../profile/PlayerSettings';

export const SETTINGS_PANEL_ID = 'settings-panel';

export interface SettingsPanelOptions {
  /** Rótulo do atalho dentro do HUD (ex.: "Esc"). */
  closeHint?: string;
}

function formatSensitivity(value: number): string {
  return `${value.toFixed(2).replace('.', ',')}x`;
}

function renderQualityOptions(settings: PlayerSettings): string {
  return GRAPHICS_QUALITIES.map((quality) => `
    <label class="settings-quality-option">
      <input type="radio" name="settings-graphics-quality" value="${quality}"
        ${settings.graphicsQuality === quality ? 'checked' : ''}>
      <span>${graphicsQualityLabel(quality)}</span>
      <small>${quality === 'alta'
        ? 'Sombras e resolução cheia'
        : quality === 'media'
          ? 'Sombras com menos resolução'
          : 'Sem sombras, mais FPS'}</small>
    </label>`).join('');
}

function renderMarkup(settings: PlayerSettings, closeHint: string): string {
  return `
    <div class="settings-panel__backdrop" data-settings-close></div>
    <section class="settings-panel__card" role="dialog" aria-modal="true" aria-labelledby="settings-panel-title">
      <header class="settings-panel__head">
        <div>
          <p class="section-label">Ajustes do jogador</p>
          <h2 id="settings-panel-title">Configurações</h2>
        </div>
        <button type="button" class="settings-panel__close" data-settings-close aria-label="Fechar configurações (${closeHint})">✕</button>
      </header>

      <fieldset class="settings-panel__group">
        <legend>Qualidade gráfica</legend>
        <div class="settings-quality-grid">${renderQualityOptions(settings)}</div>
      </fieldset>

      <div class="settings-panel__group">
        <label class="settings-toggle">
          <input type="checkbox" data-settings-fps ${settings.showFps ? 'checked' : ''}>
          <span><strong>Mostrar FPS</strong><small>Contador de quadros no canto da tela.</small></span>
        </label>
        <label class="settings-toggle">
          <input type="checkbox" data-settings-damage-numbers ${settings.showDamageNumbers ? 'checked' : ''}>
          <span><strong>Números de dano</strong><small>Texto de dano e cura sobre os personagens.</small></span>
        </label>
      </div>

      <div class="settings-panel__group">
        <label class="settings-slider">
          <span><strong>Sensibilidade do giro</strong><small>Arrastar gira a prévia 3D do herói.</small></span>
          <input type="range" data-settings-sensitivity
            min="${CAMERA_SENSITIVITY_MIN}" max="${CAMERA_SENSITIVITY_MAX}" step="${CAMERA_SENSITIVITY_STEP}"
            value="${settings.cameraSensitivity}" aria-label="Sensibilidade do giro da prévia">
          <output data-settings-sensitivity-value>${formatSensitivity(settings.cameraSensitivity)}</output>
        </label>
      </div>

      <footer class="settings-panel__foot">
        <button type="button" class="settings-panel__restore" data-settings-restore>Restaurar padrões</button>
        <button type="button" class="settings-panel__done" data-settings-close>Pronto</button>
      </footer>
    </section>`;
}

/**
 * Menu de Configurações aberto pela engrenagem do lobby (e pelo HUD).
 *
 * O painel não guarda estado próprio: ele recebe as configurações atuais,
 * devolve o objeto completo a cada mudança em `onChange` e quem persiste é o
 * dono do perfil. Assim o mesmo componente serve lobby e partida.
 */
export class SettingsPanel {
  private readonly qualityInputs: HTMLInputElement[];
  private readonly fpsInput: HTMLInputElement;
  private readonly damageInput: HTMLInputElement;
  private readonly sensitivityInput: HTMLInputElement;
  private readonly sensitivityOutput: HTMLOutputElement;
  private settings: PlayerSettings;
  private open = false;

  private constructor(
    private readonly root: HTMLElement,
    settings: PlayerSettings,
    private readonly onChange: (settings: PlayerSettings) => void,
    closeHint: string
  ) {
    this.settings = normalizePlayerSettings(settings);
    this.root.innerHTML = renderMarkup(this.settings, closeHint);
    this.qualityInputs = Array.from(
      this.root.querySelectorAll<HTMLInputElement>('input[name="settings-graphics-quality"]')
    );
    this.fpsInput = this.root.querySelector<HTMLInputElement>('[data-settings-fps]')!;
    this.damageInput = this.root.querySelector<HTMLInputElement>('[data-settings-damage-numbers]')!;
    this.sensitivityInput = this.root.querySelector<HTMLInputElement>('[data-settings-sensitivity]')!;
    this.sensitivityOutput = this.root.querySelector<HTMLOutputElement>('[data-settings-sensitivity-value]')!;
    this.bind();
  }

  public static mount(
    host: HTMLElement,
    settings: PlayerSettings,
    onChange: (settings: PlayerSettings) => void,
    options: SettingsPanelOptions = {}
  ): SettingsPanel {
    const root = document.createElement('div');
    root.id = SETTINGS_PANEL_ID;
    root.className = 'settings-panel hidden';
    host.appendChild(root);
    return new SettingsPanel(root, settings, onChange, options.closeHint ?? 'Esc');
  }

  public show(): void {
    this.open = true;
    this.root.classList.remove('hidden');
    this.root.querySelector<HTMLElement>('.settings-panel__card')?.focus();
  }

  public hide(): void {
    this.open = false;
    this.root.classList.add('hidden');
  }

  public isOpen(): boolean {
    return this.open;
  }

  public dispose(): void {
    this.hide();
    this.root.replaceChildren();
    this.root.remove();
  }

  /** Sincroniza os controles quando outra tela muda as configurações. */
  public setSettings(settings: PlayerSettings): void {
    this.settings = normalizePlayerSettings(settings);
    for (const input of this.qualityInputs) {
      input.checked = input.value === this.settings.graphicsQuality;
    }
    this.fpsInput.checked = this.settings.showFps;
    this.damageInput.checked = this.settings.showDamageNumbers;
    this.sensitivityInput.value = String(this.settings.cameraSensitivity);
    this.sensitivityOutput.textContent = formatSensitivity(this.settings.cameraSensitivity);
  }

  private bind(): void {
    this.root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-settings-close]')) {
        this.hide();
        return;
      }
      if (target.closest('[data-settings-restore]')) {
        this.commit(createDefaultPlayerSettings());
      }
    });
    this.root.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      if (this.qualityInputs.includes(target)) {
        this.commit({ ...this.settings, graphicsQuality: target.value as GraphicsQuality });
        return;
      }
      if (target === this.fpsInput) {
        this.commit({ ...this.settings, showFps: target.checked });
        return;
      }
      if (target === this.damageInput) {
        this.commit({ ...this.settings, showDamageNumbers: target.checked });
      }
    });
    this.sensitivityInput.addEventListener('input', () => {
      const value = Number(this.sensitivityInput.value);
      this.sensitivityOutput.textContent = formatSensitivity(value);
      this.commit({ ...this.settings, cameraSensitivity: value });
    });
    // Esc fecha mesmo com o foco fora do cartão; o painel só escuta enquanto
    // está aberto para não roubar a tecla de outros menus (admin, inventário).
    window.addEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.open) return;
    event.preventDefault();
    this.hide();
  };

  private commit(next: PlayerSettings): void {
    const normalized = normalizePlayerSettings(next);
    const changed = (Object.keys(normalized) as (keyof PlayerSettings)[])
      .some((key) => normalized[key] !== this.settings[key]);
    this.settings = normalized;
    this.setSettings(normalized);
    if (changed) this.onChange(normalized);
  }
}
