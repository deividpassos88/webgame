import { getInventoryItem, isCraftMaterial } from '../inventory/InventoryCatalog';
import { prepareGuildTokenBackpackExpansion } from '../inventory/BackpackExpansion';
import type { InventorySnapshot, InventoryStore } from '../inventory/InventoryStore';
import {
  allocateAttributePoint,
  type InventoryStack,
  type PlayerProfile,
  type RpgEquipmentSlot,
} from '../profile/PlayerProfile';
import {
  ATTRIBUTE_KEYS,
  attributeAllocationAllowance,
  deriveCharacterStats,
  getAttributeAllocationCap,
  type CharacterAttributeKey,
} from '../profile/CharacterAttributes';
import { experienceProgressFor } from '../profile/CharacterProgression';
import { attributesWithEquipment, equippedWeaponDamage } from '../equipment/EquipmentStatBonuses';
import { buildRpgUiViewModel } from './RpgUiViewModel';
import {
  itemTooltipDataAttributes,
  inventoryItemArt,
  populateCraftInspector,
  isInspectableItem,
  renderEquipmentSlotContent,
} from './CraftRewardsPresentation';
import { bindItemTooltip } from './ItemTooltip';

export type RpgOverlayMode = 'equipment' | 'backpack' | 'status';

export interface InventoryOverlayOptions {
  readonly onClose: () => void;
  readonly onInventoryChanged: () => void;
  readonly onStatusChanged: () => void;
  readonly onGuildTokenBackpackExpansion: () => string;
  readonly onShown?: () => void;
  readonly onHidden?: () => void;
  readonly allowEquip?: boolean;
}

/** Restores focus to an enabled repeat action or its persistent capacity status. */
export function restoreBackpackExpansionFocus(root: ParentNode, capacityId: string): void {
  const repeatAction = root.querySelector<HTMLButtonElement>(
    '[data-expand-backpack="guild-token"]:not(:disabled)'
  );
  const fallback = root.querySelector<HTMLElement>(`#${capacityId}`);
  (repeatAction ?? fallback)?.focus();
}

export function renderInventoryBackpackContents(
  profile: PlayerProfile,
  inventory: InventorySnapshot,
  allowEquip = false
): string {
  const view = buildRpgUiViewModel(profile, inventory);
  const preparation = prepareGuildTokenBackpackExpansion(profile, inventory);
  const guildTokenAvailable = preparation.kind === 'expanded';
  const availability = preparation.kind === 'capacity-maximum'
    ? 'Limite de 60 espaços atingido.'
    : guildTokenAvailable
      ? 'Expanda a mochila em 5 espaços.'
      : 'São necessários 30 Token da Guilda.';
  const slots = view.backpack.map(({ index, item, quantity }) => {
    const isEquipment = item && item.kind === 'equipment' && item.slot;
    const equipLabel = isEquipment && allowEquip ? '<span class="equip-indicator">Equipar</span>' : '';
    return `
      <button class="inventory-slot${item ? ' has-item' : ''}${isEquipment ? ' is-equipment' : ''}" type="button" data-inventory-index="${index}" ${item ? itemTooltipDataAttributes(item, quantity) : ''} ${item ? '' : 'disabled'} aria-label="${item ? `${item.label}, quantidade ${quantity}${isEquipment && allowEquip ? ', clique para abrir opções' : ''}` : `Espaço vazio ${index + 1}`}">
        ${item ? `${inventoryItemArt(item)}<span class="item-quantity">${quantity}</span><small>${item.label}</small>${equipLabel}` : ''}
      </button>`;
  }).join('');
  return `
    <div class="backpack-expansion-actions" role="group" aria-label="Expandir mochila">
      <button class="backpack-expansion-option" type="button" data-expand-backpack="guild-token" ${guildTokenAvailable ? '' : 'disabled aria-disabled="true"'}>
        <strong>+5 espaços</strong><small>30 Token da Guilda</small>
      </button>
      <button class="backpack-expansion-option is-unavailable" type="button" data-expand-backpack="cm" disabled aria-disabled="true">
        <strong>5 CM — indisponível</strong><small>Carteira CM ainda não integrada.</small>
      </button>
      <p class="backpack-expansion-availability">${availability}</p>
    </div>
    <div class="inventory-grid backpack-slot-grid">${slots}</div>`;
}

/**
 * A single modal shell with focused views prevents persistent HUD clutter
 * while retaining the inspect/equip flow and keyboard focus protection.
 */
export class InventoryOverlay {
  private readonly root = document.getElementById('character-overlay')!;
  private readonly equipment = document.getElementById('inventory-equipment')!;
  private readonly backpack = document.getElementById('inventory-backpack')!;
  private readonly capacity = document.getElementById('inventory-capacity')!;
  private readonly message = document.getElementById('inventory-message')!;
  private readonly craftInspector = document.getElementById('craft-item-inspector')!;
  private readonly eyebrow = document.getElementById('character-eyebrow')!;
  private readonly title = document.getElementById('character-title')!;
  private lastFocus: HTMLElement | null = null;
  private inspectorLastFocus: HTMLElement | null = null;
  /** Backpack index awaiting an explicit Equipar confirmation, if any. */
  private pendingEquipIndex: number | null = null;
  private activeMode: RpgOverlayMode = 'equipment';

  public constructor(
    private readonly profile: PlayerProfile,
    private readonly store: InventoryStore,
    private readonly options: InventoryOverlayOptions
  ) {
    this.root.addEventListener('click', this.click);
    this.root.addEventListener('keydown', this.keyDown);
    bindItemTooltip(this.root);
  }

  public show(mode: RpgOverlayMode = 'equipment'): void {
    if (this.root.classList.contains('hidden')) {
      this.lastFocus = document.activeElement as HTMLElement | null;
      this.options.onShown?.();
    }
    this.craftInspector.classList.add('hidden');
    this.inspectorLastFocus = null;
    this.activeMode = mode;
    this.render();
    this.root.classList.remove('hidden');
    this.root.querySelector<HTMLButtonElement>('[data-close-overlay]')?.focus();
  }

  public hide(): void {
    if (this.root.classList.contains('hidden')) return;
    this.hideCraftInspector(false);
    const tooltip = this.root.querySelector<HTMLElement>('[data-item-tooltip]');
    if (tooltip) {
      tooltip.hidden = true;
      tooltip.setAttribute('aria-hidden', 'true');
    }
    this.root.classList.add('hidden');
    if (this.lastFocus?.isConnected) this.lastFocus.focus();
    this.lastFocus = null;
    this.options.onHidden?.();
  }

  private render(): void {
    this.renderEquipment();
    this.renderBackpack();
    this.renderStatus();
    this.setMode(this.activeMode);
  }

  private renderEquipment(): void {
    const view = buildRpgUiViewModel(this.profile, this.store.snapshot());
    const selectedClassForIcons = this.profile.selectedClass;
    this.equipment.innerHTML = view.equipment.map(({ slot, label, item }) => `
      <div class="equipment-slot${item ? ' is-equipped' : ''}" data-equipment-slot="${slot}" aria-label="${label}: ${item?.label ?? 'Vazio'}">
        ${renderEquipmentSlotContent(slot, item, selectedClassForIcons)}
      </div>`).join('');
  }

  private renderBackpack(): void {
    const inventory = this.store.snapshot();
    const view = buildRpgUiViewModel(this.profile, inventory);
    this.capacity.textContent = `${view.backpack.filter(({ item }) => item).length} / ${view.backpack.length}`;
    this.backpack.innerHTML = renderInventoryBackpackContents(
      this.profile,
      inventory,
      this.options.allowEquip ?? false
    );
  }

  private renderStatus(): void {
    const level = document.getElementById('status-level');
    const experience = document.getElementById('status-experience');
    const remaining = document.getElementById('status-attribute-points');
    const controls = document.getElementById('status-controls');
    const derivedHost = document.getElementById('status-derived-stats');
    const gateMessage = document.getElementById('status-gate-message');
    if (!level || !experience || !remaining || !controls || !derivedHost || !gateMessage) return;

    const progress = experienceProgressFor(this.profile.progression);
    level.textContent = `Nível ${this.profile.progression.level}`;
    experience.textContent = progress.required === 0
      ? 'Nível máximo'
      : `${progress.current} / ${progress.required} XP`;
    remaining.textContent = String(this.profile.attributePointsRemaining);
    controls.innerHTML = ATTRIBUTE_KEYS.map((key) => {
      const content = ATTRIBUTE_CONTENT[key];
      const value = this.profile.attributes[key];
      const onePoint = attributeAllocationAllowance(this.profile.attributes, key, 1, this.profile.attributePointsRemaining);
      const fivePoints = attributeAllocationAllowance(this.profile.attributes, key, 5, this.profile.attributePointsRemaining);
      return `<div class="attribute-row">
        <span><strong>${content.label}</strong><small>${content.help}</small></span>
        <output id="attribute-${key}">${value}</output>
        <button type="button" data-attribute="${key}" data-attribute-delta="1" ${onePoint === 0 ? 'disabled' : ''} aria-label="Adicionar 1 em ${content.label}">+1</button>
        <button type="button" data-attribute="${key}" data-attribute-delta="5" ${fivePoints === 0 ? 'disabled' : ''} aria-label="Adicionar até 5 em ${content.label}">+5</button>
      </div>`;
    }).join('');

    // The panel describes the loadout, so it must read the same equipped
    // attributes and weapon damage the fight uses instead of bare attributes.
    const equipment = this.store.snapshot().equipment;
    const derived = deriveCharacterStats(attributesWithEquipment(this.profile.attributes, equipment), {
      maxHealth: 100,
      attackDamage: equippedWeaponDamage(equipment),
      movementSpeed: 4.5,
      attackCooldown: 0.67,
    });
    derivedHost.innerHTML = [
      ['Vida máxima', derived.maxHealth.toFixed(1)],
      ['Dano físico', (derived.attackDamage * derived.physicalDamageMultiplier).toFixed(1)],
      ['Redução de dano', `${(derived.damageReduction * 100).toFixed(1)}%`],
      ['Velocidade', `${derived.movementSpeed.toFixed(2)} m/s`],
      ['Recarga do ataque', `${derived.attackCooldown.toFixed(2)} s`],
      ['Crítico físico', `${(derived.criticalAttackChance * 100).toFixed(1)}%`],
      ['Dano do crítico', `${derived.criticalMultiplier.toFixed(2)}×`],
      ['Crítico elemental', `${(derived.magicCriticalChance * 100).toFixed(1)}%`],
      ['Roubo de vida', `${(derived.lifeStealFraction * 100).toFixed(1)}%`],
      ['Esquiva', `${(derived.dodgeChance * 100).toFixed(1)}%`],
    ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');

    const gateLocked = ATTRIBUTE_KEYS.some(
      (key) => this.profile.attributes[key] >= getAttributeAllocationCap(this.profile.attributes, key)
    );
    gateMessage.textContent = this.profile.attributePointsRemaining === 0
      ? 'Suba de nível para conquistar mais 2 pontos de status.'
      : gateLocked
        ? 'Para ultrapassar o limite em um status, eleve outro status para desbloquear +5 pontos.'
        : 'Pontos aplicados não podem ser removidos. Reset pago: em breve.';
  }

  private setMode(mode: RpgOverlayMode): void {
    this.activeMode = mode;
    this.root.dataset.characterMode = mode;
    const heading = OVERLAY_HEADINGS[mode];
    this.eyebrow.textContent = heading.eyebrow;
    this.title.textContent = heading.title;
    this.root.querySelectorAll<HTMLElement>('[data-character-panel]').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.characterPanel !== mode);
    });
  }

  private click = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-close-craft-inspector]')) {
      this.hideCraftInspector();
      return;
    }
    if (target.closest('[data-close-overlay]')) {
      this.options.onClose();
      return;
    }
    const expansionButton = target.closest<HTMLButtonElement>('[data-expand-backpack]');
    if (expansionButton) {
      this.message.textContent = expansionButton.dataset.expandBackpack === 'guild-token'
        ? this.options.onGuildTokenBackpackExpansion()
        : 'A compra por CM está indisponível até a carteira ser integrada.';
      this.render();
      restoreBackpackExpansionFocus(this.root, 'inventory-capacity');
      return;
    }
    const attributeButton = target.closest<HTMLButtonElement>('[data-attribute]');
    if (attributeButton?.dataset.attribute) {
      const key = attributeButton.dataset.attribute as CharacterAttributeKey;
      const amount = Number(attributeButton.dataset.attributeDelta);
      const next = allocateAttributePoint(this.profile, key, amount);
      if (next === this.profile) return;
      Object.assign(this.profile, next);
      this.options.onStatusChanged();
      this.renderStatus();
      this.root.querySelector<HTMLButtonElement>(
        `[data-attribute="${key}"][data-attribute-delta="${amount}"]:not(:disabled)`
      )?.focus();
      return;
    }
    if (target.closest('[data-equip-inventory-item]')) {
      this.confirmEquipPendingItem();
      return;
    }
    const itemButton = target.closest<HTMLButtonElement>('[data-inventory-index]');
    if (itemButton) {
      const index = Number(itemButton.dataset.inventoryIndex);
      const stack = this.store.snapshot().backpack[index];
      if (stack) this.activateStack(stack, itemButton, index);
      return;
    }
  };

  /** Applies the equip only after the player confirms it in the inspector. */
  private confirmEquipPendingItem(): void {
    if (!this.options.allowEquip) {
      this.message.textContent = 'Não é possível trocar equipamentos durante a masmorra. Equipe seus itens no Lobby antes de entrar.';
      this.pendingEquipIndex = null;
      this.hideCraftInspector(false);
      return;
    }
    const index = this.pendingEquipIndex;
    if (index === null) return;
    const stack = this.store.snapshot().backpack[index];
    const item = stack ? getInventoryItem(stack.itemId) : undefined;
    if (!item || item.kind !== 'equipment' || !item.slot) {
      this.pendingEquipIndex = null;
      this.hideCraftInspector();
      return;
    }
    const result = this.store.equip(index, item.slot as RpgEquipmentSlot);
    this.message.textContent = result.kind === 'equipped'
      ? `${item.label} equipado.`
      : 'O item não é compatível com esse espaço.';
    if (result.kind === 'equipped') this.options.onInventoryChanged();
    this.pendingEquipIndex = null;
    this.hideCraftInspector(false);
    this.render();
  }

  private activateStack(
    stack: InventoryStack,
    source: HTMLButtonElement,
    index: number
  ): void {
    const item = getInventoryItem(stack.itemId);
    if (isCraftMaterial(item)) {
      this.pendingEquipIndex = null;
      this.showCraftInspector(item, stack.quantity, source);
      return;
    }
    if (!item || item.kind !== 'equipment' || !item.slot) {
      this.message.textContent = item?.kind === 'material'
        ? 'Material guardado para o sistema de craft.'
        : 'Este item não pode ser equipado.';
      return;
    }
    // Equipment opens the inspector first; the swap only happens once the
    // player confirms with Equipar, so a misclick never replaces worn gear.
    this.pendingEquipIndex = this.options.allowEquip ? index : null;
    this.showCraftInspector(item, stack.quantity, source);
  }

  private showCraftInspector(
    item: NonNullable<ReturnType<typeof getInventoryItem>>,
    quantity: number,
    source: HTMLButtonElement
  ): void {
    this.inspectorLastFocus = source;
    populateCraftInspector(this.craftInspector, item, quantity, this.options.allowEquip ?? false);
    this.craftInspector.classList.remove('hidden');
    this.craftInspector.querySelector<HTMLButtonElement>('[data-close-craft-inspector]')?.focus();
  }

  private hideCraftInspector(restoreFocus = true): void {
    if (this.craftInspector.classList.contains('hidden')) return;
    this.craftInspector.classList.add('hidden');
    this.pendingEquipIndex = null;
    if (restoreFocus && this.inspectorLastFocus?.isConnected) this.inspectorLastFocus.focus();
    this.inspectorLastFocus = null;
  }

  private keyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!this.craftInspector.classList.contains('hidden')) {
        this.hideCraftInspector();
        return;
      }
      this.options.onClose();
      return;
    }
    if (!this.craftInspector.classList.contains('hidden')) {
      trapFocus(this.craftInspector, event);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      const target = event.target as HTMLElement;
      const itemButton = target.closest<HTMLButtonElement>('[data-inventory-index]');
      if (itemButton) {
        const stack = this.store.snapshot().backpack[Number(itemButton.dataset.inventoryIndex)];
        const item = stack ? getInventoryItem(stack.itemId) : undefined;
        if (stack && isInspectableItem(item)) {
          event.preventDefault();
          this.pendingEquipIndex = item.kind === 'equipment'
            ? Number(itemButton.dataset.inventoryIndex)
            : null;
          this.showCraftInspector(item, stack.quantity, itemButton);
          return;
        }
      }
    }
    trapFocus(this.root, event);
  };
}

const OVERLAY_HEADINGS: Readonly<Record<RpgOverlayMode, { eyebrow: string; title: string }>> = {
  equipment: { eyebrow: 'Ficha do Guerreiro', title: 'Equipamentos' },
  backpack: { eyebrow: 'Itens conquistados', title: 'Mochila' },
  status: { eyebrow: 'Progressão do Guerreiro', title: 'Status' },
};

const ATTRIBUTE_CONTENT: Readonly<Record<CharacterAttributeKey, { label: string; help: string }>> = {
  vitality: { label: 'Vitalidade', help: 'Adiciona 3 de vida máxima por ponto.' },
  attack: { label: 'Ataque', help: 'Cada ponto soma 1 de dano no golpe.' },
  defense: { label: 'Defesa', help: 'Reduz o dano recebido; 40 pontos já cortam metade (limite 70%).' },
  agility: { label: 'Agilidade', help: 'Aumenta movimento, velocidade de ataque e reserva de fadiga máxima (+2 por ponto, até +200).' },
  criticalAttack: { label: 'Crítico de ataque', help: 'Chance de crítico físico (até 50%).' },
  criticalDamage: { label: 'Dano crítico', help: 'Aumenta o multiplicador do crítico (1,5× + 1,5% por ponto, até 3,0×).' },
  criticalMagic: { label: 'Crítico mágico', help: 'Chance de crítico de fogo e gelo (até 50%).' },
  lifeSteal: { label: 'Roubo de vida', help: 'Recupera vida igual a 0,20% do dano causado por ponto (até 20%).' },
  dodge: { label: 'Esquiva', help: 'Chance de ignorar completamente um golpe (até 35%).' },
};

export function trapFocus(root: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const elements = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
  if (elements.length === 0) return;
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
