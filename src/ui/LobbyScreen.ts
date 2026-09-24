import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { resolveCharacterClips } from '../characters/CharacterAnimations';
import { gameKeyForEvent } from '../core/InputManager';
import { CharacterAssetStore } from '../characters/CharacterAssetStore';
import {
  getCharacterDefinition,
  isPlayableCharacterId,
  type CharacterDefinition,
  type CharacterId,
  type PlayableCharacterId,
} from '../characters/CharacterCatalog';
import {
  prepareGuildTokenBackpackExpansion,
  type BackpackExpansionResult,
} from '../inventory/BackpackExpansion';
import type { InventorySnapshot, InventoryStore } from '../inventory/InventoryStore';
import type { PlayerProfile, RpgEquipmentSlot, InventoryStack } from '../profile/PlayerProfile';
import { getPrimaryWeaponId } from '../profile/PlayerProfile';
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
  renderItemLabel,
} from './CraftRewardsPresentation';
import { bindItemTooltip } from './ItemTooltip';
import { resolveLobbyItemActionState } from './LobbyItemActions';
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

export type LobbyRunMode = 'campaign' | 'admin-training';

export interface LobbyScreenOptions {
  readonly firstRun: boolean;
  readonly onClassConfirmed: (characterId: PlayableCharacterId) => void;
  readonly onGuildTokenBackpackExpansion: () => string;
  readonly onHotkeysChanged: () => void;
  readonly onAutoBasicAttackChanged: () => void;
  readonly onLobbyInventoryChanged?: () => void;
  readonly onBlacksmithLicensePurchase: () => BlacksmithLobbyActionResult;
  readonly onBlacksmithCraft: (recipeId: BlacksmithRecipeId) => BlacksmithLobbyActionResult;
  readonly adminTrainingEnabled?: boolean;
  readonly onRunModeSelected?: (mode: LobbyRunMode) => void;
}

export type BlacksmithLobbyActionResult = BlacksmithScreenActionResult;

type LobbyLightProfile = {
  readonly color: number;
  readonly intensity: number;
  readonly position: readonly [number, number, number];
};

type LobbyPresentationProfile = {
  readonly hemisphere: {
    readonly sky: number;
    readonly ground: number;
    readonly intensity: number;
  };
  readonly ambient: {
    readonly color: number;
    readonly intensity: number;
  };
  readonly key: LobbyLightProfile;
  readonly fill: LobbyLightProfile;
  readonly rim: LobbyLightProfile;
  readonly bounce: LobbyLightProfile & { readonly distance: number; readonly decay: number };
  readonly material: {
    readonly anisotropy: number;
    readonly envMapIntensity: number;
    readonly roughnessMax?: number;
    readonly normalScaleMultiplier?: number;
    readonly specularIntensityMin?: number;
    readonly colorMultiplier?: readonly [number, number, number];
    readonly roughnessMapFromSpecularIntensityMap?: boolean;
    readonly skipHiddenMeshes?: boolean;
  };
  readonly contactShadow: {
    readonly widthScale: number;
    readonly depthScale: number;
    readonly minWidth: number;
    readonly minDepth: number;
    readonly maxWidth: number;
    readonly maxDepth: number;
    readonly opacity: number;
    readonly y: number;
    readonly zBias: number;
  };
};

type LobbyMaterialOriginalState = {
  readonly roughness: number;
  readonly metalness: number;
  readonly envMapIntensity: number;
  readonly normalScaleX: number;
  readonly normalScaleY: number;
  readonly colorR: number;
  readonly colorG: number;
  readonly colorB: number;
  readonly roughnessMap: THREE.Texture | null;
  readonly specularIntensity?: number;
  readonly specularIntensityMap?: THREE.Texture | null;
};

const DEFAULT_LOBBY_PRESENTATION_PROFILE: LobbyPresentationProfile = {
  hemisphere: { sky: 0xe8f0ff, ground: 0x2b3545, intensity: 1.35 },
  ambient: { color: 0xffffff, intensity: 0.8 },
  key: { color: LOBBY_LIGHTING.key.color, intensity: LOBBY_LIGHTING.key.intensity, position: [-3, 5, 4] },
  fill: { color: LOBBY_LIGHTING.fill.color, intensity: LOBBY_LIGHTING.fill.intensity, position: [4, 3, 2] },
  rim: { color: LOBBY_LIGHTING.rim.color, intensity: LOBBY_LIGHTING.rim.intensity, position: [4, 3, -3] },
  bounce: {
    color: LOBBY_LIGHTING.bounce.color,
    intensity: LOBBY_LIGHTING.bounce.intensity,
    position: [0, 1.8, 3.6],
    distance: 12,
    decay: 1.6,
  },
  material: {
    anisotropy: 4,
    envMapIntensity: 1,
  },
  contactShadow: {
    widthScale: 1.02,
    depthScale: 0.96,
    minWidth: 1.05,
    minDepth: 0.75,
    maxWidth: 2.35,
    maxDepth: 1.7,
    opacity: 0.18,
    y: 0.02,
    zBias: 0.02,
  },
};

// Maga uses the same hall rig as Guerreiro. Maga_Lobby already has authored
// highlights in the face, so only that region receives a little less light.
const LOBBY_CHARACTER_PRESENTATION_PROFILES: Partial<Record<CharacterId, LobbyPresentationProfile>> = {};

/** Fraction of the shared lobby light that remains on the Mage face. */
export const MAGE_LOBBY_FACE_LIGHT_SCALE = 0.8;
const MAGE_FACE_LIGHT_TOKEN = 'lobby-mage-face-light';

const ATTRIBUTE_LABELS: Readonly<Record<string, string>> = {
  vitality: 'Vitalidade',
  attack: 'Ataque',
  defense: 'Defesa',
  agility: 'Agilidade',
  criticalAttack: 'Crítico',
  criticalDamage: 'Dano crítico',
  criticalMagic: 'Crítico mágico',
  lifeSteal: 'Roubo de vida',
  dodge: 'Esquiva',
};

/**
 * Player-facing stat line for an item. Weapon base damage is flat damage, so it
 * reads as "Dano"; "Ataque" is reserved for the attribute point that the status
 * sheet, the character overlay and the combat pipeline all share.
 */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function itemStatSummary(item: InventoryItemDefinition | undefined): string {
  if (!item) return '';
  // Weapon base damage is flat damage, not an attribute point: the sheet reads
  // it as "Dano", while "Ataque" keeps meaning the allocated attribute.
  const values = item.baseDamage ? [`Dano +${item.baseDamage}`] : [];
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

/**
 * The reference hall shows a seven-metric sheet: the six attributes that answer
 * for the build plus the life total that moves with gear. Ataque includes the
 * equipped weapon damage, so wearing a sword shows its bonus right away.
 * Crítico físico is surfaced simply as "Crítico"; the dedicated Critical Damage
 * and Life Steal readings stay on the full sheet in the character overlay. The
 * view model keeps its full nine-attribute contract for other surfaces.
 */
const LOBBY_STATUS_METRICS: readonly {
  readonly key: string;
  readonly label: string;
}[] = [
  { key: 'vitality', label: 'Vitalidade' },
  { key: 'attack', label: 'Ataque' },
  { key: 'defense', label: 'Defesa' },
  { key: 'agility', label: 'Agilidade' },
  { key: 'criticalAttack', label: 'Crítico' },
  { key: 'dodge', label: 'Esquiva' },
];

/** Keeps whole points whole and shows derived readings with one decimal. */
function formatMetricValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * One-line reading of what each point does in combat. It is the caption under
 * the number, so the player can tell a status from a decoration: "Defesa 17"
 * alone said nothing, "-30% do dano recebido" tells the whole story.
 */
function lobbyStatusHints(
  status: CurrentCharacterStatusView
): Readonly<Record<string, string>> {
  const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;
  const derived = status.derived;
  return {
    vitality: `+${Math.round(derived.maxHealthBonus)} vida`,
    attack: 'dano do golpe',
    defense: `-${percent(derived.damageReduction)} do dano`,
    agility: `+${((derived.movementSpeedMultiplier - 1) * 100).toFixed(1)}% velocidade`,
    criticalAttack: `${percent(derived.criticalAttackChance)} de chance`,
    dodge: `${percent(derived.dodgeChance)} de anular`,
  };
}

function lobbyStatusMetrics(
  status: CurrentCharacterStatusView
): readonly { readonly label: string; readonly value: string | number; readonly hint: string }[] {
  const byKey = new Map(status.attributes.map(({ key, value }) => [key as string, value]));
  const hints = lobbyStatusHints(status);
  const attributes = LOBBY_STATUS_METRICS.map(({ key, label }) => ({
    label,
    value: byKey.get(key) ?? 0,
    hint: hints[key] ?? '',
  }));
  // The attack reading already carries the equipped weapon damage, so the
  // sheet only adds the life total next to the six attributes.
  return [
    ...attributes,
    {
      label: 'Vida máxima',
      value: formatMetricValue(status.derived.maxHealth),
      hint: '100 + 3/Vitalidade',
    },
  ];
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
        ${lobbyStatusMetrics(status).map(({ label, value, hint }) => `<div><dt>${label}</dt><dd>${value}</dd><small class="lobby-current-status-hint">${hint}</small></div>`).join('')}
      </dl>
      ${status.setBonus ? `<aside class="lobby-set-bonus" aria-label="Bônus de conjunto ativo">
        <span>Conjunto completo</span>
        <strong>${status.setBonus.label}</strong>
        <p>${status.setBonus.attributes.map(({ label, value }) => `${label} +${value}`).join(' · ')}</p>
      </aside>` : ''}
    </section>`;
}

/**
 * Expansion is the 21st cell: visually identical to a bag slot, carrying a
 * plain [+]. Its cost is revealed in a floating popup rendered outside the
 * grid, so the scrolling list never clips or reflows it.
 */
export function renderLobbyBackpackExpansionControls(
  preparation: BackpackExpansionResult
): string {
  const atMaximum = preparation.kind === 'capacity-maximum';
  const label = atMaximum
    ? 'Mochila no limite de 60 espaços.'
    : 'Expandir mochila. Requer 30 Token da Guilda ou 5 CM.';
  return `
    <button class="inventory-slot backpack-expansion-add" type="button" data-expand-backpack="guild-token" aria-label="${label}" title="${label}" ${atMaximum ? 'disabled aria-disabled="true"' : ''}>
      <span class="backpack-expansion-add__plus" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </span>
    </button>`;
}

/** Cost copy shared by the expansion notification and its aria label. */
export const BACKPACK_EXPANSION_REQUIREMENT =
  'Para aumentar o inventário em +5 espaços: 30 Token da Guilda ou 5 CM.';

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
  // Up/Down used to dolly the camera. The hero is now locked at one distance
  // and only turns on the spot, so they are left unhandled.
  return { rotation, zoom, handled: false };
}

export function lobbyMotionPolicy(prefersReducedMotion: boolean): {
  animateIdle: boolean;
  continuousRender: boolean;
} {
  // O jogo eh um produto de animacao: idle do guerreiro e render continuo do
  // lobby ficam SEMPRE ligados, mesmo se o SO/navegador pedir "movimento
  // reduzido" (decisao do dono do projeto para o lobby nunca ficar congelado).
  void prefersReducedMotion;
  return {
    animateIdle: true,
    continuousRender: true,
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
  private readonly classChoiceButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-class-choice]')
  );
  private readonly startButton = document.getElementById('start-game') as HTMLButtonElement;
  private readonly adminTrainingButton = this.resolveAdminTrainingButton();
  private startNotice: HTMLElement | null = null;
  private startNoticeTimer: number | null = null;
  private readonly heroStage = document.querySelector('.lobby-hero-stage') as HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly backdropScene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  private readonly clock = new THREE.Clock();
  private modelHolder = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private lobbyIdleAction: THREE.AnimationAction | null = null;
  private fallbackIdleAction: THREE.AnimationAction | null = null;
  private selectedCharacterId: CharacterId;
  private frameId = 0;
  private active = false;
  private dragging = false;
  private lastPointerX = 0;
  // The lobby reference keeps the full silhouette above the physical dais.
  // A slightly wider default framing leaves the feet and CTA breathing room.
  private zoom = 5.3;
  private resolver: (() => void) | null = null;
  private classConfirm: ((characterId: PlayableCharacterId) => void) | null = null;
  private runModeSelected: ((mode: LobbyRunMode) => void) | null = null;
  private adminModeSelected = false;
  private guildTokenBackpackExpansion: (() => string) | null = null;
  private hotkeysChanged: (() => void) | null = null;
  private autoBasicAttackChanged: (() => void) | null = null;
  private blacksmithLicensePurchase: (() => BlacksmithLobbyActionResult) | null = null;
  private blacksmithCraft: ((recipeId: BlacksmithRecipeId) => BlacksmithLobbyActionResult) | null = null;
  private readonly blacksmithScreen: BlacksmithScreen;
  private pendingHotkeyAction: PlayerHotkeyAction | null = null;
  private hotkeyMessage = '';
  private noticeTimer: number | null = null;
  private inventorySearchQuery = '';
  private inventoryFilter: 'all' | 'equipment' | 'material' = 'all';
  private backdropTexture: THREE.Texture | null = null;
  private backdropAspect = 1.5;
  private disposed = false;
  private readonly reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly fallbackBackground = new THREE.Color(0x111827);
  private lobbyLights: {
    hemisphere: THREE.HemisphereLight;
    ambient: THREE.AmbientLight;
    key: THREE.DirectionalLight;
    fill: THREE.DirectionalLight;
    rim: THREE.DirectionalLight;
    bounce: THREE.PointLight;
  } | null = null;
  private lobbyEnvironmentTarget: THREE.WebGLRenderTarget | null = null;
  private lobbyPmremGenerator: THREE.PMREMGenerator | null = null;
  private contactShadow: THREE.Mesh | null = null;
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

  private resolveAdminTrainingButton(): HTMLButtonElement {
    let button = document.getElementById('start-admin-training') as HTMLButtonElement | null;
    if (button) return button;
    button = document.createElement('button');
    button.id = 'start-admin-training';
    button.type = 'button';
    button.className = 'admin-training-start admin-mode-toggle hidden';
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = '<small>MODO ADM</small><strong>Desligado</strong><span>Teste sem monstros</span>';
    this.startButton.insertAdjacentElement('afterend', button);
    return button;
  }

  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly canvas: HTMLCanvasElement,
    private readonly assets: CharacterAssetStore,
    private readonly profile: PlayerProfile,
    private readonly inventory: InventoryStore
  ) {
    this.selectedCharacterId = this.profile.selectedClass;
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
    this.runModeSelected = options.onRunModeSelected ?? null;
    this.guildTokenBackpackExpansion = options.onGuildTokenBackpackExpansion;
    this.hotkeysChanged = options.onHotkeysChanged;
    this.autoBasicAttackChanged = options.onAutoBasicAttackChanged;
    this.lobbyInventoryChanged = options.onLobbyInventoryChanged ?? null;
    this.blacksmithLicensePurchase = options.onBlacksmithLicensePurchase;
    this.blacksmithCraft = options.onBlacksmithCraft;
    this.blacksmithScreen.hide();
    this.setStartActionsDisabled(false);
    this.adminModeSelected = false;
    this.adminTrainingButton.classList.toggle('hidden', options.adminTrainingEnabled !== true);
    this.adminTrainingButton.disabled = options.adminTrainingEnabled !== true;
    this.syncAdminModeToggle();
    this.hideItemActions();
    this.mountLobbyCharacter(this.profile.selectedClass);
    this.renderData();
    this.classScreen.classList.toggle('hidden', !options.firstRun);
    this.lobbyScreen.classList.toggle('hidden', options.firstRun);
    this.bind();
    this.resize();
    this.clock.start();
    this.requestFrame();
    const initialFocus = options.firstRun
      ? this.classChoiceButtons.find((button) => !button.disabled)
      : this.startButton;
    initialFocus?.focus();
    return new Promise<void>((resolve) => { this.resolver = resolve; });
  }

  private setupScene(): void {
    this.scene.background = null;
    this.backdropScene.background = this.fallbackBackground;
    this.scene.fog = null;
    this.setupLobbyEnvironment();
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

    const hemisphere = new THREE.HemisphereLight(0xe8f0ff, 0x2b3545, 1.35);
    this.scene.add(hemisphere);
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambient);
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
    this.lobbyLights = { hemisphere, ambient, key, fill, rim, bounce };

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

    this.contactShadow = this.createContactShadow();
    this.scene.add(this.contactShadow);

    this.modelHolder.rotation.y = 0;
    this.modelHolder.position.set(0, 0, 0);
    this.scene.add(this.modelHolder);
    this.syncClassChoiceButtons();
    this.mountLobbyCharacter(this.selectedCharacterId);
  }

  private setupLobbyEnvironment(): void {
    try {
      const generator = new THREE.PMREMGenerator(this.renderer);
      const studio = new RoomEnvironment();
      const target = generator.fromScene(studio, 0.035);
      studio.dispose();
      this.lobbyPmremGenerator = generator;
      this.lobbyEnvironmentTarget = target;
      this.scene.environment = target.texture;
      // Keep the authored 2D lobby artwork; the PMREM is for PBR lighting only.
      this.scene.background = null;
    } catch {
      this.scene.environment = null;
      this.lobbyEnvironmentTarget?.dispose();
      this.lobbyPmremGenerator?.dispose();
      this.lobbyEnvironmentTarget = null;
      this.lobbyPmremGenerator = null;
    }
  }

  private createContactShadow(): THREE.Mesh {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x050810) },
        uOpacity: { value: 0.18 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          vec2 centered = vUv - 0.5;
          float wide = 1.0 - smoothstep(0.16, 0.58, length(centered * vec2(1.0, 1.65)));
          float core = 1.0 - smoothstep(0.04, 0.28, length(centered * vec2(1.35, 2.25)));
          float alpha = (wide * 0.58 + core * 0.28) * uOpacity;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    shadow.name = 'lobby-contact-shadow';
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    shadow.renderOrder = 1;
    return shadow;
  }

  private resolveAvailableCharacter(preferred: CharacterId): CharacterId | null {
    if (this.assets.has(preferred, 'lobby')) return preferred;
    for (const button of this.classChoiceButtons) {
      const candidate = button.dataset.classChoice;
      if (isPlayableCharacterId(candidate) && this.assets.has(candidate, 'lobby')) return candidate;
    }
    return null;
  }

  private lobbyPresentationProfile(characterId: CharacterId): LobbyPresentationProfile {
    return LOBBY_CHARACTER_PRESENTATION_PROFILES[characterId] ?? DEFAULT_LOBBY_PRESENTATION_PROFILE;
  }

  private syncLobbyLighting(characterId: CharacterId): void {
    if (!this.lobbyLights) return;
    const profile = this.lobbyPresentationProfile(characterId);
    const { hemisphere, ambient, key, fill, rim, bounce } = this.lobbyLights;
    hemisphere.color.setHex(profile.hemisphere.sky);
    hemisphere.groundColor.setHex(profile.hemisphere.ground);
    hemisphere.intensity = profile.hemisphere.intensity;
    ambient.color.setHex(profile.ambient.color);
    ambient.intensity = profile.ambient.intensity;
    key.color.setHex(profile.key.color);
    key.intensity = profile.key.intensity;
    key.position.fromArray(profile.key.position);
    fill.color.setHex(profile.fill.color);
    fill.intensity = profile.fill.intensity;
    fill.position.fromArray(profile.fill.position);
    rim.color.setHex(profile.rim.color);
    rim.intensity = profile.rim.intensity;
    rim.position.fromArray(profile.rim.position);
    bounce.color.setHex(profile.bounce.color);
    bounce.intensity = profile.bounce.intensity;
    bounce.distance = profile.bounce.distance;
    bounce.decay = profile.bounce.decay;
    bounce.position.fromArray(profile.bounce.position);
  }

  private syncClassChoiceButtons(): void {
    this.classChoiceButtons.forEach((button) => {
      const id = button.dataset.classChoice;
      const available = isPlayableCharacterId(id) && this.assets.has(id, 'lobby');
      button.disabled = !available;
      button.setAttribute('aria-disabled', String(!available));
      button.classList.toggle('is-selected', available && id === this.selectedCharacterId);
      button.setAttribute('aria-pressed', String(available && id === this.selectedCharacterId));
      const status = button.querySelector<HTMLElement>('[data-class-choice-status]');
      if (status) status.textContent = available ? 'Disponível' : 'Modelo indisponível';
    });
  }

  private updateLobbyClassCopy(definition: CharacterDefinition): void {
    const name = definition.name;
    const role = definition.classRole ?? 'Classe selecionada';
    const weapon = definition.initialWeaponLabel ?? 'Arma inicial';
    document.querySelectorAll<HTMLElement>('[data-lobby-class-name], [data-lobby-class-panel-name]')
      .forEach((element) => { element.textContent = name; });
    document.querySelectorAll<HTMLElement>('[data-lobby-class-role]')
      .forEach((element) => { element.textContent = role; });
    document.querySelectorAll<HTMLElement>('[data-lobby-class-weapon]')
      .forEach((element) => { element.textContent = weapon; });
    this.heroStage.setAttribute(
      'aria-label',
      `Prévia 3D da classe ${name}. Arraste com o mouse para girar.`
    );
    const statusPanel = document.getElementById('lobby-status-panel');
    statusPanel?.setAttribute('aria-label', `Status atual da classe ${name}`);
    const lobbyStatus = document.getElementById('lobby-status');
    if (lobbyStatus) {
      lobbyStatus.innerHTML = `${escapeHtml(weapon)} pronto<br><small>5 skills disponíveis</small>`;
    }
  }

  private mountLobbyCharacter(id: CharacterId): void {
    const characterId = this.resolveAvailableCharacter(id);
    if (!characterId) return;

    this.selectedCharacterId = characterId;
    if (isPlayableCharacterId(characterId)) this.profile.selectedClass = characterId;
    this.syncLobbyLighting(characterId);
    const definition = getCharacterDefinition(characterId);
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.lobbyIdleAction = null;
    this.fallbackIdleAction = null;
    this.modelHolder.clear();

    const model = this.assets.createModel(characterId, 'lobby');
    prepareLobbyModel(model);
    this.configureLobbyMaterials(model, characterId);
    model.scale.setScalar(definition.previewScale);

    const nativeClips = this.assets.getAnimations(characterId, 'lobby');
    const lobbyIdle = nativeClips.find(
      (candidate) => candidate.name === resolveLobbyIdlePhase(0)
    );
    const lobbyIdleNames = new Set([
      definition.clipMap.idle,
      'idle',
      ...(definition.clipAliases?.idle ?? []),
    ].filter((name): name is string => Boolean(name)));
    // Maga_Lobby's only clip is the lobby animation: it kept the `look_around`
    // motion but is exported under the generic Mixamo name. Never fall back
    // to wait.
    const lobbyIdleFallback = characterId === 'mage'
      ? nativeClips.find((clip) => clip.name === 'look_around')
        ?? nativeClips.find((clip) => clip.name === 'mixamo.com')
      : nativeClips.find((clip) => lobbyIdleNames.has(clip.name));
    const resolvedLobbyClips = resolveCharacterClips(characterId, this.lobbyAnimationSource());
    // Same rotation policy as the Guerreiro: the preview group is the only thing
    // that turns. Class clips used in the lobby must be in-place so a translated
    // Mixamo root (notably the Maga idle) cannot make the body orbit the pivot.
    const idle = resolvedLobbyClips.idle ?? lobbyIdleFallback;

    this.applyLobbyReferencePose(model, lobbyIdle ?? idle);
    model.updateMatrixWorld(true);

    const bounds = new THREE.Box3();
    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (!this.isHierarchyVisible(mesh)) return;
      this.expandLobbyMeshBounds(bounds, mesh);
    });
    // The holder is the spin pivot: it carries the per-character depth framing
    // (previewZOffset) so the model itself always stays centered exactly on
    // the rotation axis. Offsetting the model inside the holder instead would
    // make the hero orbit the pivot instead of turning in place like Guerreiro.
    const previewZOffset = definition.previewZOffset ?? 0;
    this.modelHolder.position.set(0, 0, previewZOffset);
    if (!bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      // Guerreiro policy for every lobby class: the visible model bounds
      // center sits exactly on the holder rotation axis, with the feet
      // grounded. No class-specific hip/socket pivot here.
      model.position.set(
        -center.x,
        -bounds.min.y + (definition.previewYOffset ?? 0),
        -center.z
      );
      this.updateContactShadow(characterId, bounds, previewZOffset);
    } else {
      model.position.set(0, definition.previewYOffset ?? 0, 0);
      this.updateContactShadow(characterId, null, previewZOffset);
    }

    this.modelHolder.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    if (lobbyIdle) {
      const action = this.mixer.clipAction(lobbyIdle);
      action.setLoop(THREE.LoopRepeat, Infinity);
      this.lobbyIdleAction = action;
    }
    if (idle) {
      this.fallbackIdleAction = this.mixer.clipAction(idle);
      this.fallbackIdleAction.setLoop(THREE.LoopRepeat, Infinity);
    }
    this.updateLobbyClassCopy(definition);
    this.syncClassChoiceButtons();
    this.playLobbyIdle();
    this.requestFrame();
  }

  private configureLobbyMaterials(model: THREE.Object3D, characterId: CharacterId): void {
    const profile = this.lobbyPresentationProfile(characterId).material;
    const maxAnisotropy = this.renderer.capabilities?.getMaxAnisotropy?.() ?? 1;
    const anisotropy = Math.max(1, Math.min(maxAnisotropy, profile.anisotropy));
    const tuneTexture = (texture?: THREE.Texture | null): void => {
      if (!texture) return;
      texture.anisotropy = Math.max(texture.anisotropy, anisotropy);
      texture.needsUpdate = true;
    };

    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (profile.skipHiddenMeshes && !this.isHierarchyVisible(mesh)) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return;
        this.applyLobbyMaterialProfile(material, profile);
        if (characterId === 'mage') this.reduceMageFaceLight(mesh, material);
        tuneTexture(material.map);
        tuneTexture(material.normalMap);
        tuneTexture(material.roughnessMap);
        tuneTexture(material.metalnessMap);
        tuneTexture(material.aoMap);
        tuneTexture(material.emissiveMap);
        const physical = material as THREE.MeshPhysicalMaterial;
        tuneTexture(physical.specularIntensityMap);
        tuneTexture(physical.specularColorMap);
        material.needsUpdate = true;
      });
    });
  }

  /**
   * Maga shares the Guerreiro light rig. Her authored face is already bright,
   * so head/neck vertices keep a little less of that same light.
   */
  private reduceMageFaceLight(mesh: THREE.Mesh, material: THREE.MeshStandardMaterial): void {
    const skinned = mesh as THREE.SkinnedMesh;
    if (!skinned.isSkinnedMesh || !skinned.skeleton?.bones?.length) return;
    const bones = skinned.skeleton.bones;
    const head = bones.findIndex((bone) => /(^|:)head$/i.test(bone.name));
    const neck = bones.findIndex((bone) => /(^|:)neck$/i.test(bone.name));
    if (head < 0 && neck < 0) return;

    const faceBones = new THREE.Vector2(head, neck);
    material.userData.mageFaceBones = faceBones;
    const previousCompile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      if (shader.vertexShader.includes(MAGE_FACE_LIGHT_TOKEN)) return;
      const bonesUniform = material.userData.mageFaceBones as THREE.Vector2;
      shader.uniforms.uMageFaceBones = { value: bonesUniform };
      shader.uniforms.uMageFaceLight = { value: MAGE_LOBBY_FACE_LIGHT_SCALE };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>\n/* ${MAGE_FACE_LIGHT_TOKEN} */\nvarying float vMageFaceWeight;\nuniform vec2 uMageFaceBones;`
        )
        .replace(
          '#include <skinning_vertex>',
          `#include <skinning_vertex>\n/* ${MAGE_FACE_LIGHT_TOKEN} */\n#ifdef USE_SKINNING\n  float mageFaceWeight = 0.0;\n  if (uMageFaceBones.x >= 0.0) {\n    if (abs(skinIndex.x - uMageFaceBones.x) < 0.5) mageFaceWeight += skinWeight.x;\n    if (abs(skinIndex.y - uMageFaceBones.x) < 0.5) mageFaceWeight += skinWeight.y;\n    if (abs(skinIndex.z - uMageFaceBones.x) < 0.5) mageFaceWeight += skinWeight.z;\n    if (abs(skinIndex.w - uMageFaceBones.x) < 0.5) mageFaceWeight += skinWeight.w;\n  }\n  if (uMageFaceBones.y >= 0.0) {\n    float mageNeckWeight = 0.0;\n    if (abs(skinIndex.x - uMageFaceBones.y) < 0.5) mageNeckWeight += skinWeight.x;\n    if (abs(skinIndex.y - uMageFaceBones.y) < 0.5) mageNeckWeight += skinWeight.y;\n    if (abs(skinIndex.z - uMageFaceBones.y) < 0.5) mageNeckWeight += skinWeight.z;\n    if (abs(skinIndex.w - uMageFaceBones.y) < 0.5) mageNeckWeight += skinWeight.w;\n    mageFaceWeight += mageNeckWeight * 0.4;\n  }\n  vMageFaceWeight = clamp(mageFaceWeight, 0.0, 1.0);\n#else\n  vMageFaceWeight = 0.0;\n#endif`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\n/* ${MAGE_FACE_LIGHT_TOKEN} */\nvarying float vMageFaceWeight;\nuniform float uMageFaceLight;`
        )
        .replace(
          '#include <opaque_fragment>',
          `/* ${MAGE_FACE_LIGHT_TOKEN} */\noutgoingLight *= mix(1.0, uMageFaceLight, smoothstep(0.12, 0.62, vMageFaceWeight));\n#include <opaque_fragment>`
        );
    };
    const previousKey = material.customProgramCacheKey;
    material.customProgramCacheKey = () => `${previousKey.call(material)}|${MAGE_FACE_LIGHT_TOKEN}`;
    material.needsUpdate = true;
  }

  private applyLobbyMaterialProfile(
    material: THREE.MeshStandardMaterial,
    profile: LobbyPresentationProfile['material']
  ): void {
    const original = this.getLobbyMaterialOriginalState(material);
    material.envMapIntensity = profile.envMapIntensity;
    material.roughness = profile.roughnessMax === undefined
      ? original.roughness
      : Math.min(original.roughness, profile.roughnessMax);
    material.metalness = original.metalness;

    if (profile.colorMultiplier) {
      material.color.setRGB(
        original.colorR * profile.colorMultiplier[0],
        original.colorG * profile.colorMultiplier[1],
        original.colorB * profile.colorMultiplier[2]
      );
    } else {
      material.color.setRGB(original.colorR, original.colorG, original.colorB);
    }

    if (material.normalMap && material.normalScale) {
      const multiplier = profile.normalScaleMultiplier ?? 1;
      material.normalScale.set(
        original.normalScaleX * multiplier,
        original.normalScaleY * multiplier
      );
    }

    const physical = material instanceof THREE.MeshPhysicalMaterial ? material : null;
    if (physical && original.specularIntensity !== undefined) {
      physical.specularIntensity = profile.specularIntensityMin === undefined
        ? original.specularIntensity
        : Math.max(original.specularIntensity, profile.specularIntensityMin);
      physical.specularIntensityMap = original.specularIntensityMap ?? null;
    }

    material.roughnessMap = profile.roughnessMapFromSpecularIntensityMap
      ? original.roughnessMap ?? original.specularIntensityMap ?? null
      : original.roughnessMap;
    if (material.roughnessMap) material.roughnessMap.needsUpdate = true;
  }

  private getLobbyMaterialOriginalState(material: THREE.MeshStandardMaterial): LobbyMaterialOriginalState {
    const existing = material.userData.lobbyOriginalMaterialState as LobbyMaterialOriginalState | undefined;
    if (existing) return existing;
    const physical = material instanceof THREE.MeshPhysicalMaterial ? material : null;
    const captured: LobbyMaterialOriginalState = {
      roughness: material.roughness,
      metalness: material.metalness,
      envMapIntensity: material.envMapIntensity,
      normalScaleX: material.normalScale?.x ?? 1,
      normalScaleY: material.normalScale?.y ?? 1,
      colorR: material.color.r,
      colorG: material.color.g,
      colorB: material.color.b,
      roughnessMap: material.roughnessMap ?? null,
      specularIntensity: physical?.specularIntensity,
      specularIntensityMap: physical?.specularIntensityMap ?? null,
    };
    material.userData.lobbyOriginalMaterialState = captured;
    return captured;
  }

  private updateContactShadow(characterId: CharacterId, bounds: THREE.Box3 | null, zOffset: number): void {
    if (!this.contactShadow) return;
    const profile = this.lobbyPresentationProfile(characterId).contactShadow;
    const size = bounds?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1.2, 1, 0.7);
    const width = THREE.MathUtils.clamp(size.x * profile.widthScale, profile.minWidth, profile.maxWidth);
    const depth = THREE.MathUtils.clamp(size.z * profile.depthScale, profile.minDepth, profile.maxDepth);
    this.contactShadow.position.set(0, profile.y, zOffset + profile.zBias);
    this.contactShadow.scale.set(width, depth, 1);
    const material = this.contactShadow.material as THREE.ShaderMaterial;
    material.uniforms.uOpacity.value = profile.opacity;
  }

  private applyLobbyReferencePose(model: THREE.Object3D, clip: THREE.AnimationClip | undefined): void {
    if (!clip) return;
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(clip);
    action.reset().setEffectiveWeight(1).play();
    mixer.setTime(0);
    model.updateMatrixWorld(true);
  }

  private expandLobbyMeshBounds(bounds: THREE.Box3, mesh: THREE.Mesh): void {
    mesh.updateMatrixWorld(true);
    const skinnedMesh = mesh as THREE.SkinnedMesh;
    if (skinnedMesh.isSkinnedMesh && mesh.geometry?.getAttribute('position')) {
      this.expandLobbySkinnedMeshBounds(bounds, skinnedMesh);
      return;
    }
    bounds.expandByObject(mesh);
  }

  private expandLobbySkinnedMeshBounds(bounds: THREE.Box3, mesh: THREE.SkinnedMesh): void {
    const position = mesh.geometry.getAttribute('position');
    if (!position) return;
    mesh.skeleton.update();
    const vertex = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index);
      mesh.applyBoneTransform(index, vertex);
      vertex.applyMatrix4(mesh.matrixWorld);
      bounds.expandByPoint(vertex);
    }
  }

  private lobbyAnimationSource() {
    return {
      getAnimations: (id: CharacterId) => this.assets.getAnimations(id, 'lobby'),
      getBoneNames: (id: CharacterId) => this.assets.getBoneNames(id, 'lobby'),
      getBoneRestRotations: (id: CharacterId) => this.assets.getBoneRestRotations(id, 'lobby'),
      getBoneRestTranslations: (id: CharacterId) => this.lobbyRestTranslations(id),
    };
  }

  private lobbyRestTranslations(characterId: CharacterId): ReadonlyMap<string, THREE.Vector3> {
    if (characterId !== 'mage') return this.assets.getBoneRestTranslations(characterId, 'lobby');
    // The Mage lobby must preserve the authored Maga_Lobby.glb skeleton/face quality.
    // Returning no rest override makes makeClipInPlace freeze the root at the
    // first authored idle frame instead of mixing rest-pose axes into the clip.
    // The posed skinned bounds above then centers that preserved pose for the
    // same holder rotation used by Guerreiro.
    return new Map<string, THREE.Vector3>();
  }

  private renderData(): void {
    const inventory = this.inventory.snapshot();
    const view = buildRpgUiViewModel(this.profile, inventory);
    const equipmentMarkup = view.equipment.map(({ slot, label, item }) => item
      ? `<button class="equipment-slot is-equipped" type="button" data-lobby-equipped-slot="${slot}" data-rarity="${item.rarity ?? 'common'}" aria-label="${label}: ${item.label}. Abrir ações do item.">
          ${renderEquipmentSlotContent(slot, item, this.profile.selectedClass)}
        </button>`
      : `<div class="equipment-slot" data-equipment-slot="${slot}" aria-label="${label}: Vazio">
          ${renderEquipmentSlotContent(slot, null, this.profile.selectedClass)}
        </div>`).join('');
    document.getElementById('lobby-equipment-slots')!.innerHTML = equipmentMarkup;
    document.getElementById('lobby-current-status')!.innerHTML = renderLobbyCurrentStatus(view.currentStatus);
    document.getElementById('lobby-capacity')!.textContent = `${view.backpack.filter(({ item }) => item).length} / ${view.backpack.length}`;
    // The [+] is appended as the final grid cell; the header slot stays empty.
    document.getElementById('lobby-backpack-actions')!.innerHTML = '';
    document.getElementById('lobby-backpack')!.innerHTML = renderLobbyBackpackContents(
      this.profile,
      inventory
    ) + renderLobbyBackpackExpansionControls(
      prepareGuildTokenBackpackExpansion(this.profile, inventory)
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
    this.syncStartButtonWeaponState();
  }

  /**
   * "Iniciar partida" stays locked until the hero has a weapon equipped.
   * The button stays clickable so the click can explain why (center notice).
   */
  private syncStartButtonWeaponState(): void {
    const armed = Boolean(getPrimaryWeaponId(this.inventory.snapshot().equipment));
    this.startButton.classList.toggle('is-weapon-locked', !armed);
    this.startButton.setAttribute('aria-disabled', String(!armed));
    if (armed) this.hideStartWeaponNotice();
  }

  private showStartWeaponNotice(): void {
    if (!this.startNotice) {
      const notice = document.createElement('div');
      notice.className = 'lobby-start-notice hidden';
      notice.setAttribute('role', 'alert');
      notice.setAttribute('aria-live', 'assertive');
      this.lobbyScreen.append(notice);
      this.startNotice = notice;
    }
    this.startNotice.textContent = 'Equipe sua arma antes de iniciar a partida.';
    this.startNotice.classList.remove('hidden');
    if (this.startNoticeTimer !== null) window.clearTimeout(this.startNoticeTimer);
    this.startNoticeTimer = window.setTimeout(() => this.hideStartWeaponNotice(), 4000);
  }

  private hideStartWeaponNotice(): void {
    if (this.startNoticeTimer !== null) {
      window.clearTimeout(this.startNoticeTimer);
      this.startNoticeTimer = null;
    }
    this.startNotice?.classList.add('hidden');
  }

  private bind(): void {
    this.classChoiceButtons.forEach((button) => button.addEventListener('click', this.confirmClass));
    this.startButton.addEventListener('click', this.startGame);
    this.adminTrainingButton.addEventListener('click', this.toggleAdminMode);
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
    this.classChoiceButtons.forEach((button) => button.removeEventListener('click', this.confirmClass));
    this.startButton.removeEventListener('click', this.startGame);
    this.adminTrainingButton.removeEventListener('click', this.toggleAdminMode);
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

  private confirmClass = (event: Event): void => {
    const button = event.currentTarget as HTMLButtonElement | null;
    const rawId = button?.dataset.classChoice
      ?? (button?.id === 'select-warrior' ? 'paladin' : undefined);
    if (!isPlayableCharacterId(rawId) || !this.assets.has(rawId)) return;
    this.profile.selectedClass = rawId;
    this.mountLobbyCharacter(rawId);
    this.classConfirm?.(rawId);
    // The starter weapon is swapped with the class (sword for Guerreiro, cajado
    // for Maga), so the equipment and backpack grids need a fresh render.
    this.renderData();
    this.classScreen.classList.add('hidden');
    this.lobbyScreen.classList.remove('hidden');
    this.requestFrame();
    this.startButton.focus();
  };

  private startGame = (): void => {
    // Iniciar partida exige arma equipada: sem arma, avisa no centro da tela
    // e o botão só é liberado depois de equipar (syncStartButtonWeaponState).
    if (!getPrimaryWeaponId(this.inventory.snapshot().equipment)) {
      this.showStartWeaponNotice();
      return;
    }
    const adminModeActive = this.adminModeSelected
      && !this.adminTrainingButton.classList.contains('hidden')
      && !this.adminTrainingButton.disabled;
    this.finishLobby(adminModeActive ? 'admin-training' : 'campaign');
  };

  private toggleAdminMode = (): void => {
    if (this.adminTrainingButton.disabled || this.adminTrainingButton.classList.contains('hidden')) return;
    this.adminModeSelected = !this.adminModeSelected;
    this.syncAdminModeToggle();
  };

  private syncAdminModeToggle(): void {
    const enabled = this.adminModeSelected
      && !this.adminTrainingButton.classList.contains('hidden');
    this.adminTrainingButton.classList.add('admin-mode-toggle');
    this.adminTrainingButton.setAttribute('aria-pressed', String(enabled));
    this.adminTrainingButton.dataset.adminMode = enabled ? 'on' : 'off';
    this.adminTrainingButton.title = enabled
      ? 'Modo ADM ligado: Iniciar partida abre teste sem monstros com skills livres.'
      : 'Modo ADM desligado: Iniciar partida abre a masmorra normal com monstros e waves.';
    this.adminTrainingButton.innerHTML = enabled
      ? '<small>MODO ADM</small><strong>Ligado</strong><span>Teste sem monstros</span>'
      : '<small>MODO ADM</small><strong>Desligado</strong><span>Partida normal</span>';
  }

  private finishLobby(mode: LobbyRunMode): void {
    const resolve = this.resolver;
    this.resolver = null;
    this.runModeSelected?.(mode);
    this.dispose();
    resolve?.();
  }

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

  private setStartActionsDisabled(disabled: boolean): void {
    this.startButton.disabled = disabled;
    if (!this.adminTrainingButton.classList.contains('hidden')) {
      this.adminTrainingButton.disabled = disabled;
    }
  }

  private openBlacksmith(button: HTMLButtonElement): void {
    this.setStartActionsDisabled(true);
    this.lobbyScreen.classList.add('hidden');
    this.lobbyScreen.querySelectorAll<HTMLButtonElement>('[data-lobby-tab]').forEach((candidate) => {
      candidate.setAttribute('aria-pressed', String(candidate === button));
    });
    this.blacksmithScreen.show();
  }

  private returnFromBlacksmith(): void {
    this.setStartActionsDisabled(false);
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
    this.itemActionsTitle.innerHTML = item ? renderItemLabel(item.label) : escapeHtml(selection.itemId);
    this.itemActionsState.textContent = equipped ? 'Equipado' : 'Na mochila';
    this.itemActionsArt.innerHTML = item ? renderInventorySlotContent(item, 1) : '';
    const description = item?.description?.trim() ?? '';
    this.itemActionsDescription.textContent = description;
    const stats = itemStatSummary(item);
    this.itemActionsStat.textContent = stats;
    this.itemActionsStat.hidden = !stats;
    // Legacy materials carry neither lore nor attributes: the bordered details
    // box would otherwise show up as an empty frame above the actions.
    const detailsHost = this.itemActionsPanel.querySelector<HTMLElement>('.lobby-item-actions__details');
    if (detailsHost) detailsHost.hidden = description.length === 0 && stats.length === 0;
    /*
     * The menu is filtered by item kind: gear offers equip/unequip and
     * upgrade, materials and consumables offer destruction only. Hidden
     * actions must not keep their grid row or receive focus.
     */
    const actions = resolveLobbyItemActionState(item?.kind, selection.location);
    const equipAction = this.itemActionsPanel.querySelector<HTMLButtonElement>('[data-item-action="equip"]');
    if (equipAction) {
      equipAction.hidden = !actions.equipVisible;
      if (actions.equipLabel) equipAction.textContent = actions.equipLabel;
      equipAction.classList.toggle('is-unequip', actions.equipLabel === 'Desequipar');
    }
    const upgradeAction = this.itemActionsPanel.querySelector<HTMLButtonElement>('[data-item-action="upgrade"]');
    if (upgradeAction) upgradeAction.hidden = !actions.upgradeVisible;
    const destroyAction = this.itemActionsPanel.querySelector<HTMLButtonElement>('[data-item-action="destroy"]');
    if (destroyAction) {
      destroyAction.hidden = !actions.destroyVisible;
      destroyAction.disabled = actions.destroyDisabled;
    }
    this.hideDestroyConfirm(false);
    source.classList.add('is-selected');
    this.itemActionsPanel.classList.remove('hidden');
    this.positionItemActions(source);
    this.itemActionsPanel
      .querySelector<HTMLButtonElement>('[data-item-action]:not([hidden])')
      ?.focus();
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
    if (button.disabled) {
      this.showExpansionNotice(button, 'Mochila já está no limite de 60 espaços.');
      return;
    }
    // Always tell the player what expansion costs, whether or not it succeeds.
    const message = this.guildTokenBackpackExpansion?.()
      ?? 'A expansão da mochila está indisponível.';
    this.renderData();
    this.setLobbyStatus(message);
    // renderData() rebuilt the grid, so anchor to the freshly rendered button.
    const anchor = this.lobbyScreen?.querySelector<HTMLElement>('[data-expand-backpack]') ?? button;
    this.showExpansionNotice(anchor, message);
    restoreBackpackExpansionFocus(this.lobbyScreen, 'lobby-capacity');
  };

  /**
   * Floating cost popup. It is appended to the lobby root (not the grid) and
   * positioned against the button's viewport rect, so scrolling or clipping
   * inside the bag never hides it.
   */
  private showExpansionNotice(anchor: HTMLElement, detail: string): void {
    const host = this.lobbyScreen ?? document.body;
    let popup = host.querySelector<HTMLElement>('[data-expansion-notice]');
    if (!popup) {
      popup = document.createElement('div');
      popup.className = 'backpack-expansion-popup';
      popup.setAttribute('data-expansion-notice', '');
      popup.setAttribute('role', 'status');
      popup.setAttribute('aria-live', 'polite');
      host.appendChild(popup);
    }
    popup.innerHTML = `
      <strong>Aumentar inventário</strong>
      <span>+5 espaços por 30 Token da Guilda ou 5 CM</span>
      <small>${detail}</small>`;
    popup.classList.remove('hidden');

    const rect = anchor.getBoundingClientRect();
    const box = popup.getBoundingClientRect();
    // Open to the left of the slot, nudged back inside the viewport if needed.
    const left = Math.max(8, rect.left - box.width - 12);
    const top = Math.min(
      Math.max(8, rect.top + rect.height / 2 - box.height / 2),
      Math.max(8, window.innerHeight - box.height - 8)
    );
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => {
      popup?.classList.add('hidden');
      this.noticeTimer = null;
    }, 5000);
  }

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

  /**
   * The wheel is swallowed on the stage so the page behind cannot scroll,
   * but it no longer changes the camera distance: the hero holds one framing
   * and only spins in place.
   */
  private wheel = (event: WheelEvent): void => {
    if (this.lobbyScreen.classList.contains('hidden') && this.classScreen.classList.contains('hidden')) return;
    event.preventDefault();
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
    if (this.noticeTimer !== null) {
      window.clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
    if (this.startNoticeTimer !== null) {
      window.clearTimeout(this.startNoticeTimer);
      this.startNoticeTimer = null;
    }
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
    this.scene.environment = null;
    this.scene.clear();
    this.contactShadow?.geometry.dispose();
    (this.contactShadow?.material as THREE.Material | undefined)?.dispose();
    this.contactShadow = null;
    this.lobbyEnvironmentTarget?.dispose();
    this.lobbyEnvironmentTarget = null;
    this.lobbyPmremGenerator?.dispose();
    this.lobbyPmremGenerator = null;
    this.backdropScene.background = null;
    this.backdropTexture?.dispose();
    this.backdropTexture = null;
    this.presentation.leave(this.renderer);
    this.blacksmithScreen.dispose();
    this.classScreen.classList.add('hidden');
    this.lobbyScreen.classList.add('hidden');
  }
}
