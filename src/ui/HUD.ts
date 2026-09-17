import type { MissingAnimationsInfo } from '../entities/Player';
import type { CharacterAnimationState } from '../characters/CharacterCatalog';
import {
  ANIMATION_TEST_BUTTONS,
  parseAnimationTestState,
} from './AnimationTestPanel';
import type { EquipmentId } from '../equipment/EquipmentCatalog';
import {
  parseEquipmentId,
  rewardOptionsForAvailability,
} from './RewardSelection';
import { getWaveHudContent } from './WaveHudView';
import type { WaveSnapshot } from '../waves/WaveManager';
import type { RewardPreviewPort } from './RewardWeaponPreview';
import {
  isWarriorSkillUnlocked,
  WARRIOR_SKILLS,
  type WarriorSkillId,
} from '../combat/WarriorSkillCatalog';
import type { WarriorSkillsSnapshot } from '../combat/WarriorSkillController';
import { warriorSkillAsset } from './WarriorSkillAssets';
import {
  getLockedSkillButtonState,
  getSkillButtonState,
  type CombatLockReason,
} from './SkillButtonState';
import {
  renderCraftRewardNotification,
} from './CraftRewardsPresentation';
import type { InventoryStack } from '../profile/PlayerProfile';
import {
  DEFAULT_PLAYER_HOTKEYS,
  displayPlayerHotkey,
  type PlayerHotkeys,
} from '../profile/PlayerHotkeys';
import {
  experienceProgressFor,
  type CharacterProgression,
} from '../profile/CharacterProgression';
import { formatResourcePercent, resourcePercent } from './HudVitals';

/**
 * Floating combat text styles: damage dealt, health recovered and damage taken
 * (already reduced by Defense, block rolls and dodge checks).
 */
export type FloatingDamageVariant = 'damage' | 'heal' | 'taken';

/** Keyboard-initiated button clicks have `detail === 0` and are not attacks. */
export function isPrimaryMouseClick(event: Pick<MouseEvent, 'button' | 'detail'>): boolean {
  return event.button === 0 && event.detail > 0;
}

export function renderCombatActionMarkup(hotkeys: PlayerHotkeys = DEFAULT_PLAYER_HOTKEYS): string {
  return `
    <button class="skill-slot combat-skill-card attack-slot" type="button" data-basic-attack aria-label="Ataque básico">
      <img class="skill-art" src="${warriorSkillAsset('ataque_basico')}" alt="">
      <span class="skill-card-copy"><strong class="skill-card-name">Ataque básico</strong><small class="skill-card-meta">Clique esquerdo · Livre</small></span>
      <kbd>Mouse</kbd>
    </button>
    <button class="combat-target-button" type="button" data-cycle-target aria-label="Target: selecionar o proximo monstro. Tecla Q">
      <kbd>Q</kbd><span>Target</span>
    </button>
    ${WARRIOR_SKILLS.map((skill) => `
      <button class="skill-slot combat-skill-card" type="button" data-warrior-skill="${skill.id}" aria-label="${skill.label}, tecla ${skill.input}, custo ${skill.energyCost} de energia">
        <span class="skill-cooldown" aria-hidden="true"></span>
        <img class="skill-art" src="${warriorSkillAsset(skill.id)}" alt="">
        <span class="skill-card-copy"><strong class="skill-card-name">${skill.label}</strong><small class="skill-card-meta">${skill.energyCost} energia · ${skill.cooldown.toFixed(1)}s recarga</small></span>
        <kbd data-action-hotkey="${skill.id}">${displayPlayerHotkey(hotkeys[skill.id])}</kbd>
      </button>`).join('')}`;
}

export class HUD {
  private playerHealthFill: HTMLElement;
  private playerHealthText: HTMLElement;
  private playerManaFill: HTMLElement;
  private playerManaText: HTMLElement;
  private playerXpFill: HTMLElement;
  private playerXpText: HTMLElement;
  private playerFatigueFill: HTMLElement;
  private playerFatigueText: HTMLElement;
  private bossContainer: HTMLElement;
  private bossHealthFill: HTMLElement;
  private deathScreen: HTMLElement;
  private loadingScreen: HTMLElement;
  private loadingBarFill: HTMLElement;
  private loadingText: HTMLElement;
  private loadingError: HTMLElement;
  private reloadBtn: HTMLElement;
  private damageLog: HTMLElement;
  private animWarningBanner: HTMLElement;
  private animWarningText: HTMLElement;
  private animationTestPanel: HTMLElement;
  private animationTestStatus: HTMLElement;
  private rewardSelection: HTMLElement;
  private rewardSelectionStatus: HTMLElement;
  private rewardOptionsHost: HTMLElement;
  private rewardRestart: HTMLButtonElement;
  private rewardPreview: RewardPreviewPort | null = null;
  private waveStatus: HTMLElement;
  private waveTitle: HTMLElement;
  private waveDetail: HTMLElement;
  private victoryScreen: HTMLElement;
  private playAgainButton: HTMLButtonElement;
  private rewardLastFocus: HTMLElement | null = null;
  private activeAnimationTest: CharacterAnimationState | null | undefined;
  private combatActions: HTMLElement;
  private craftRewardNotification: HTMLElement;
  private craftRewardTimer: number | undefined;
  private hotkeys: PlayerHotkeys = { ...DEFAULT_PLAYER_HOTKEYS };
  private gameplayVisible = false;

  constructor() {
    this.playerHealthFill = document.getElementById('player-health-fill')!;
    this.playerHealthText = document.getElementById('player-health-text')!;
    this.playerManaFill = document.getElementById('player-mana-fill')!;
    this.playerManaText = document.getElementById('player-mana-text')!;
    this.playerXpFill = document.getElementById('player-xp-fill')!;
    this.playerXpText = document.getElementById('player-xp-text')!;
    this.playerFatigueFill = document.getElementById('player-fatigue-fill')!;
    this.playerFatigueText = document.getElementById('player-fatigue-text')!;
    this.bossContainer = document.getElementById('boss-health-container')!;
    this.bossHealthFill = document.getElementById('boss-health-fill')!;
    this.deathScreen = document.getElementById('death-screen')!;
    this.loadingScreen = document.getElementById('loading-screen')!;
    this.loadingBarFill = document.getElementById('loading-bar-fill')!;
    this.loadingText = document.getElementById('loading-text')!;
    this.loadingError = document.getElementById('loading-error')!;
    this.reloadBtn = document.getElementById('reload-btn')!;
    this.damageLog = document.getElementById('damage-log')!;
    this.animWarningBanner = document.getElementById('anim-warning-banner')!;
    this.animWarningText = document.getElementById('anim-warning-text')!;
    this.animationTestPanel = document.getElementById('animation-test-panel')!;
    this.animationTestStatus = document.getElementById('animation-test-status')!;
    this.rewardSelection = document.getElementById('reward-selection')!;
    this.rewardSelectionStatus = document.getElementById('reward-selection-status')!;
    this.rewardOptionsHost = document.getElementById('reward-options')!;
    this.rewardRestart = document.getElementById('reward-continue') as HTMLButtonElement;
    this.waveStatus = document.getElementById('wave-status')!;
    this.waveTitle = document.getElementById('wave-title')!;
    this.waveDetail = document.getElementById('wave-detail')!;
    this.victoryScreen = document.getElementById('victory-screen')!;
    this.playAgainButton = document.getElementById('play-again-btn') as HTMLButtonElement;
    this.combatActions = document.getElementById('combat-actions')!;
    this.craftRewardNotification = document.getElementById('craft-reward-notification')!;
    this.renderCombatActions();

    const controls = document.getElementById('animation-test-controls')!;
    for (const definition of ANIMATION_TEST_BUTTONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'animation-test-button';
      button.dataset.animationState = definition.state;
      button.setAttribute('aria-pressed', 'false');
      button.innerHTML = `<span>${definition.label}</span><small>${definition.clipName}</small>`;
      controls.appendChild(button);
    }
    this.setActiveAnimationTest(null);

    this.reloadBtn.addEventListener('click', () => window.location.reload());
    document.getElementById('anim-warning-close')?.addEventListener('click', () => {
      this.animWarningBanner.classList.add('hidden');
    });
    this.rewardSelection.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab' || this.rewardSelection.classList.contains('hidden')) return;
      const focusable = [...this.rewardSelection.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled):not(.hidden)'
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  public setLoadingProgress(percent: number, text?: string) {
    this.loadingBarFill.style.width = `${percent}%`;
    if (text) this.loadingText.textContent = text;
  }

  public hideLoadingScreen() {
    this.loadingScreen.classList.add('hidden');
    this.combatActions.classList.toggle('hidden', !this.gameplayVisible);
  }

  public showLoadingScreen(percent = 0, text = 'Carregando...') {
    this.loadingScreen.classList.remove('hidden');
    this.combatActions.classList.add('hidden');
    this.loadingBarFill.style.width = `${percent}%`;
    this.loadingBarFill.style.background = '';
    this.loadingText.textContent = text;
    this.loadingError.classList.add('hidden');
    this.reloadBtn.classList.add('hidden');
  }

  public setGameplayVisible(visible: boolean) {
    this.gameplayVisible = visible;
    document.getElementById('bottom-hud')?.classList.toggle('hidden', !visible);
    this.combatActions.classList.toggle('hidden', !visible || !this.loadingScreen.classList.contains('hidden'));
    document.getElementById('gameplay-utility-dock')?.classList.toggle('hidden', !visible);
    const animationTestEnabled = typeof location !== 'undefined'
      && new URLSearchParams(location.search).has('animationTest');
    this.animationTestPanel.classList.toggle('hidden', !visible || !animationTestEnabled);
    if (!visible) this.hideWaveStatus();
    if (!visible) this.hideCraftRewardNotification();
    document.getElementById('boss-health-container')?.classList.add('hidden');
  }

  /** Normal player sessions must not retain an interactive administrator log surface. */
  public setDebugLogEnabled(enabled: boolean): void {
    if (enabled) return;
    document.getElementById('debug-log-fab')?.remove();
    document.getElementById('debug-log-panel')?.remove();
  }

  private renderCombatActions(): void {
    this.combatActions.innerHTML = renderCombatActionMarkup(this.hotkeys);
  }

  public onBasicAttack(callback: () => void): void {
    this.combatActions.querySelector('[data-basic-attack]')?.addEventListener('click', (event) => {
      if (isPrimaryMouseClick(event as MouseEvent)) callback();
    });
  }

  public onCycleTarget(callback: () => void): void {
    this.combatActions.querySelector<HTMLButtonElement>('[data-cycle-target]')?.addEventListener('click', callback);
  }

  public setHotkeys(hotkeys: PlayerHotkeys): void {
    this.hotkeys = { ...hotkeys };
    for (const [action, key] of Object.entries(this.hotkeys)) {
      const keyElement = this.combatActions.querySelector<HTMLElement>(`[data-action-hotkey="${action}"]`);
      if (keyElement) keyElement.textContent = displayPlayerHotkey(key);
    }
  }

  public onWarriorSkill(callback: (id: WarriorSkillId) => void): void {
    this.combatActions.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-warrior-skill]');
      if (button?.dataset.warriorSkill) callback(button.dataset.warriorSkill as WarriorSkillId);
    });
  }

  public updateWarriorSkills(
    snapshot: WarriorSkillsSnapshot,
    lock: CombatLockReason,
    characterLevel = 1
  ): void {
    this.updatePlayerMana(snapshot.energy, snapshot.maxEnergy);
    for (const skill of WARRIOR_SKILLS) {
      const state = snapshot.skills[skill.id];
      const button = this.combatActions.querySelector<HTMLButtonElement>(`[data-warrior-skill="${skill.id}"]`);
      if (!button) continue;
      const progress = state.cooldown > 0 ? state.cooldownRemaining / state.cooldown : 0;
      const unlocked = isWarriorSkillUnlocked(skill.id, characterLevel);
      const view = unlocked
        ? getSkillButtonState(skill.label, state, lock)
        : getLockedSkillButtonState(skill.label, skill.unlockLevel);
      button.style.setProperty('--cooldown-progress', String(progress));
      button.disabled = view.disabled;
      button.dataset.locked = String(!unlocked);
      button.dataset.requiredLevel = String(skill.unlockLevel);
      button.dataset.cooldown = state.cooldownRemaining > 0 ? state.cooldownRemaining.toFixed(1) : '';
      button.dataset.status = view.status;
      button.dataset.available = String(unlocked && !view.disabled);
      button.title = `${skill.label}: ${view.status}`;
      button.setAttribute('aria-label', `${view.ariaLabel}. Tecla ${displayPlayerHotkey(this.hotkeys[skill.id])}`);
      const detail = button.querySelector('.skill-card-meta');
      if (detail) {
        detail.textContent = unlocked
          ? `${skill.energyCost} energia · ${skill.cooldown.toFixed(1)}s recarga`
          : `Nv. ${skill.unlockLevel}`;
      }
    }
    const basic = this.combatActions.querySelector<HTMLButtonElement>('[data-basic-attack]');
    if (basic) {
      basic.disabled = lock !== null;
      const status = lock === 'busy' ? 'Executando outro ataque'
        : lock === 'paused' ? 'Jogo pausado'
          : lock === 'dead' ? 'Personagem derrotado'
            : lock === 'unavailable' ? 'Ação indisponível'
              : 'Disponível';
      basic.dataset.status = status;
      basic.dataset.available = String(!basic.disabled);
      basic.setAttribute('aria-label', `Ataque básico. ${status}. Clique esquerdo do mouse.`);
    }
  }

  public onOpenEquipment(callback: () => void): void {
    document.querySelector<HTMLElement>('[data-open-equipment]')?.addEventListener('click', callback);
  }

  public onOpenBackpack(callback: () => void): void {
    document.querySelector<HTMLElement>('[data-open-backpack]')?.addEventListener('click', callback);
  }

  public onOpenStatus(callback: () => void): void {
    document.querySelector<HTMLElement>('[data-open-status]')?.addEventListener('click', callback);
  }

  public setPlayerCharacter(name: string) {
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const portrait = document.getElementById('player-portrait');
    const fallback = portrait?.querySelector('span');
    if (fallback) fallback.textContent = initials;
  }

  public setPlayerPortrait(imageUrl: string): void {
    const portrait = document.getElementById('player-portrait');
    if (!portrait) return;
    portrait.style.setProperty('--portrait-image', `url("${imageUrl}")`);
    portrait.classList.add('has-portrait');
  }

  public updateProgression(progression: CharacterProgression, availablePoints: number): void {
    const level = document.getElementById('player-level');
    const points = document.getElementById('player-stat-points');
    const progress = experienceProgressFor(progression);
    if (level) level.textContent = `Nv. ${progression.level}`;
    this.playerXpFill.style.width = `${progress.percent}%`;
    this.playerXpText.textContent = `${Math.round(progress.percent)}%`;
    if (points) points.textContent = `${availablePoints} ${availablePoints === 1 ? 'ponto' : 'pontos'}`;
  }

  /** A non-modal notice keeps the final chest sequence visible and keyboard-safe. */
  public showCraftRewardNotification(
    rewards: readonly InventoryStack[],
    deferred: readonly InventoryStack[] = [],
    saved = true
  ): void {
    if (this.craftRewardTimer !== undefined) window.clearTimeout(this.craftRewardTimer);
    renderCraftRewardNotification(this.craftRewardNotification, rewards, deferred, saved);
    this.craftRewardNotification.classList.remove('hidden');
    this.craftRewardTimer = window.setTimeout(() => this.hideCraftRewardNotification(), 9000);
  }

  public hideCraftRewardNotification(): void {
    if (this.craftRewardTimer !== undefined) window.clearTimeout(this.craftRewardTimer);
    this.craftRewardTimer = undefined;
    this.craftRewardNotification.classList.add('hidden');
    this.craftRewardNotification.replaceChildren();
  }

  public onAnimationTest(callback: (state: CharacterAnimationState) => void) {
    this.animationTestPanel.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>('[data-animation-state]');
      const state = parseAnimationTestState(button?.dataset.animationState);
      if (state) callback(state);
    });
  }

  public setActiveAnimationTest(state: CharacterAnimationState | null) {
    if (state === this.activeAnimationTest) return;
    this.activeAnimationTest = state;

    const buttons = this.animationTestPanel.querySelectorAll<HTMLButtonElement>(
      '[data-animation-state]'
    );
    for (const button of buttons) {
      const isActive = button.dataset.animationState === state;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    }

    const definition = ANIMATION_TEST_BUTTONS.find((button) => button.state === state);
    this.animationTestStatus.textContent = definition
      ? `Executando: ${definition.label} (${definition.clipName})`
      : 'Selecione uma animação';
  }

  public onRewardSelect(callback: (id: EquipmentId) => void) {
    this.rewardSelection.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>('[data-equipment-id]');
      if (!button || button.disabled) return;
      const id = parseEquipmentId(button.dataset.equipmentId);
      if (id) callback(id);
    });
    this.rewardSelection.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>('[data-equipment-id]');
      if (!button || button.disabled) return;
      event.preventDefault();
      button.click();
    });
  }

  public onEquipmentRestart(callback: () => void) {
    this.rewardRestart.addEventListener('click', callback);
  }

  public attachRewardPreview(preview: RewardPreviewPort): void {
    this.rewardPreview?.dispose();
    this.rewardPreview = preview;
  }

  public updateWaveStatus(snapshot: WaveSnapshot): void {
    const content = getWaveHudContent(snapshot);
    this.waveStatus.classList.toggle('hidden', !content.visible);
    this.waveTitle.textContent = content.title;
    this.waveDetail.textContent = content.detail;
  }

  public hideWaveStatus(): void {
    this.waveStatus.classList.add('hidden');
  }

  public showVictoryScreen(): void {
    this.hideWaveStatus();
    this.victoryScreen.classList.remove('hidden');
    this.playAgainButton.focus();
  }

  public hideVictoryScreen(): void {
    this.victoryScreen.classList.add('hidden');
  }

  public onPlayAgain(callback: () => void): void {
    this.playAgainButton.addEventListener('click', callback);
  }

  public showRewardSelection(
    availability: Readonly<Record<EquipmentId, boolean>>
  ) {
    if (this.rewardSelection.classList.contains('hidden')) {
      this.rewardLastFocus = document.activeElement as HTMLElement | null;
    }
    const options = rewardOptionsForAvailability(availability);
    this.renderRewardOptions(options);

    const anyAvailable = options.some(({ enabled }) => enabled);
    this.rewardRestart.classList.toggle('hidden', anyAvailable);
    const unavailable = options.filter(({ enabled }) => !enabled);
    this.rewardSelectionStatus.textContent = !anyAvailable
      ? 'As duas armas não puderam ser carregadas.'
      : unavailable.length > 0
        ? `${unavailable.map(({ name }) => name).join(' e ')} indisponível. Escolha a arma disponível.`
        : 'A escolha é definitiva para esta recompensa.';
    this.rewardSelectionStatus.classList.toggle('is-error', !anyAvailable);
    this.rewardSelection.classList.remove('hidden');
    this.rewardPreview?.show(availability);

    const focusTarget = this.rewardSelection.querySelector<HTMLButtonElement>(
      '[data-equipment-id]:not(:disabled), #reward-continue:not(.hidden)'
    );
    focusTarget?.focus();
  }

  public showRewardError(message: string) {
    this.rewardSelectionStatus.textContent = message;
    this.rewardSelectionStatus.classList.add('is-error');
  }

  public hideRewardSelection() {
    this.rewardPreview?.hide();
    this.rewardSelection.classList.add('hidden');
    if (this.rewardLastFocus?.isConnected) this.rewardLastFocus.focus();
    this.rewardLastFocus = null;
  }

  private renderRewardOptions(
    options: ReturnType<typeof rewardOptionsForAvailability>
  ): void {
    this.rewardOptionsHost.replaceChildren();
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'reward-weapon-card';
      button.dataset.equipmentId = option.id;
      button.disabled = !option.enabled;
      button.setAttribute('aria-disabled', String(!option.enabled));
      button.setAttribute(
        'aria-label',
        `${option.name}. Dano ${option.damage}. Alcance ${option.range}. Recarga ${option.cooldown}. ` +
        `Roubo ao matar normal ${option.regularHeal}. Roubo ao matar mini-boss ${option.miniBossHeal}. ` +
        `Defesa contra normal ${option.defense}.` +
        (option.enabled ? '' : ' Indisponível: modelo 3D não carregado.')
      );
      button.innerHTML = `
        <span class="reward-preview-stage">
          <canvas data-weapon-preview="${option.id}" aria-hidden="true"></canvas>
          <span class="reward-preview-fallback" hidden>Prévia 3D indisponível</span>
          <svg class="reward-forge-ring" viewBox="0 0 100 24" aria-hidden="true">
            <ellipse cx="50" cy="12" rx="44" ry="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="M12 12h12M76 12h12" stroke="currentColor" stroke-width="2"/>
          </svg>
        </span>
        <span class="reward-card-heading"><strong>${option.name}</strong><small>${option.subtitle}</small></span>
        <span class="reward-primary-stats">
          <span><svg class="reward-stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 19 14-14M8 4l12 12M4 8l12 12"/></svg><b>${option.damage}</b><small>Dano</small></span>
          <span><svg class="reward-stat-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/></svg><b>${option.range}</b><small>Alcance</small></span>
          <span><svg class="reward-stat-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M9 3h6M12 9v5l3 2"/></svg><b>${option.cooldown}</b><small>Recarga</small></span>
        </span>
        <span class="reward-special-stats">
          <span><span><svg class="reward-stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11Z"/></svg>Roubo ao matar normal</span><b>${option.regularHeal}</b></span>
          <span><span><svg class="reward-stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11Z"/></svg>Roubo ao matar mini-boss</span><b>${option.miniBossHeal}</b></span>
          <span><span><svg class="reward-stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z"/></svg>Defesa contra normal</span><b>${option.defense}</b></span>
        </span>`;
      this.rewardOptionsHost.appendChild(button);
    }
  }

  public showLoadingError(message: string) {
    this.loadingText.textContent = 'Ocorreu um erro ao carregar o jogo.';
    this.loadingError.textContent = message;
    this.loadingError.classList.remove('hidden');
    this.reloadBtn.classList.remove('hidden');
    this.loadingBarFill.style.background = 'linear-gradient(90deg, #5a0a0a, #300505)';
  }

  /** Mostra um banner discreto avisando quais animações não foram encontradas no .glb */
  public showAnimationWarning(info: MissingAnimationsInfo) {
    this.animWarningText.textContent =
      `⚠️ Animações não encontradas: ${info.missing.join(', ')}. ` +
      `O personagem funciona (move/ataca) mas sem a animação correta. ` +
      `Clipes encontrados no GLB: ${info.foundClipNames.join(', ') || 'nenhum'}. ` +
      `Verifique a exportação do Blender (Actions separadas).`;
    this.animWarningBanner.classList.remove('hidden');
  }

  public updatePlayerHealth(hp: number, maxHp: number) {
    const pct = resourcePercent(hp, maxHp);
    this.playerHealthFill.style.width = `${pct}%`;
    this.playerHealthText.textContent = formatResourcePercent(hp, maxHp);
  }

  public updatePlayerMana(mana: number, maxMana: number) {
    const pct = resourcePercent(mana, maxMana);
    this.playerManaFill.style.width = `${pct}%`;
    this.playerManaText.textContent = formatResourcePercent(mana, maxMana);
  }

  public updatePlayerFatigue(fatigue: number, maxFatigue = 100) {
    const pct = resourcePercent(fatigue, maxFatigue);
    this.playerFatigueFill.style.width = `${pct}%`;
    this.playerFatigueText.textContent = formatResourcePercent(fatigue, maxFatigue);
  }

  public showBossHealth() {
    this.bossContainer.classList.remove('hidden');
  }

  public hideBossHealth() {
    this.bossContainer.classList.add('hidden');
  }

  public updateBossHealth(hp: number, maxHp: number) {
    const pct = Math.max(0, (hp / maxHp) * 100);
    this.bossHealthFill.style.width = `${pct}%`;
  }

  public showDeathScreen() {
    this.deathScreen.classList.remove('hidden');
  }

  public hideDeathScreen() {
    this.deathScreen.classList.add('hidden');
  }

  public onRespawnClick(callback: () => void) {
    document.getElementById('respawn-btn')!.addEventListener('click', callback);
  }

  public spawnFloatingDamage(
    screenX: number,
    screenY: number,
    text: string,
    variant: FloatingDamageVariant = 'damage'
  ) {
    const el = document.createElement('div');
    el.className = 'floating-damage' + (variant === 'damage' ? '' : ` ${variant}`);
    el.textContent = text;
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    this.damageLog.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
}
