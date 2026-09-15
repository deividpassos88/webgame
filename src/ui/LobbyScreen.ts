import * as THREE from 'three';
import { resolveCharacterClips } from '../characters/CharacterAnimations';
import { gameKeyForEvent } from '../core/InputManager';
import { CharacterAssetStore } from '../characters/CharacterAssetStore';
import { getCharacterDefinition } from '../characters/CharacterCatalog';
import {
  prepareGuildTokenBackpackExpansion,
  type BackpackExpansionResult,
} from '../inventory/BackpackExpansion';
import type { InventorySnapshot, InventoryStore } from '../inventory/InventoryStore';
import type { PlayerProfile, RpgEquipmentSlot, InventoryStack } from '../profile/PlayerProfile';
import { getInventoryItem, type InventoryItemDefinition } from '../inventory/InventoryCatalog';
import {
  displayPlayerHotkey,
  PLAYER_HOTKEY_ACTIONS,
  registerPlayerHotkey,
  type PlayerHotkeyAction,
  type PlayerHotkeys,
} from '../profile/PlayerHotkeys';
import { WARRIOR_SKILLS } from '../combat/WarriorSkillCatalog';
import { renderSkillStars, warriorSkillAsset } from './WarriorSkillAssets';
import {
  itemTooltipDataAttributes,
  renderEquipmentSlotContent,
  renderInventorySlotContent,
} from './CraftRewardsPresentation';
import { bindItemTooltip } from './ItemTooltip';
import { restoreBackpackExpansionFocus } from './InventoryOverlay';
import {
  BlacksmithScreen,
  type BlacksmithScreenActionResult,
} from './BlacksmithScreen';
import { buildRpgUiViewModel, type CurrentCharacterStatusView } from './RpgUiViewModel';
import { type BlacksmithRecipeId } from '../crafting/BlacksmithWorkshop';
import {
  LOBBY_BACKDROP_URL,
  LOBBY_LIGHTING,
  LobbyPresentation,
  configureLobbyBackdropTexture,
  fitLobbyBackdropTexture,
  prepareLobbyModel,
} from './LobbyPresentation';

export interface LobbyScreenOptions {
  readonly firstRun: boolean;
  readonly onClassConfirmed: () => void;
  readonly onGuildTokenBackpackExpansion: () => string;
  readonly onHotkeysChanged: () => void;
  readonly onAutoBasicAttackChanged: () => void;
  readonly onLobbyInventoryChanged?: () => void;
  readonly onBlacksmithLicensePurchase: () => BlacksmithLobbyActionResult;
  readonly onBlacksmithCraft: (recipeId: BlacksmithRecipeId) => BlacksmithLobbyActionResult;
}

export type BlacksmithLobbyActionResult = BlacksmithScreenActionResult;

const ATTRIBUTE_LABELS: Readonly<Record<string, string>> = {
  strength: 'Força',
  attack: 'Ataque',
  defense: 'Defesa',
  agility: 'Agilidade',
  criticalAttack: 'Crítico',
  criticalMagic: 'Crítico mágico',
  dodge: 'Esquiva',
};

function itemStatSummary(item: InventoryItemDefinition | undefined): string {
  if (!item) return '';
  const values = item.baseDamage ? [`Ataque +${item.baseDamage}`] : [];
  for (const [attribute, amount] of Object.entries(item.statBonuses ?? {})) {
    if (amount) values.push(`${ATTRIBUTE_LABELS[attribute] ?? attribute} +${amount}`);
  }
  return values.join(' · ');
}

/** Produces focusable item slots for the lobby with the shared tooltip contract. */
export function renderLobbyBackpackContents(
  profile: PlayerProfile,
  inventory: InventorySnapshot
): string {
  return buildRpgUiViewModel(profile, inventory).backpack.map(({ index, item, quantity }) => {
    const isEquipment = item && item.kind === 'equipment' && item.slot;
    return `
      <button class="inventory-slot${item ? ' has-item' : ''}${isEquipment ? ' is-equipment' : ''}" type="button" data-lobby-inventory-index="${index}" data-rarity="${item?.rarity ?? 'empty'}" ${item ? itemTooltipDataAttributes(item, quantity) : ''} ${item ? '' : 'disabled'} aria-label="${item ? `${item.label}, quantidade ${quantity}${isEquipment ? ', clique para abrir opções' : ''}` : `Espaço vazio ${index + 1}`}">
        ${item ? renderInventorySlotContent(item, quantity) : ''}
      </button>`;
  }).join('');
}

export function renderLobbyHotkeys(
  hotkeys: PlayerHotkeys,
  pendingAction: PlayerHotkeyAction | null,
  message: string,
  autoBasicAttack = false
): string {
  const actions: readonly { action: PlayerHotkeyAction; label: string }[] = [
    ...WARRIOR_SKILLS.map((skill) => ({ action: skill.id, label: skill.label })),
  ];
  const prompt = pendingAction
    ? `Pressione uma tecla para ${actions.find(({ action }) => action === pendingAction)?.label ?? 'a ação'}.`
    : message || 'Clique em “Definir tecla” e pressione a tecla desejada.';
  return `
    <section class="lobby-hotkeys" aria-labelledby="lobby-hotkeys-title">
      <div class="lobby-hotkeys-heading"><div><p class="section-label">Combate</p><h3 id="lobby-hotkeys-title">Atalhos de combate</h3></div><small>Teclado</small></div>
      <div class="lobby-basic-auto"><span><strong>Ataque básico automático</strong><small>Ataca apenas o alvo marcado e ao alcance.</small></span><button type="button" data-toggle-basic-auto aria-pressed="${autoBasicAttack}">${autoBasicAttack ? 'Auto ligado' : 'Auto desligado'}</button></div>
      <div class="lobby-hotkey-list">
        ${actions.map(({ action, label }) => `
          <div class="lobby-hotkey-row${pendingAction === action ? ' is-capturing' : ''}">
            <span>${label}</span><kbd>${displayPlayerHotkey(hotkeys[action])}</kbd>
            <button type="button" data-register-hotkey="${action}" aria-pressed="${pendingAction === action}">${pendingAction === action ? 'Aguardando…' : 'Definir tecla'}</button>
          </div>`).join('')}
      </div>
      <p class="lobby-hotkey-message" role="status" aria-live="polite">${prompt}</p>
    </section>`;
}

export function renderLobbyCurrentStatus(status: CurrentCharacterStatusView): string {
  return `
    <section class="lobby-current-status" aria-labelledby="lobby-current-status-title">
      <p class="section-label">Ficha persistida</p>
      <h3 id="lobby-current-status-title">Status atual</h3>
      <dl class="lobby-current-status-summary">
        <div><dt>Nível</dt><dd>${status.level}</dd></div>
        <div><dt>Pontos disponíveis</dt><dd>${status.attributePointsRemaining}</dd></div>
      </dl>
      <dl class="lobby-current-status-grid">
        ${status.attributes.map(({ label, value }) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}
      </dl>
      ${status.setBonus ? `<aside class="lobby-set-bonus" aria-label="Bônus de conjunto ativo">
        <span>Conjunto completo</span>
        <strong>${status.setBonus.label}</strong>
        <p>${status.setBonus.attributes.map(({ label, value }) => `${label} +${value}`).join(' · ')}</p>
      </aside>` : ''}
    </section>`;
}

export function renderLobbyBackpackExpansionControls(
  preparation: BackpackExpansionResult
): string {
  const guildTokenAvailable = preparation.kind === 'expanded';
  const availability = preparation.kind === 'capacity-maximum'
    ? 'Limite de 60 espaços atingido.'
    : guildTokenAvailable
      ? 'Expanda a mochila em 5 espaços.'
      : 'São necessários 30 Token da Guilda.';
  return `
    <div class="backpack-expansion-actions" role="group" aria-label="Expandir mochila">
      <button class="backpack-expansion-option" type="button" data-expand-backpack="guild-token" ${guildTokenAvailable ? '' : 'disabled aria-disabled="true"'}>
        <strong>+5 espaços</strong><small>30 Token da Guilda</small>
      </button>
      <button class="backpack-expansion-option is-unavailable" type="button" data-expand-backpack="cm" disabled aria-disabled="true">
        <strong>5 CM — indisponível</strong><small>Carteira CM ainda não integrada.</small>
      </button>
      <p class="backpack-expansion-availability">${availability}</p>
    </div>`;
}

interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface LobbyPreviewViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scissorX: number;
  readonly scissorY: number;
  readonly scissorWidth: number;
  readonly scissorHeight: number;
}

export function resolveLobbyPreviewViewport(
  canvas: RectLike,
  stage: RectLike
): LobbyPreviewViewport | null {
  const visibleLeft = Math.max(canvas.left, stage.left);
  const visibleTop = Math.max(canvas.top, stage.top);
  const visibleRight = Math.min(canvas.right, stage.right);
  const visibleBottom = Math.min(canvas.bottom, stage.bottom);
  if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) return null;
  return {
    x: stage.left - canvas.left,
    y: canvas.bottom - stage.bottom,
    width: Math.max(1, stage.width),
    height: Math.max(1, stage.height),
    scissorX: visibleLeft - canvas.left,
    scissorY: canvas.bottom - visibleBottom,
    scissorWidth: visibleRight - visibleLeft,
    scissorHeight: visibleBottom - visibleTop,
  };
}

export function adjustLobbyPreview(
  rotation: number,
  zoom: number,
  key: string
): { rotation: number; zoom: number; handled: boolean } {
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    return {
      rotation: rotation + THREE.MathUtils.degToRad(key === 'ArrowLeft' ? -12 : 12),
      zoom,
      handled: true,
    };
  }
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    return {
      rotation,
      zoom: THREE.MathUtils.clamp(zoom + (key === 'ArrowUp' ? -0.35 : 0.35), 4.7, 8.2),
      handled: true,
    };
  }
  return { rotation, zoom, handled: false };
}

export function lobbyMotionPolicy(prefersReducedMotion: boolean): {
  animateIdle: boolean;
  continuousRender: boolean;
} {
  return {
    animateIdle: !prefersReducedMotion,
    continuousRender: !prefersReducedMotion,
  };
}

export type LobbyIdlePhase = 'lobby_dwarf_idle';

export function resolveLobbyIdlePhase(_elapsedSeconds: number): LobbyIdlePhase {
  return 'lobby_dwarf_idle';
}

/** Reuses the game renderer for an isolated, disposable Warrior lobby preview. */
export class LobbyScreen {
  private readonly classScreen = document.getElementById('class-select-screen')!;
  private readonly lobbyScreen = document.getElementById('lobby-screen')!;
  private readonly selectButton = document.getElementById('select-warrior') as HTMLButtonElement;
  private readonly startButton = document.getElementById('start-game') as HTMLButtonElement;
  private readonly heroStage = document.querySelector('.lobby-hero-stage') as HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly backdropScene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  private readonly clock = new THREE.Clock();
  private modelHolder = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private lobbyIdleAction: THREE.AnimationAction | null = null;
  private fallbackIdleAction: THREE.AnimationAction | null = null;
  private frameId = 0;
  private active = false;
  private dragging = false;
  private lastPointerX = 0;
  // The lobby reference keeps the full silhouette above the physical dais.
  // A slightly wider default framing leaves the feet and CTA breathing room.
  private zoom = 5.3;
  private resolver: (() => void) | null = null;
  private classConfirm: (() => void) | null = null;
  private guildTokenBackpackExpansion: (() => string) | null = null;
  private hotkeysChanged: (() => void) | null = null;
  private autoBasicAttackChanged: (() => void) | null = null;
  private blacksmithLicensePurchase: (() => BlacksmithLobbyActionResult) | null = null;
  private blacksmithCraft: ((recipeId: BlacksmithRecipeId) => BlacksmithLobbyActionResult) | null = null;
  private readonly blacksmithScreen: BlacksmithScreen;
  private pendingHotkeyAction: PlayerHotkeyAction | null = null;
  private hotkeyMessage = '';
  private inventorySearchQuery = '';
  private inventoryFilter: 'all' | 'equipment' | 'material' = 'all';
  private backdropTexture: THREE.Texture | null = null;
  private backdropAspect = 1.5;
  private disposed = false;
  private readonly reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly fallbackBackground = new THREE.Color(0x111827);
  private readonly presentation = new LobbyPresentation();
  private readonly unbindItemTooltip: () => void;
  private readonly itemActionsPanel = document.getElementById('lobby-item-actions')!;
  private readonly itemActionsTitle = document.getElementById('lobby-item-actions-title')!;
  private readonly itemActionsState = document.getElementById('lobby-item-actions-state')!;
  private readonly itemActionsArt = document.getElementById('lobby-item-actions-art')!;
  private readonly itemActionsDescription = document.getElementById('lobby-item-actions-description')!;
  private readonly itemActionsStat = document.getElementById('lobby-item-actions-stat')!;
  private readonly destroyConfirmDialog = document.getElementById('lobby-item-destroy-confirm')!;
  private readonly destroyConfirmName = document.getElementById('lobby-item-destroy-name')!;
  private lobbyInventoryChanged: (() => void) | null = null;
  private readonly adminInventoryChanged = (): void => {
    if (!this.active) return;
    this.hideItemActions();
    this.renderData();
    this.requestFrame();
  };
  /** Currently selected backpack stack driving the item action popover. */
  private selectedStack:
    | { location: 'backpack'; index: number; itemId: string; quantity: number }
    | { location: 'equipment'; slot: RpgEquipmentSlot; itemId: string; quantity: 1 }
    | null = null;

  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly canvas: HTMLCanvasElement,
    private readonly assets: CharacterAssetStore,
    private readonly profile: PlayerProfile,
    private readonly inventory: InventoryStore
  ) {
    this.setupScene();
    this.unbindItemTooltip = bindItemTooltip(this.lobbyScreen);
    this.itemActionsPanel.addEventListener('click', this.itemActionClick);
    this.itemActionsPanel.addEventListener('keydown', this.itemActionKeyDown);
    this.destroyConfirmDialog.addEventListener('click', this.destroyConfirmClick);
    this.destroyConfirmDialog.addEventListener('keydown', this.destroyConfirmKeyDown);
    this.blacksmithScreen = new BlacksmithScreen(
      document.getElementById('blacksmith-screen')!,
      this.profile,
      this.inventory,
      {
        onLicensePurchase: () => this.blacksmithLicensePurchase?.()
          ?? { message: 'A licença da oficina está indisponível.' },
        onCraft: (recipeId) => this.blacksmithCraft?.(recipeId)
          ?? { message: 'A oficina está indisponível.' },
        onBack: () => this.returnFromBlacksmith(),
      }
    );
    this.renderData();
  }

  public show(options: LobbyScreenOptions): Promise<void> {
    this.active = true;
    this.presentation.enter(this.renderer);
    this.classConfirm = options.onClassConfirmed;
    this.guildTokenBackpackExpansion = options.onGuildTokenBackpackExpansion;
    this.hotkeysChanged = options.onHotkeysChanged;
    this.autoBasicAttackChanged = options.onAutoBasicAttackChanged;
    this.lobbyInventoryChanged = options.onLobbyInventoryChanged ?? null;
    this.blacksmithLicensePurchase = options.onBlacksmithLicensePurchase;
    this.blacksmithCraft = options.onBlacksmithCraft;
    this.blacksmithScreen.hide();
    this.startButton.disabled = false;
    this.hideItemActions();
    this.renderData();
    this.classScreen.classList.toggle('hidden', !options.firstRun);
    this.lobbyScreen.classList.toggle('hidden', options.firstRun);
    this.bind();
    this.resize();
    this.clock.start();
    this.requestFrame();
    (options.firstRun ? this.selectButton : this.startButton).focus();
    return new Promise<void>((resolve) => { this.resolver = resolve; });
  }

  private setupScene(): void {
    this.scene.background = null;
    this.backdropScene.background = this.fallbackBackground;
    this.scene.fog = null;
    try {
      new THREE.TextureLoader().load(
        LOBBY_BACKDROP_URL,
        (texture) => {
          configureLobbyBackdropTexture(texture);
          if (this.disposed) {
            texture.dispose();
            return;
          }
          this.backdropTexture = texture;
          const image = texture.image as { width?: number; height?: number } | undefined;
          if (image?.width && image?.height) this.backdropAspect = image.width / image.height;
          this.backdropScene.background = texture;
          this.requestFrame();
        },
        undefined,
        () => {
          if (!this.disposed) this.backdropScene.background = this.fallbackBackground;
        }
      );
    } catch {
      this.backdropScene.background = this.fallbackBackground;
    }

    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x2b3545, 1.35));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const key = new THREE.DirectionalLight(LOBBY_LIGHTING.key.color, LOBBY_LIGHTING.key.intensity);
    key.position.set(-3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 24;
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -3;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.025;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(LOBBY_LIGHTING.fill.color, LOBBY_LIGHTING.fill.intensity);
    fill.position.set(4, 3, 2);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(LOBBY_LIGHTING.rim.color, LOBBY_LIGHTING.rim.intensity);
    rim.position.set(4, 3, -3);
    this.scene.add(rim);

    const bounce = new THREE.PointLight(LOBBY_LIGHTING.bounce.color, LOBBY_LIGHTING.bounce.intensity, 12, 1.6);
    bounce.position.set(0, 1.8, 3.6);
    this.scene.add(bounce);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.ShadowMaterial({
        color: 0x05080d,
        opacity: 0.28,
        transparent: true,
        depthWrite: false,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.name = 'lobby-shadow-catcher';
    floor.receiveShadow = true;
    this.scene.add(floor);

    const definition = getCharacterDefinition('paladin');
    const model = this.assets.createModel('paladin');
    prepareLobbyModel(model);
    model.scale.setScalar(definition.previewScale);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (!this.isHierarchyVisible(mesh)) return;
      bounds.expandByObject(mesh);
    });
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -bounds.min.y, -center.z);
    this.modelHolder.add(model);
    this.modelHolder.rotation.y = 0;
    this.scene.add(this.modelHolder);
    this.mixer = new THREE.AnimationMixer(model);
    const nativeClips = this.assets.getAnimations('paladin');
    const lobbyIdle = nativeClips.find(
      (candidate) => candidate.name === resolveLobbyIdlePhase(0)
    );
    if (lobbyIdle) {
      const action = this.mixer.clipAction(lobbyIdle);
      action.setLoop(THREE.LoopRepeat, Infinity);
      this.lobbyIdleAction = action;
    }
    const idle = resolveCharacterClips('paladin', this.assets).idle;
    if (idle) {
      this.fallbackIdleAction = this.mixer.clipAction(idle);
      this.fallbackIdleAction.setLoop(THREE.LoopRepeat, Infinity);
    }
    this.playLobbyIdle();
  }

  private renderData(): void {
    const inventory = this.inventory.snapshot();
    const view = buildRpgUiViewModel(this.profile, inventory);
    const equipmentMarkup = view.equipment.map(({ slot, label, item }) => item
      ? `<button class="equipment-slot is-equipped" type="button" data-lobby-equipped-slot="${slot}" aria-label="${label}: ${item.label}. Abrir ações do item.">
          ${renderEquipmentSlotContent(slot, label, item)}
        </button>`
      : `<div class="equipment-slot" data-equipment-slot="${slot}" aria-label="${label}: Vazio">
          <span class="equipment-slot__art" aria-hidden="true"></span>
          <span class="equipment-slot__label">${label}</span>
        </div>`).join('');
    document.getElementById('lobby-equipment-slots')!.innerHTML = equipmentMarkup;
    document.getElementById('lobby-current-status')!.innerHTML = renderLobbyCurrentStatus(view.currentStatus);
    document.getElementById('lobby-capacity')!.textContent = `${view.backpack.filter(({ item }) => item).length} / ${view.backpack.length}`;
    document.getElementById('lobby-backpack-actions')!.innerHTML = renderLobbyBackpackExpansionControls(
      prepareGuildTokenBackpackExpansion(this.profile, inventory)
    );
    document.getElementById('lobby-backpack')!.innerHTML = renderLobbyBackpackContents(
      this.profile,
      inventory
    );
    this.syncInventoryTools();
    document.getElementById('lobby-skills')!.innerHTML = view.skills.map((skill) => `
      <article class="lobby-skill-row">
        <img class="skill-art" src="${warriorSkillAsset(skill.id)}" alt="">
        <span><strong>${skill.label}</strong><small>${skill.energyCost} energia · ${skill.cooldown.toFixed(1)}s</small></span>
        ${renderSkillStars(skill.stars.filter(Boolean).length)}
      </article>`).join('');
    document.getElementById('lobby-hotkeys')!.innerHTML = renderLobbyHotkeys(
      this.profile.hotkeys,
      this.pendingHotkeyAction,
      this.hotkeyMessage,
      this.profile.autoBasicAttack
    );
  }

  private bind(): void {
    this.selectButton.addEventListener('click', this.confirmClass);
    this.startButton.addEventListener('click', this.startGame);
    this.heroStage.addEventListener('pointerdown', this.pointerDown);
    window.addEventListener('pointermove', this.pointerMove);
    window.addEventListener('pointerup', this.pointerUp);
    this.heroStage.addEventListener('wheel', this.wheel, { passive: false });
    this.heroStage.addEventListener('keydown', this.previewKeyDown);
    window.addEventListener('resize', this.resize);
    this.lobbyScreen.addEventListener('scroll', this.requestFrame, { passive: true });
    this.reducedMotionQuery.addEventListener('change', this.motionPreferenceChanged);
    this.lobbyScreen.addEventListener('click', this.tabClick);
    this.lobbyScreen.addEventListener('click', this.equipmentViewClick);
    this.lobbyScreen.addEventListener('keydown', this.equipmentViewKeydown);
    this.lobbyScreen.addEventListener('click', this.backpackExpansionClick);
    this.lobbyScreen.addEventListener('click', this.hotkeyRegistrationClick);
    this.lobbyScreen.addEventListener('click', this.autoBasicAttackClick);
    this.lobbyScreen.addEventListener('click', this.lobbyInventoryClick);
    this.lobbyScreen.addEventListener('click', this.lobbyEquipmentClick);
    this.lobbyScreen.addEventListener('input', this.inventorySearchInput);
    this.lobbyScreen.addEventListener('change', this.inventoryFilterChange);
    document.addEventListener('dragon-miner:admin-inventory-changed', this.adminInventoryChanged);
    // The popover lives outside #lobby-screen, so outside-clicks are caught
    // on the document in capture phase to close it anywhere on the page.
    document.addEventListener('click', this.outsideLobbyClick, true);
    window.addEventListener('keydown', this.hotkeyCapture, true);
  }

  private unbind(): void {
    this.selectButton.removeEventListener('click', this.confirmClass);
    this.startButton.removeEventListener('click', this.startGame);
    this.heroStage.removeEventListener('pointerdown', this.pointerDown);
    window.removeEventListener('pointermove', this.pointerMove);
    window.removeEventListener('pointerup', this.pointerUp);
    this.heroStage.removeEventListener('wheel', this.wheel);
    this.heroStage.removeEventListener('keydown', this.previewKeyDown);
    window.removeEventListener('resize', this.resize);
    this.lobbyScreen.removeEventListener('scroll', this.requestFrame);
    this.reducedMotionQuery.removeEventListener('change', this.motionPreferenceChanged);
    this.lobbyScreen.removeEventListener('click', this.tabClick);
    this.lobbyScreen.removeEventListener('click', this.equipmentViewClick);
    this.lobbyScreen.removeEventListener('keydown', this.equipmentViewKeydown);
    this.lobbyScreen.removeEventListener('click', this.backpackExpansionClick);
    this.lobbyScreen.removeEventListener('click', this.hotkeyRegistrationClick);
    this.lobbyScreen.removeEventListener('click', this.autoBasicAttackClick);
    this.lobbyScreen.removeEventListener('click', this.lobbyInventoryClick);
    this.lobbyScreen.removeEventListener('click', this.lobbyEquipmentClick);
    this.lobbyScreen.removeEventListener('input', this.inventorySearchInput);
    this.lobbyScreen.removeEventListener('change', this.inventoryFilterChange);
    document.removeEventListener('dragon-miner:admin-inventory-changed', this.adminInventoryChanged);
    document.removeEventListener('click', this.outsideLobbyClick, true);
    window.removeEventListener('keydown', this.hotkeyCapture, true);
  }

  private confirmClass = (): void => {
    this.classConfirm?.();
    this.classScreen.classList.add('hidden');
    this.lobbyScreen.classList.remove('hidden');
    this.requestFrame();
    this.startButton.focus();
  };

  private startGame = (): void => {
    const resolve = this.resolver;
    this.resolver = null;
    this.dispose();
    resolve?.();
  };

  private hotkeyRegistrationClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-register-hotkey]');
    const action = button?.dataset.registerHotkey as PlayerHotkeyAction | undefined;
    if (!button || !action || !PLAYER_HOTKEY_ACTIONS.includes(action)) return;
    this.pendingHotkeyAction = this.pendingHotkeyAction === action ? null : action;
    this.hotkeyMessage = this.pendingHotkeyAction ? '' : 'Registro de tecla cancelado.';
    this.renderData();
    this.lobbyScreen.querySelector<HTMLButtonElement>(`[data-register-hotkey="${action}"]`)?.focus();
  };

  private autoBasicAttackClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-toggle-basic-auto]');
    if (!button) return;
    this.profile.autoBasicAttack = !this.profile.autoBasicAttack;
    this.hotkeyMessage = this.profile.autoBasicAttack
      ? 'Ataque básico automático ativado.'
      : 'Ataque básico automático desativado.';
    this.autoBasicAttackChanged?.();
    this.renderData();
  };

  private hotkeyCapture = (event: KeyboardEvent): void => {
    const action = this.pendingHotkeyAction;
    if (!action || event.repeat) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      this.pendingHotkeyAction = null;
      this.hotkeyMessage = 'Registro de tecla cancelado.';
      this.renderData();
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) {
      this.hotkeyMessage = 'Use uma única tecla de letra, número ou Espaço.';
      this.renderData();
      return;
    }
    const result = registerPlayerHotkey(this.profile.hotkeys, action, gameKeyForEvent(event));
    if (result.kind === 'updated') {
      this.profile.hotkeys = result.hotkeys;
      this.pendingHotkeyAction = null;
      this.hotkeyMessage = `Tecla ${displayPlayerHotkey(result.hotkeys[action])} registrada para o combate.`;
      this.hotkeysChanged?.();
    } else if (result.kind === 'conflict') {
      this.hotkeyMessage = 'Essa tecla já está atribuída a outra ação.';
    } else if (result.kind === 'reserved') {
      this.hotkeyMessage = 'Essa tecla é reservada para movimento ou interface.';
    } else {
      this.hotkeyMessage = 'Use uma letra, um número ou Espaço.';
    }
    this.renderData();
  };

  private tabClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-lobby-tab]');
    if (!button) return;
    const tab = button.dataset.lobbyTab;
    if (!tab) return;
    if (tab === 'blacksmith') {
      this.openBlacksmith(button);
      return;
    }
    this.selectLobbyTab(tab);
  };

  private equipmentViewClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-lobby-equipment-view]');
    const view = button?.dataset.lobbyEquipmentView;
    if (!button || (view !== 'equipment' && view !== 'status')) return;
    this.selectEquipmentView(view);
  };

  private equipmentViewKeydown = (event: KeyboardEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.lobby-equipment-tabs [role="tab"]');
    if (!button || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...this.lobbyScreen.querySelectorAll<HTMLButtonElement>('.lobby-equipment-tabs [role="tab"]')];
    if (buttons.length === 0) return;
    event.preventDefault();
    const current = Math.max(0, buttons.indexOf(button));
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? buttons.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    const view = buttons[next].dataset.lobbyEquipmentView;
    if (view === 'equipment' || view === 'status') this.selectEquipmentView(view);
  };

  private selectEquipmentView(view: 'equipment' | 'status'): void {
    const equipment = this.lobbyScreen.querySelector<HTMLElement>('.lobby-equipment');
    if (!equipment) return;
    equipment.dataset.lobbyEquipmentView = view;
    const equipmentPanel = this.lobbyScreen.querySelector<HTMLElement>('#lobby-equipment-panel');
    const statusPanel = this.lobbyScreen.querySelector<HTMLElement>('#lobby-status-panel');
    if (equipmentPanel) equipmentPanel.hidden = view !== 'equipment';
    if (statusPanel) statusPanel.hidden = view !== 'status';
    this.lobbyScreen.querySelectorAll<HTMLButtonElement>('.lobby-equipment-tabs [role="tab"]').forEach((candidate) => {
      const selected = candidate.dataset.lobbyEquipmentView === view;
      candidate.setAttribute('aria-selected', String(selected));
      candidate.tabIndex = selected ? 0 : -1;
    });
  }

  private openBlacksmith(button: HTMLButtonElement): void {
    this.startButton.disabled = true;
    this.lobbyScreen.classList.add('hidden');
    this.lobbyScreen.querySelectorAll<HTMLButtonElement>('[data-lobby-tab]').forEach((candidate) => {
      candidate.setAttribute('aria-pressed', String(candidate === button));
    });
    this.blacksmithScreen.show();
  }

  private returnFromBlacksmith(): void {
    this.startButton.disabled = false;
    this.lobbyScreen.classList.remove('hidden');
    this.renderData();
    this.selectLobbyTab('hero');
    this.lobbyScreen.querySelector<HTMLButtonElement>('[data-lobby-tab="blacksmith"]')?.focus();
  }

  private selectLobbyTab(tab: string): void {
    const view = tab === 'skills' ? 'skills' : 'inventory';
    const detailPanel = this.lobbyScreen.querySelector<HTMLElement>('.lobby-detail-panel');
    if (detailPanel) detailPanel.dataset.lobbyView = view;
    this.lobbyScreen.querySelector<HTMLElement>(`[data-lobby-panel="${tab}"]`)
      ?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'nearest',
      });
    this.lobbyScreen.querySelectorAll<HTMLButtonElement>('[data-lobby-tab]').forEach((candidate) => {
      candidate.setAttribute('aria-pressed', String(candidate.dataset.lobbyTab === tab));
    });
    this.requestFrame();
  }

  private inventorySearchInput = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    if (input.id !== 'lobby-inventory-search') return;
    this.inventorySearchQuery = input.value.trim().toLocaleLowerCase('pt-BR');
    this.applyInventoryFilter();
  };

  private inventoryFilterChange = (event: Event): void => {
    const select = event.target as HTMLSelectElement;
    if (select.id !== 'lobby-inventory-filter') return;
    this.inventoryFilter = select.value === 'equipment' || select.value === 'material'
      ? select.value
      : 'all';
    this.applyInventoryFilter();
  };

  private syncInventoryTools(): void {
    const input = document.getElementById('lobby-inventory-search') as HTMLInputElement | null;
    const filter = document.getElementById('lobby-inventory-filter') as HTMLSelectElement | null;
    if (input) input.value = this.inventorySearchQuery;
    if (filter) filter.value = this.inventoryFilter;
    this.applyInventoryFilter();
  }

  private applyInventoryFilter(): void {
    const stacks = this.inventory.snapshot().backpack;
    const slots = this.lobbyScreen.querySelectorAll<HTMLButtonElement>('[data-lobby-inventory-index]');
    slots.forEach((slot) => {
      const index = Number(slot.dataset.lobbyInventoryIndex);
      const stack = stacks[index];
      const item = stack ? getInventoryItem(stack.itemId) : undefined;
      if (!item) {
        slot.hidden = false;
        return;
      }
      const matchesText = !this.inventorySearchQuery
        || item.label.toLocaleLowerCase('pt-BR').includes(this.inventorySearchQuery);
      const matchesKind = this.inventoryFilter === 'all' || item.kind === this.inventoryFilter;
      slot.hidden = !(matchesText && matchesKind);
    });
  }

  /** Clicking a backpack stack toggles the compact contextual menu beside it. */
  private lobbyInventoryClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-lobby-inventory-index]');
    if (!button) return;
    const index = Number(button.dataset.lobbyInventoryIndex);
    const stack = this.inventory.snapshot().backpack[index];
    if (!stack) return;
    const item = getInventoryItem(stack.itemId);
    if (!item) return;
    if (this.selectedStack?.location === 'backpack' && this.selectedStack.index === index) {
      this.hideItemActions();
      return;
    }
    this.openItemActions({ location: 'backpack', index, itemId: stack.itemId, quantity: stack.quantity }, button);
  };

  private lobbyEquipmentClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-lobby-equipped-slot]');
    if (!button) return;
    const slot = button.dataset.lobbyEquippedSlot as RpgEquipmentSlot | undefined;
    if (!slot) return;
    const itemId = this.inventory.snapshot().equipment[slot];
    if (!itemId) return;
    if (this.selectedStack?.location === 'equipment' && this.selectedStack.slot === slot) {
      this.hideItemActions();
      return;
    }
    this.openItemActions({ location: 'equipment', slot, itemId, quantity: 1 }, button);
  };

  /** Removes the selection glow from the previously highlighted slot. */
  private clearSelectedSlotHighlight(): void {
    this.lobbyScreen
      .querySelectorAll('.inventory-slot.is-selected')
      .forEach((slot) => slot.classList.remove('is-selected'));
  }

  private openItemActions(
    selection: Exclude<typeof this.selectedStack, null>,
    source: HTMLButtonElement
  ): void {
    this.clearSelectedSlotHighlight();
    this.selectedStack = selection;
    const item = getInventoryItem(selection.itemId);
    const equipped = selection.location === 'equipment';
    this.itemActionsTitle.textContent = item?.label ?? selection.itemId;
    this.itemActionsState.textContent = equipped ? 'Equipado' : 'Na mochila';
    this.itemActionsArt.innerHTML = item ? renderInventorySlotContent(item, 1) : '';
    this.itemActionsDescription.textContent = item?.description ?? '';
    const stats = itemStatSummary(item);
    this.itemActionsStat.textContent = stats;
    this.itemActionsStat.hidden = !stats;
    const equipAction = this.itemActionsPanel.querySelector<HTMLButtonElement>('[data-item-action="equip"]');
    if (equipAction) {
      equipAction.textContent = equipped ? 'Desequipar' : 'Equipar';
      equipAction.classList.toggle('is-unequip', equipped);
    }
    const destroyAction = this.itemActionsPanel.querySelector<HTMLButtonElement>('[data-item-action="destroy"]');
    if (destroyAction) destroyAction.disabled = equipped;
    this.hideDestroyConfirm(false);
    source.classList.add('is-selected');
    this.itemActionsPanel.classList.remove('hidden');
    this.positionItemActions(source);
    this.itemActionsPanel.querySelector<HTMLButtonElement>('[data-item-action="equip"]')?.focus();
  }

  /**
   * Anchors the compact menu beside the clicked slot: prefer the right side
   * (6px away), fall back to the left when clipped, and clamp vertically
   * inside the viewport. The popover is a direct child of #app, so fixed
   * coordinates from getBoundingClientRect always match the layout.
   */
  private positionItemActions(source: HTMLElement): void {
    const slotRect = source.getBoundingClientRect();
    const panelRect = this.itemActionsPanel.getBoundingClientRect();
    const viewportGap = 8;
    const anchorGap = 6;
    let left = slotRect.right + anchorGap;
    if (left + panelRect.width + viewportGap > window.innerWidth) {
      left = slotRect.left - panelRect.width - anchorGap;
    }
    left = Math.min(
      Math.max(viewportGap, left),
      Math.max(viewportGap, window.innerWidth - panelRect.width - viewportGap)
    );
    let top = slotRect.top + slotRect.height / 2 - panelRect.height / 2;
    top = Math.min(
      Math.max(viewportGap, top),
      Math.max(viewportGap, window.innerHeight - panelRect.height - viewportGap)
    );
    this.itemActionsPanel.style.left = `${left}px`;
    this.itemActionsPanel.style.top = `${top}px`;
  }

  private hideItemActions(): void {
    if (this.selectedStack === null && this.itemActionsPanel.classList.contains('hidden')) return;
    this.selectedStack = null;
    this.clearSelectedSlotHighlight();
    this.itemActionsPanel.classList.add('hidden');
    this.itemActionsPanel.style.left = '';
    this.itemActionsPanel.style.top = '';
    this.hideDestroyConfirm(false);
  }

  /** A click anywhere outside the popover (or its anchor slot) closes it. */
  private outsideLobbyClick = (event: Event): void => {
    if (this.itemActionsPanel.classList.contains('hidden')) return;
    const target = event.target as HTMLElement;
    if (this.itemActionsPanel.contains(target)) return;
    if (target.closest('[data-lobby-inventory-index]')) return;
    this.hideItemActions();
  };

  private itemActionClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-close-item-actions]')) {
      this.hideItemActions();
      return;
    }
    const button = target.closest<HTMLButtonElement>('[data-item-action]');
    if (!button) return;
    const action = button.dataset.itemAction;
    if (action === 'equip') this.equipSelectedItem();
    else if (action === 'upgrade') this.upgradeSelectedItem();
    else if (action === 'destroy') this.confirmDestroySelectedItem();
  };

  private equipSelectedItem(): void {
    const selected = this.selectedStack;
    if (!selected) return;
    if (selected.location === 'equipment') {
      this.unequipSelectedItem(selected);
      return;
    }
    const stack = this.inventory.snapshot().backpack[selected.index];
    if (!stack || stack.itemId !== selected.itemId) {
      this.setLobbyStatus('O item selecionado não está mais na mochila.');
      this.hideItemActions();
      return;
    }
    const item = getInventoryItem(stack.itemId);
    if (!item || item.kind !== 'equipment' || !item.slot) {
      this.setLobbyStatus('Este item não pode ser equipado.');
      return;
    }
    const targetSlot = item.slot === 'weapon' ? 'weapon' : item.slot;
    const result = this.inventory.equip(selected.index, targetSlot as RpgEquipmentSlot);
    this.setLobbyStatus(result.kind === 'equipped'
      ? `${item.label} equipado.`
      : 'O item não é compatível com esse espaço.');
    if (result.kind === 'equipped') {
      this.hideItemActions();
      this.lobbyInventoryChanged?.();
      this.renderData();
      this.requestFrame();
    }
  }

  private unequipSelectedItem(
    selected: Extract<NonNullable<typeof this.selectedStack>, { location: 'equipment' }>
  ): void {
    const item = getInventoryItem(selected.itemId);
    const result = this.inventory.unequip(selected.slot);
    if (result.kind === 'unequipped') {
      this.setLobbyStatus(`${item?.label ?? selected.itemId} desequipado.`);
      this.hideItemActions();
      this.lobbyInventoryChanged?.();
      this.renderData();
      this.requestFrame();
      return;
    }
    this.setLobbyStatus(result.kind === 'backpack-full'
      ? 'A mochila está cheia. Libere um espaço para desequipar o item.'
      : 'Este espaço de equipamento já está vazio.');
    this.hideItemActions();
  }

  /** The upgrade system is not implemented yet; the option stays wired safely. */
  private upgradeSelectedItem(): void {
    const selected = this.selectedStack;
    if (!selected) return;
    const item = getInventoryItem(selected.itemId);
    this.setLobbyStatus(`Sistema de aprimoramento em desenvolvimento — ${item?.label ?? selected.itemId} não foi alterado.`);
    this.hideItemActions();
  }

  private confirmDestroySelectedItem(): void {
    const selected = this.selectedStack;
    if (!selected) return;
    if (selected.location !== 'backpack') return;
    const stack = this.inventory.snapshot().backpack[selected.index];
    if (!stack || stack.itemId !== selected.itemId) {
      this.setLobbyStatus('O item selecionado não está mais na mochila.');
      this.hideItemActions();
      return;
    }
    const item = getInventoryItem(stack.itemId);
    this.destroyConfirmName.textContent = `${item?.label ?? stack.itemId} (x${stack.quantity})`;
    this.destroyConfirmDialog.classList.remove('hidden');
    this.destroyConfirmDialog.querySelector<HTMLButtonElement>('[data-destroy-cancel]')?.focus();
    // The menu may grow taller with the inline confirmation: re-anchor it.
    this.itemActionsPanel.style.left = '';
    this.itemActionsPanel.style.top = '';
    const source = document.querySelector<HTMLElement>(
      `[data-lobby-inventory-index="${selected.index}"]`
    );
    if (source) this.positionItemActions(source);
  }

  private destroyConfirmClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-destroy-cancel]')) {
      this.hideDestroyConfirm();
      return;
    }
    if (target.closest('[data-destroy-confirm]')) {
      this.destroySelectedItem();
    }
  };

  private destroyConfirmKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.hideDestroyConfirm();
    }
  };

  private hideDestroyConfirm(restoreFocus = true): void {
    const wasVisible = !this.destroyConfirmDialog.classList.contains('hidden');
    this.destroyConfirmDialog.classList.add('hidden');
    if (restoreFocus && wasVisible) {
      this.itemActionsPanel.querySelector<HTMLButtonElement>('[data-item-action="destroy"]')?.focus();
    }
  }

  /** Closes the inline confirmation and menu without touching focus, used during teardown. */
  private hideDestroyConfirmSilently(): void {
    this.destroyConfirmDialog.classList.add('hidden');
    this.itemActionsPanel.classList.add('hidden');
    this.itemActionsPanel.style.left = '';
    this.itemActionsPanel.style.top = '';
    this.selectedStack = null;
    this.clearSelectedSlotHighlight();
  }

  private destroySelectedItem(): void {
    const selected = this.selectedStack;
    if (!selected) {
      this.hideDestroyConfirm(false);
      return;
    }
    if (selected.location !== 'backpack') return;
    const stack = this.inventory.snapshot().backpack[selected.index];
    if (!stack || stack.itemId !== selected.itemId) {
      this.setLobbyStatus('O item selecionado não está mais na mochila.');
      this.hideDestroyConfirm(false);
      this.hideItemActions();
      return;
    }
    const item = getInventoryItem(stack.itemId);
    const result = this.inventory.removeAt(selected.index, stack.quantity);
    if (result.kind === 'removed') {
      this.setLobbyStatus(`${item?.label ?? stack.itemId} destruído.`);
      this.lobbyInventoryChanged?.();
    } else {
      this.setLobbyStatus('Não foi possível destruir o item.');
    }
    this.hideDestroyConfirm(false);
    this.hideItemActions();
    this.renderData();
    this.requestFrame();
  }

  private itemActionKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.hideItemActions();
    }
  };

  private backpackExpansionClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-expand-backpack]');
    if (!button) return;
    if (button.dataset.expandBackpack === 'cm') {
      this.setLobbyStatus('A compra por CM está indisponível até a carteira ser integrada.');
      return;
    }
    if (button.disabled) return;
    const message = this.guildTokenBackpackExpansion?.()
      ?? 'A expansão da mochila está indisponível.';
    this.renderData();
    this.setLobbyStatus(message);
    restoreBackpackExpansionFocus(this.lobbyScreen, 'lobby-capacity');
  };

  private setLobbyStatus(message: string): void {
    document.getElementById('lobby-status')!.textContent = message;
  }

  private pointerDown = (event: PointerEvent): void => {
    this.dragging = true;
    this.lastPointerX = event.clientX;
  };

  private pointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    const delta = event.clientX - this.lastPointerX;
    this.lastPointerX = event.clientX;
    this.modelHolder.rotation.y += delta * 0.008;
    this.requestFrame();
  };

  private pointerUp = (): void => { this.dragging = false; };

  private wheel = (event: WheelEvent): void => {
    if (this.lobbyScreen.classList.contains('hidden') && this.classScreen.classList.contains('hidden')) return;
    event.preventDefault();
    this.zoom = THREE.MathUtils.clamp(this.zoom + event.deltaY * 0.002, 4.7, 8.2);
    this.requestFrame();
  };

  private previewKeyDown = (event: KeyboardEvent): void => {
    const next = adjustLobbyPreview(this.modelHolder.rotation.y, this.zoom, event.key);
    if (!next.handled) return;
    event.preventDefault();
    this.modelHolder.rotation.y = next.rotation;
    this.zoom = next.zoom;
    this.requestFrame();
  };

  private isHierarchyVisible(node: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = node;
    while (current) {
      if (!current.visible) return false;
      current = current.parent;
    }
    return true;
  }

  private resize = (): void => {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.requestFrame();
  };

  private motionPreferenceChanged = (): void => {
    this.clock.start();
    this.requestFrame();
  };

  private requestFrame = (): void => {
    if (!this.active || this.disposed || this.frameId !== 0) return;
    this.frameId = requestAnimationFrame(this.render);
  };

  private render = (): void => {
    this.frameId = 0;
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const motion = lobbyMotionPolicy(this.reducedMotionQuery.matches);
    this.mixer?.update(motion.animateIdle ? delta : 0);
    this.camera.position.set(0, 1.35, this.zoom);
    this.camera.lookAt(0, 0.875, 0);
    const preview = resolveLobbyPreviewViewport(
      this.canvas.getBoundingClientRect(),
      this.heroStage.getBoundingClientRect()
    );
    const canvasWidth = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const canvasHeight = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const previousAutoClear = this.renderer.autoClear;
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, canvasWidth, canvasHeight);
    this.renderer.autoClear = true;
    if (this.backdropTexture) {
      fitLobbyBackdropTexture(
        this.backdropTexture,
        this.backdropAspect,
        canvasWidth / canvasHeight
      );
    }
    this.renderer.render(this.backdropScene, this.camera);
    if (preview) {
      this.camera.aspect = preview.width / preview.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setViewport(preview.x, preview.y, preview.width, preview.height);
      this.renderer.setScissor(
        preview.scissorX,
        preview.scissorY,
        preview.scissorWidth,
        preview.scissorHeight
      );
      this.renderer.setScissorTest(true);
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.scene, this.camera);
    }
    this.renderer.autoClear = previousAutoClear;
    if (motion.continuousRender) this.requestFrame();
  };

  private playLobbyIdle(): void {
    const next = this.lobbyIdleAction ?? this.fallbackIdleAction;
    if (!next) return;
    next.reset().setEffectiveWeight(1).play();
  }

  public dispose(): void {
    this.active = false;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.unbind();
    this.hideDestroyConfirmSilently();
    this.itemActionsPanel.removeEventListener('click', this.itemActionClick);
    this.itemActionsPanel.removeEventListener('keydown', this.itemActionKeyDown);
    this.destroyConfirmDialog.removeEventListener('click', this.destroyConfirmClick);
    this.destroyConfirmDialog.removeEventListener('keydown', this.destroyConfirmKeyDown);
    this.unbindItemTooltip();
    this.mixer?.stopAllAction();
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    this.scene.clear();
    this.backdropScene.background = null;
    this.backdropTexture?.dispose();
    this.backdropTexture = null;
    this.presentation.leave(this.renderer);
    this.blacksmithScreen.dispose();
    this.classScreen.classList.add('hidden');
    this.lobbyScreen.classList.add('hidden');
  }
}
