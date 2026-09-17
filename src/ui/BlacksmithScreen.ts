import {
  BLACKSMITH_RECIPES,
  getBlacksmithLicensePresentation,
  hasActiveLicense,
  type BlacksmithRecipeId,
} from '../crafting/BlacksmithWorkshop';
import { getInventoryItem } from '../inventory/InventoryCatalog';
import type { InventorySnapshot, InventoryStore } from '../inventory/InventoryStore';
import type { PlayerProfile } from '../profile/PlayerProfile';
import { renderEquipmentSlotContent, renderInventorySlotContent } from './CraftRewardsPresentation';
import {
  BlacksmithForgePresentation,
  type BlacksmithForgeAnimation,
} from './BlacksmithForgePresentation';
import { buildRpgUiViewModel } from './RpgUiViewModel';

export interface BlacksmithScreenActionResult {
  readonly message: string;
  readonly craftedRecipeId?: BlacksmithRecipeId;
}

export interface BlacksmithScreenOptions {
  readonly onLicensePurchase: () => BlacksmithScreenActionResult;
  readonly onCraft: (recipeId: BlacksmithRecipeId) => BlacksmithScreenActionResult;
  readonly onBack: () => void;
}

type BlacksmithScreenMode = 'greeting' | 'payment' | 'catalog';
type BlacksmithCraftPhase = 'working' | 'delivery' | 'complete';
type BlacksmithPanel = 'equipment' | 'inventory' | 'craft';

interface BlacksmithCraftJob {
  readonly recipeId: BlacksmithRecipeId;
  phase: BlacksmithCraftPhase;
}

const FORGE_WORK_DURATION_MS = 15_000;
const FORGE_DELIVERY_DURATION_MS = 4_800;
const FORGE_DELIVERY_REWARD_LEAD_MS = 1_000;

/**
 * Full-screen blacksmith route. Crafting remains delegated to the game-owned
 * persistence callbacks, so this view never commits an unsaved profile state.
 */
export class BlacksmithScreen {
  private readonly root: HTMLElement;
  private mode: BlacksmithScreenMode = 'greeting';
  private message = '';
  private craftedRecipeId: BlacksmithRecipeId | null = null;
  private selectedBackpackItemId: string | null = null;
  private readonly forge: BlacksmithForgePresentation | null;
  private crafting: BlacksmithCraftJob | null = null;
  private craftTimer: number | null = null;
  private finishTimer: number | null = null;
  private notificationTimer: number | null = null;
  private craftNotification = '';
  private activePanel: BlacksmithPanel = 'equipment';

  public constructor(
    host: HTMLElement,
    private readonly profile: PlayerProfile,
    private readonly inventory: InventoryStore,
    private readonly options: BlacksmithScreenOptions
  ) {
    this.root = host.matches('[data-blacksmith-screen]')
      ? host
      : this.createRoot(host);
    this.forge = BlacksmithForgePresentation.create();
    this.root.addEventListener('click', this.handleClick);
  }

  public show(): void {
    this.mode = hasActiveLicense(this.profile, Date.now()) ? 'catalog' : 'greeting';
    this.message = '';
    this.craftedRecipeId = null;
    this.selectedBackpackItemId = null;
    this.activePanel = 'equipment';
    this.root.classList.remove('hidden');
    this.root.setAttribute('aria-hidden', 'false');
    this.render();
    this.root.querySelector<HTMLButtonElement>('[data-open-blacksmith-negotiation], [data-craft-recipe], [data-back-from-blacksmith]')?.focus();
  }

  public hide(): void {
    this.root.classList.add('hidden');
    this.root.setAttribute('aria-hidden', 'true');
  }

  public dispose(): void {
    this.root.removeEventListener('click', this.handleClick);
    this.clearTimers();
    this.forge?.dispose();
    this.hide();
  }

  private createRoot(host: HTMLElement): HTMLElement {
    const root = document.createElement('section');
    root.className = 'flow-screen blacksmith-screen hidden';
    root.dataset.blacksmithScreen = '';
    root.setAttribute('aria-hidden', 'true');
    host.append(root);
    return root;
  }

  private render(): void {
    const inventory = this.inventory.snapshot();
    this.root.dataset.workshopPanel = this.activePanel;
    const equipment = buildRpgUiViewModel(this.profile, inventory).equipment.map(({ slot, label, item }) => `
      <div class="equipment-slot${item ? ' is-equipped' : ''}" data-equipment-slot="${slot}" aria-label="${label}: ${item?.label ?? 'Vazio'}">
        ${renderEquipmentSlotContent(slot, item)}
      </div>`).join('');
    const isLicensed = hasActiveLicense(this.profile, Date.now());
    const remainingHours = isLicensed
      ? Math.max(1, Math.ceil((this.profile.blacksmith.availableUntil! - Date.now()) / (60 * 60 * 1000)))
      : 0;
    const { costLabel, durationLabel } = getBlacksmithLicensePresentation();
    const recipes = isLicensed
      ? this.renderRecipes(inventory)
      : `<p class="workshop-recipes__locked-copy">Converse com o ferreiro para consultar as receitas.</p>`;

    this.root.innerHTML = `
      <div class="forge-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <header class="workshop-masthead">
        <div><p class="section-label">Oficina do ferreiro</p><h1 id="blacksmith-screen-title">Forja de Cinzafogo</h1></div>
        <button type="button" data-back-from-blacksmith>Voltar ao salão</button>
      </header>
      <main class="workshop-layout" aria-labelledby="blacksmith-screen-title">
        <section class="workshop-conversation" aria-live="polite">
          ${this.renderConversation(isLicensed, remainingHours, costLabel, durationLabel)}
        </section>
        <section class="workshop-equipment" aria-label="Ferramentas da oficina">
          <nav class="workshop-tabs" role="tablist" aria-label="Ferramentas da oficina">
            ${this.renderPanelTab('equipment', 'Equipamento')}
            ${this.renderPanelTab('inventory', 'Inventário')}
            ${this.renderPanelTab('craft', 'Itens de craft')}
          </nav>
          <div class="workshop-tab-body">
            <section class="workshop-tab-panel" id="workshop-panel-equipment" role="tabpanel" aria-labelledby="workshop-tab-equipment" ${this.activePanel === 'equipment' ? '' : 'hidden'}>
              <p class="section-label">Equipamento atual</p>
              <h2 id="workshop-equipment-title">Armadura e arma</h2>
              <div class="equipment-grid" data-workshop-equipment>${equipment}</div>
            </section>
            <section class="workshop-tab-panel" id="workshop-panel-inventory" role="tabpanel" aria-labelledby="workshop-tab-inventory" ${this.activePanel === 'inventory' ? '' : 'hidden'}>
              ${this.renderBackpack(inventory)}
            </section>
            <section class="workshop-tab-panel workshop-recipes${isLicensed ? '' : ' is-locked'}" id="workshop-panel-craft" role="tabpanel" aria-labelledby="workshop-tab-craft" data-workshop-recipes aria-label="Receitas da oficina" ${this.activePanel === 'craft' ? '' : 'hidden'} ${isLicensed ? '' : 'aria-disabled="true"'}>
              <header><p class="section-label">${isLicensed ? `Licença ativa · ${remainingHours}h restantes` : 'Receitas bloqueadas'}</p><h2>Peças do forjador</h2></header>
              ${recipes}
            </section>
          </div>
        </section>
      </main>
      ${this.craftNotification ? `<div class="workshop-craft-notification" role="status" aria-live="assertive"><span>Item Craftado com Sucesso</span><strong>${this.craftNotification}</strong><small>Ja esta na sua Mochila.</small></div>` : ''}`;
    this.mountForge();
  }

  private renderConversation(
    isLicensed: boolean,
    remainingHours: number,
    costLabel: string,
    durationLabel: string
  ): string {
    const forgeCaption = this.getForgeCaption(isLicensed, remainingHours);
    if (isLicensed) {
      const crafted = this.craftedRecipeId
        ? BLACKSMITH_RECIPES.find(({ id }) => id === this.craftedRecipeId)
        : null;
      return this.renderForgeScene(forgeCaption, `
        <p class="section-label">Oficina licenciada</p>
        <h2>O que vamos forjar?</h2>
        <p>As receitas usam os materiais que já estão na sua mochila.</p>`);
    }
    if (this.mode === 'payment') {
      return this.renderForgeScene(forgeCaption, `
        <p class="section-label">Licença de oficina</p>
        <h2>${durationLabel} de acesso</h2>
        <p>O pagamento usa apenas Tokens da Guilda que já estão na sua mochila.</p>
        <div class="blacksmith-actions"><button type="button" data-buy-blacksmith-license><strong>Pagar ${costLabel}</strong><small>Libera a oficina por ${durationLabel}</small></button><button type="button" data-back-from-blacksmith>Desculpa, vou embora</button></div>`);
    }
    return this.renderForgeScene(forgeCaption, `
      <p class="section-label">Oficina do ferreiro</p>
      <h2>Estou ocupado. O que deseja?</h2>
      <div class="blacksmith-actions"><button type="button" data-open-blacksmith-negotiation>Quero que você crie meus itens</button><button type="button" data-back-from-blacksmith>Desculpa, vou embora</button></div>`);
  }

  private renderPanelTab(panel: BlacksmithPanel, label: string): string {
    const selected = this.activePanel === panel;
    return `<button type="button" id="workshop-tab-${panel}" role="tab" data-workshop-tab="${panel}" aria-selected="${selected}" aria-controls="workshop-panel-${panel}">${label}</button>`;
  }

  /**
   * Recipes are listed one block per set so the player sees what completing a
   * line grants before spending materials. The bonus text comes from the same
   * definition the combat pipeline applies.
   */
  private renderRecipes(inventory: InventorySnapshot): string {
    return `<div class="blacksmith-recipes">${BLACKSMITH_RECIPES
      .map((recipe) => this.renderRecipe(recipe, inventory))
      .join('')}</div>`;
  }

  private renderRecipe(recipe: (typeof BLACKSMITH_RECIPES)[number], inventory: InventorySnapshot): string {
    const item = getInventoryItem(recipe.outputItemId);
    const canCraft = recipe.ingredients.every(({ itemId, quantity }) => this.itemQuantity(inventory, itemId) >= quantity);
    const canStartCraft = canCraft && !this.crafting;
    const ingredients = recipe.ingredients.map(({ itemId, quantity }) => {
      const material = getInventoryItem(itemId);
      const available = this.itemQuantity(inventory, itemId);
      const availableClass = available >= quantity ? ' is-available' : ' is-missing';
      return `<li class="blacksmith-ingredient${availableClass}">
        <img loading="lazy" src="${material?.iconSrc ?? ''}" alt="">
        <span>${material?.label ?? itemId}<small>${available} / ${quantity}</small></span>
      </li>`;
    }).join('');
    return `<article class="blacksmith-recipe${canCraft ? ' is-ready' : ' is-incomplete'}${this.crafting?.recipeId === recipe.id ? ' is-forging' : ''}">
      <img class="blacksmith-recipe__art" loading="lazy" src="${item?.iconSrc ?? ''}" alt="">
      <div class="blacksmith-recipe__content">
        <div class="blacksmith-recipe__heading"><div><h3>${recipe.label}</h3><p>${this.itemStats(item)}</p></div><span>${canCraft ? 'Pronto para forjar' : 'Materiais insuficientes'}</span></div>
        <ul class="blacksmith-ingredients">${ingredients}</ul>
      </div>
      <button type="button" class="${canStartCraft ? '' : 'is-unavailable'}" data-craft-recipe="${recipe.id}" ${this.crafting ? 'disabled aria-disabled="true"' : canCraft ? '' : 'aria-disabled="true"'}>${this.crafting?.recipeId === recipe.id ? 'Forjando...' : canCraft ? 'Forjar' : 'Indisponível'}</button>
    </article>`;
  }

  private renderBackpack(inventory: InventorySnapshot): string {
    const selectedStack = inventory.backpack.find((stack) => stack.itemId === this.selectedBackpackItemId);
    const selectedItem = selectedStack ? getInventoryItem(selectedStack.itemId) : undefined;
    return `<section class="workshop-backpack" aria-labelledby="workshop-backpack-title">
      <header><div><p class="section-label">Mochila</p><h3 id="workshop-backpack-title">Itens disponíveis</h3></div><output>${inventory.backpack.length} / ${inventory.capacity}</output></header>
      <div class="workshop-backpack-grid">
        ${inventory.backpack.map((stack) => {
          const item = getInventoryItem(stack.itemId);
          if (!item) return '';
          const selected = item.id === this.selectedBackpackItemId;
          return `<button type="button" class="workshop-backpack-item${selected ? ' is-selected' : ''}" data-workshop-backpack-item="${item.id}" aria-pressed="${selected}">${renderInventorySlotContent(item, stack.quantity)}</button>`;
        }).join('')}${Array.from(
          { length: Math.max(0, inventory.capacity - inventory.backpack.length) },
          () => '<span class="workshop-backpack-empty" aria-hidden="true"></span>'
        ).join('')}
      </div>
      ${selectedItem && selectedStack ? `<aside class="workshop-item-inspector">
        <div>${renderInventorySlotContent(selectedItem, selectedStack.quantity)}</div>
        <span><strong>${selectedItem.label}</strong><small>${selectedItem.description ?? 'Item guardado na mochila.'}</small>${this.itemStats(selectedItem) ? `<em>${this.itemStats(selectedItem)}</em>` : ''}</span>
      </aside>` : ''}
    </section>`;
  }

  private itemQuantity(inventory: InventorySnapshot, itemId: string): number {
    return inventory.backpack.reduce((total, stack) => total + (stack.itemId === itemId ? stack.quantity : 0), 0);
  }

  private itemStats(item: ReturnType<typeof getInventoryItem>): string {
    if (!item) return '';
    const labels: Readonly<Record<string, string>> = {
      vitality: 'Vitalidade', attack: 'Ataque', defense: 'Defesa', agility: 'Agilidade',
      criticalAttack: 'Crítico', criticalDamage: 'Dano crítico', lifeSteal: 'Roubo de vida',
      criticalMagic: 'Crítico mágico', dodge: 'Esquiva',
    };
    // Flat weapon damage reads as "Dano"; "Ataque" is the attribute.
    const values = item.baseDamage ? [`Dano +${item.baseDamage}`] : [];
    for (const [attribute, value] of Object.entries(item.statBonuses ?? {})) {
      if (value) values.push(`${labels[attribute] ?? attribute} +${value}`);
    }
    return values.join(' · ');
  }

  private handleClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    const panelTab = target.closest<HTMLButtonElement>('[data-workshop-tab]');
    const requestedPanel = panelTab?.dataset.workshopTab;
    if (requestedPanel === 'equipment' || requestedPanel === 'inventory' || requestedPanel === 'craft') {
      this.activePanel = requestedPanel;
      this.render();
      this.root.querySelector<HTMLButtonElement>(`[data-workshop-tab="${requestedPanel}"]`)?.focus();
      return;
    }
    if (target.closest('[data-back-from-blacksmith]')) {
      if (this.crafting) {
        this.message = 'O ferreiro ja esta trabalhando nesta peca.';
        this.render();
        return;
      }
      this.hide();
      this.options.onBack();
      return;
    }
    if (target.closest('[data-open-blacksmith-negotiation]')) {
      this.mode = 'payment';
      this.render();
      this.root.querySelector<HTMLButtonElement>('[data-buy-blacksmith-license]')?.focus();
      return;
    }
    if (target.closest('[data-buy-blacksmith-license]')) {
      const result = this.options.onLicensePurchase();
      this.message = result.message;
      this.mode = hasActiveLicense(this.profile, Date.now()) ? 'catalog' : 'payment';
      this.render();
      this.root.querySelector<HTMLButtonElement>('[data-craft-recipe], [data-buy-blacksmith-license]')?.focus();
      return;
    }
    const backpackItem = target.closest<HTMLButtonElement>('[data-workshop-backpack-item]');
    if (backpackItem?.dataset.workshopBackpackItem) {
      this.selectedBackpackItemId = backpackItem.dataset.workshopBackpackItem;
      this.activePanel = 'inventory';
      this.render();
      return;
    }
    const craftButton = target.closest<HTMLButtonElement>('[data-craft-recipe]');
    const recipeId = craftButton?.dataset.craftRecipe;
    if (!recipeId || !BLACKSMITH_RECIPES.some((recipe) => recipe.id === recipeId)) return;
    this.startCraft(recipeId as BlacksmithRecipeId);
  };

  private renderForgeScene(caption: string, conversation: string): string {
    return `<figure class="blacksmith-scene" data-blacksmith-forge-scene>
      <div class="blacksmith-scene__viewport" data-blacksmith-forge-viewport><span class="blacksmith-scene__fallback">Forja de Cinzafogo</span></div>
      <div class="blacksmith-scene__dialogue">
        <figcaption>${caption}</figcaption>
        <div class="blacksmith-scene__choices">${conversation}</div>
        <p class="workshop-message" role="status">${this.message}</p>
      </div>
    </figure>`;
  }

  private getForgeCaption(isLicensed: boolean, remainingHours: number): string {
    if (this.crafting?.phase === 'working') return 'O ferreiro trabalha a peca entre brasas e aco.';
    if (this.crafting?.phase === 'delivery') return 'A peca esta pronta. O ferreiro se prepara para entrega-la.';
    if (this.crafting?.phase === 'complete') return 'A peca foi entregue e guardada na mochila.';
    if (this.craftedRecipeId) {
      return `${BLACKSMITH_RECIPES.find(({ id }) => id === this.craftedRecipeId)?.label ?? 'Peca'} pronta na mochila.`;
    }
    if (isLicensed) return `Sua licenca esta ativa por mais ${remainingHours}h.`;
    if (this.mode === 'payment') return 'O trabalho exige uma licenca da guilda.';
    return 'O ferreiro aguarda o proximo trabalho.';
  }

  private mountForge(): void {
    const viewport = this.root.querySelector<HTMLElement>('[data-blacksmith-forge-viewport]');
    if (!viewport) return;
    this.forge?.attach(viewport);
    this.forge?.setAnimation(this.getForgeAnimation());
  }

  private getForgeAnimation(): BlacksmithForgeAnimation {
    if (this.crafting?.phase === 'working') return 'working';
    if (this.crafting?.phase === 'delivery' || this.crafting?.phase === 'complete') return 'delivery';
    return 'idle';
  }

  private startCraft(recipeId: BlacksmithRecipeId): void {
    if (this.crafting) return;
    if (!hasActiveLicense(this.profile, Date.now())) {
      this.mode = 'greeting';
      this.message = 'A licenca da oficina expirou.';
      this.render();
      return;
    }
    const recipe = BLACKSMITH_RECIPES.find(({ id }) => id === recipeId);
    const inventory = this.inventory.snapshot();
    if (!recipe || !recipe.ingredients.every(({ itemId, quantity }) => this.itemQuantity(inventory, itemId) >= quantity)) {
      this.message = 'Materiais insuficientes para iniciar esta forja.';
      this.render();
      return;
    }
    this.crafting = { recipeId, phase: 'working' };
    this.craftedRecipeId = null;
    this.craftNotification = '';
    this.message = 'O ferreiro iniciou o trabalho. Aguarde 15 segundos.';
    this.render();
    this.craftTimer = window.setTimeout(this.beginDelivery, FORGE_WORK_DURATION_MS);
  }

  private readonly beginDelivery = (): void => {
    if (!this.crafting) return;
    this.crafting.phase = 'delivery';
    this.message = 'A forja terminou. O ferreiro vai entregar a peca.';
    this.render();
    this.craftTimer = window.setTimeout(
      this.finishCraft,
      FORGE_DELIVERY_DURATION_MS - FORGE_DELIVERY_REWARD_LEAD_MS,
    );
  };

  private readonly finishCraft = (): void => {
    if (!this.crafting) return;
    const recipeId = this.crafting.recipeId;
    const result = this.options.onCraft(recipeId);
    if (!result.craftedRecipeId) {
      this.crafting = null;
      this.message = result.message;
      this.render();
      return;
    }
    const recipe = BLACKSMITH_RECIPES.find(({ id }) => id === result.craftedRecipeId);
    this.crafting.phase = 'complete';
    this.craftedRecipeId = result.craftedRecipeId;
    this.selectedBackpackItemId = recipe?.outputItemId ?? null;
    this.craftNotification = recipe?.label ?? 'Item';
    this.message = result.message;
    this.render();
    this.finishTimer = window.setTimeout(this.endCraft, FORGE_DELIVERY_REWARD_LEAD_MS);
    this.notificationTimer = window.setTimeout(() => {
      this.craftNotification = '';
      this.render();
    }, 5_000);
  };

  private readonly endCraft = (): void => {
    this.crafting = null;
    this.render();
  };

  private clearTimers(): void {
    for (const timer of [this.craftTimer, this.finishTimer, this.notificationTimer]) {
      if (timer !== null) window.clearTimeout(timer);
    }
    this.craftTimer = null;
    this.finishTimer = null;
    this.notificationTimer = null;
  }
}
