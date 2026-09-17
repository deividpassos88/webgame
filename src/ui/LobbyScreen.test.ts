// @vitest-environment happy-dom
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adjustLobbyPreview,
  LobbyScreen,
  lobbyMotionPolicy,
  itemStatSummary,
  renderLobbyHotkeys,
  resolveLobbyIdlePhase,
  resolveLobbyPreviewViewport,
} from './LobbyScreen';
import * as LobbyScreenModule from './LobbyScreen';
import { prepareGuildTokenBackpackExpansion } from '../inventory/BackpackExpansion';
import { InventoryStore } from '../inventory/InventoryStore';
import { createDefaultPlayerProfile } from '../profile/PlayerProfile';
import type { InventoryStack } from '../profile/PlayerProfile';
import { createDefaultCharacterAttributes } from '../profile/CharacterAttributes';
import { buildRpgUiViewModel } from './RpgUiViewModel';
import { getInventoryItem } from '../inventory/InventoryCatalog';
import * as InventoryOverlayModule from './InventoryOverlay';
import type { CharacterAssetStore } from '../characters/CharacterAssetStore';

function mountLobbyRouteMarkup(): void {
  document.body.innerHTML = `
    <section id="class-select-screen" class="hidden"></section>
    <section id="lobby-screen">
      <button id="select-warrior" type="button">Selecionar</button>
      <button type="button" data-lobby-tab="hero" aria-pressed="true">Herói</button>
      <button type="button" data-lobby-tab="blacksmith" aria-pressed="false">Oficina</button>
      <main class="lobby-hero-stage"></main>
      <section data-lobby-panel="hero"></section>
      <section data-lobby-panel="inventory">
        <div id="lobby-backpack"></div>
        <section id="lobby-item-actions" class="hidden" role="menu">
          <header><div id="lobby-item-actions-art"></div><div><p id="lobby-item-actions-title"></p><p id="lobby-item-actions-state"></p></div><button type="button" data-close-item-actions>✕</button></header>
          <div class="lobby-item-actions__details"><p id="lobby-item-actions-description"></p><p id="lobby-item-actions-stat"></p></div>
          <button type="button" data-item-action="equip">Equipar</button>
          <button type="button" data-item-action="upgrade">Aprimorar</button>
          <button type="button" data-item-action="destroy">Destruir</button>
          <div id="lobby-item-destroy-confirm" class="hidden">
            <p id="lobby-item-destroy-name"></p>
            <button type="button" data-destroy-cancel>Cancelar</button>
            <button type="button" data-destroy-confirm>Destruir</button>
          </div>
        </section>
      </section>
      <section data-lobby-panel="skills"></section>
      <div id="lobby-equipment-slots"></div>
      <div id="lobby-current-status"></div>
      <span id="lobby-capacity"></span>
      <div id="lobby-backpack-actions"></div>
      <div id="lobby-skills"></div>
      <div id="lobby-hotkeys"></div>
      <span id="lobby-status"></span>
      <button id="start-game" type="button">Iniciar partida</button>
    </section>
    <section id="blacksmith-screen" data-blacksmith-screen class="hidden"></section>`;
}

function createLobbyRenderer(): THREE.WebGLRenderer {
  return {
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    autoClear: true,
    setSize: () => undefined,
    setScissorTest: () => undefined,
    setViewport: () => undefined,
    setScissor: () => undefined,
    render: () => undefined,
    clearDepth: () => undefined,
  } as unknown as THREE.WebGLRenderer;
}

function createLobbyAssets(): CharacterAssetStore {
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  return {
    createModel: () => model.clone(),
    getAnimations: () => [],
    getBoneNames: () => new Set<string>(),
    getBoneRestRotations: () => new Map<string, THREE.Quaternion>(),
  } as unknown as CharacterAssetStore;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('lobby idle selection', () => {
  it('keeps Dwarf Idle active for the entire lobby session', () => {
    expect(resolveLobbyIdlePhase(0)).toBe('lobby_dwarf_idle');
    expect(resolveLobbyIdlePhase(59.999)).toBe('lobby_dwarf_idle');
    expect(resolveLobbyIdlePhase(60)).toBe('lobby_dwarf_idle');
    expect(resolveLobbyIdlePhase(120)).toBe('lobby_dwarf_idle');
    expect(resolveLobbyIdlePhase(600)).toBe('lobby_dwarf_idle');
    expect(resolveLobbyIdlePhase(Number.NaN)).toBe('lobby_dwarf_idle');
    expect(resolveLobbyIdlePhase(-10)).toBe('lobby_dwarf_idle');
  });
});

describe('lobby preview keyboard control', () => {
  it('rotates exactly twelve degrees with left and right arrows', () => {
    const right = adjustLobbyPreview(0, 6.2, 'ArrowRight');
    expect(right.rotation).toBeCloseTo(Math.PI / 15);
    expect(adjustLobbyPreview(right.rotation, right.zoom, 'ArrowLeft').rotation).toBeCloseTo(0);
  });

  it('holds one camera distance: only turning is handled', () => {
    // Up/Down used to dolly the camera; the hero is now pinned at one framing.
    expect(adjustLobbyPreview(0, 6, 'ArrowUp')).toEqual({ rotation: 0, zoom: 6, handled: false });
    expect(adjustLobbyPreview(0, 6, 'ArrowDown')).toEqual({ rotation: 0, zoom: 6, handled: false });
    expect(adjustLobbyPreview(1, 6, 'Enter')).toEqual({ rotation: 1, zoom: 6, handled: false });
    // Turning still works, and leaves the distance untouched.
    expect(adjustLobbyPreview(0, 6, 'ArrowRight').zoom).toBe(6);
  });
});

describe('lobby preview viewport', () => {
  it('keeps the WebGL preview attached to a partially visible mobile stage', () => {
    expect(resolveLobbyPreviewViewport(
      { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 },
      { left: 14, top: 430, right: 376, bottom: 920, width: 362, height: 490 }
    )).toEqual({
      x: 14,
      y: -76,
      width: 362,
      height: 490,
      scissorX: 14,
      scissorY: 0,
      scissorWidth: 362,
      scissorHeight: 414,
    });
  });

  it('returns null when the stage is outside the canvas', () => {
    expect(resolveLobbyPreviewViewport(
      { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 },
      { left: 14, top: 900, right: 376, bottom: 1390, width: 362, height: 490 }
    )).toBeNull();
  });
});

describe('lobby reduced motion', () => {
  it('pauses idle animation and continuous rendering when reduced motion is enabled', () => {
    expect(lobbyMotionPolicy(true)).toEqual({ animateIdle: false, continuousRender: false });
    expect(lobbyMotionPolicy(false)).toEqual({ animateIdle: true, continuousRender: true });
  });
});

describe('lobby character preparation', () => {
  it('opens Oficina as a full screen route and restores the lobby start action on return', () => {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const profile = createDefaultPlayerProfile();
    const lobby = new LobbyScreen(
      createLobbyRenderer(),
      document.createElement('canvas'),
      createLobbyAssets(),
      profile,
      InventoryStore.fromProfile(profile)
    );
    void lobby.show({
      firstRun: false,
      onClassConfirmed: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
      onHotkeysChanged: () => undefined,
      onAutoBasicAttackChanged: () => undefined,
      onBlacksmithLicensePurchase: () => ({ message: '' }),
      onBlacksmithCraft: () => ({ message: '' }),
    });

    document.querySelector<HTMLButtonElement>('[data-lobby-tab="blacksmith"]')?.click();

    expect(document.getElementById('lobby-screen')?.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('blacksmith-screen')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('start-game')).toHaveProperty('disabled', true);

    document.querySelector<HTMLButtonElement>('[data-back-from-blacksmith]')?.click();

    expect(document.getElementById('lobby-screen')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('blacksmith-screen')?.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('start-game')).toHaveProperty('disabled', false);
    lobby.dispose();
  });

  it('renders automatic basic attack and registration controls for the five Warrior skills', () => {
    const markup = renderLobbyHotkeys(createDefaultPlayerProfile().hotkeys, null, '');

    expect(markup).toContain('Ataque básico automático');
    expect(markup).not.toContain('data-register-hotkey="ataque_basico"');
    expect(markup).toContain('data-register-hotkey="corte_duplo"');
    expect(markup).toContain('<kbd>1</kbd>');
  });

  it('restores lobby focus to capacity when an expansion leaves no enabled purchase action', () => {
    document.body.innerHTML = `
      <section id="lobby-screen">
        <span id="lobby-capacity" tabindex="-1">1 / 25</span>
        <button type="button" data-expand-backpack="guild-token" disabled>+5 espaços</button>
        <button type="button" data-expand-backpack="cm" disabled>5 CM — indisponível</button>
      </section>`;
    const restoreFocus = (InventoryOverlayModule as unknown as {
      restoreBackpackExpansionFocus?: (root: ParentNode, capacityId: string) => void;
    }).restoreBackpackExpansionFocus;

    if (typeof restoreFocus !== 'function') {
      expect(typeof restoreFocus).toBe('function');
      return;
    }

    restoreFocus(document.getElementById('lobby-screen')!, 'lobby-capacity');
    expect(document.activeElement).toBe(document.getElementById('lobby-capacity'));
  });

  it('renders the six reference status metrics below the equipment panel', () => {
    const profile = createDefaultPlayerProfile();
    profile.progression = { level: 4, experience: 360 };
    profile.attributePointsRemaining = 2;
    profile.attributes.vitality = 11;
    const view = buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot());
    const renderStatus = (LobbyScreenModule as unknown as {
      renderLobbyCurrentStatus?: (status: unknown) => string;
    }).renderLobbyCurrentStatus;

    if (typeof renderStatus !== 'function') {
      expect(typeof renderStatus).toBe('function');
      return;
    }

    const markup = renderStatus(view.currentStatus);
    expect(markup).toContain('Status atual');
    expect(markup).toContain('Nível');
    expect(markup).toContain('4');
    expect(markup).toContain('Pontos disponíveis');
    expect(markup).toContain('Vitalidade');
    expect(markup).toContain('11');
    expect(markup).toContain('Ataque');
    expect(markup).toContain('Defesa');
    expect(markup).toContain('Agilidade');
    expect(markup).toContain('Crítico');
    expect(markup).not.toContain('Crítico físico');
    expect(markup).not.toContain('Crítico mágico');
    // Esquiva joined the sheet; Crítico mágico deliberately stayed out.
    expect(markup).toContain('Esquiva');
  });

  it('labels weapon damage as Dano and keeps Ataque for the attribute', () => {
    // The sword grants flat damage, so its card must not promise attribute
    // points the status sheet would never show.
    expect(itemStatSummary(getInventoryItem('starter-sword'))).toBe('Dano +8');
    expect(itemStatSummary(getInventoryItem('predator-forged-gloves')))
      .toBe('Ataque +3 · Dano crítico +3');
    expect(itemStatSummary(getInventoryItem('iron-shard'))).toBe('');
    expect(itemStatSummary(undefined)).toBe('');
  });

  it('shows life total and attack damage so equipping a weapon moves the sheet', () => {
    const profile = createDefaultPlayerProfile();
    profile.attributes = { ...createDefaultCharacterAttributes(), vitality: 10, attack: 5 };
    const renderStatus = (LobbyScreenModule as unknown as {
      renderLobbyCurrentStatus?: (status: unknown) => string;
    }).renderLobbyCurrentStatus;

    if (typeof renderStatus !== 'function') {
      expect(typeof renderStatus).toBe('function');
      return;
    }

    const before = renderStatus(
      buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot()).currentStatus
    );
    // Vitality is worth 3 HP a point and an unarmed warrior only has the
    // attribute bonus (0.2 damage per attack point).
    expect(before).toContain('<dt>Vida máxima</dt><dd>130</dd>');
    expect(before).toContain('<dt>Dano</dt><dd>1</dd>');

    profile.equipment.weapon = 'starter-sword';
    profile.equipment.primaryWeapon = 'starter-sword';
    const withSword = renderStatus(
      buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot()).currentStatus
    );
    // The sword adds its own 8 damage on top of the attribute bonus.
    expect(withSword).toContain('<dt>Dano</dt><dd>9</dd>');
    expect(withSword).toContain('<dt>Vida máxima</dt><dd>130</dd>');
  });

  it('renders expansion as a bag-sized [+] cell', () => {
    const profile = createDefaultPlayerProfile();
    profile.backpack = [{ itemId: 'guild-token', quantity: 30 }];
    const preparation = prepareGuildTokenBackpackExpansion(
      profile,
      InventoryStore.fromProfile(profile).snapshot()
    );
    const renderControls = (LobbyScreenModule as unknown as {
      renderLobbyBackpackExpansionControls?: (result: unknown) => string;
    }).renderLobbyBackpackExpansionControls;

    if (typeof renderControls !== 'function') {
      expect(typeof renderControls).toBe('function');
      return;
    }

    const markup = renderControls(preparation);
    // A single affordance replaces the two permanent option cards.
    expect(markup).toContain('data-expand-backpack="guild-token"');
    // The [+] is the 21st cell, so it must inherit the bag slot styling.
    expect(markup).toContain('class="inventory-slot backpack-expansion-add"');
    expect(markup).toContain('backpack-expansion-add__plus');
    expect(markup).not.toContain('data-expand-backpack="cm"');
    // The cost still reaches the player, through the button's accessible name.
    expect(markup).toContain('30 Token da Guilda ou 5 CM');
  });

  it('announces what the player needs when the [+] expansion is pressed', () => {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const profile = createDefaultPlayerProfile();
    const store = InventoryStore.fromProfile(profile);
    const lobby = new LobbyScreen(
      createLobbyRenderer(),
      document.createElement('canvas'),
      createLobbyAssets(),
      profile,
      store
    );
    void lobby.show({
      firstRun: false,
      onClassConfirmed: () => undefined,
      onGuildTokenBackpackExpansion: () => 'Token da Guilda insuficiente.',
      onHotkeysChanged: () => undefined,
      onAutoBasicAttackChanged: () => undefined,
      onBlacksmithLicensePurchase: () => ({ message: '' }),
      onBlacksmithCraft: () => ({ message: '' }),
    });

    // The popup does not exist until the player asks for it.
    expect(document.querySelector('[data-expansion-notice]')).toBeNull();

    document.querySelector<HTMLButtonElement>('[data-expand-backpack]')!.click();

    const notice = document.querySelector<HTMLElement>('[data-expansion-notice]')!;
    expect(notice).not.toBeNull();
    expect(notice.classList.contains('hidden')).toBe(false);
    expect(notice.textContent).toContain('30 Token da Guilda ou 5 CM');
    lobby.dispose();
  });

  it('only opens the shared action popover when a backpack item is clicked', () => {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const profile = createDefaultPlayerProfile();
    const store = InventoryStore.fromProfile(profile);
    const lobby = new LobbyScreen(
      createLobbyRenderer(),
      document.createElement('canvas'),
      createLobbyAssets(),
      profile,
      store
    );
    void lobby.show({
      firstRun: false,
      onClassConfirmed: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
      onHotkeysChanged: () => undefined,
      onAutoBasicAttackChanged: () => undefined,
      onBlacksmithLicensePurchase: () => ({ message: '' }),
      onBlacksmithCraft: () => ({ message: '' }),
    });

    const swordSlot = document.querySelector<HTMLButtonElement>('[data-lobby-inventory-index="0"]');
    expect(swordSlot).not.toBeNull();
    swordSlot!.click();

    const popover = document.getElementById('lobby-item-actions')!;
    expect(popover.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('lobby-item-actions-title')?.textContent)
      .toBe('Espada do Recruta');
    expect(store.snapshot().equipment.primaryWeapon).toBeNull();
    expect(store.snapshot().backpack).toEqual([{ itemId: 'starter-sword', quantity: 1 }]);

    lobby.dispose();
  });

  it('equips from the popover only after the Equipar action is clicked', () => {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const profile = createDefaultPlayerProfile();
    const store = InventoryStore.fromProfile(profile);
    const lobby = new LobbyScreen(
      createLobbyRenderer(),
      document.createElement('canvas'),
      createLobbyAssets(),
      profile,
      store
    );
    let inventoryChanges = 0;
    void lobby.show({
      firstRun: false,
      onClassConfirmed: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
      onHotkeysChanged: () => undefined,
      onAutoBasicAttackChanged: () => undefined,
      onLobbyInventoryChanged: () => { inventoryChanges += 1; },
      onBlacksmithLicensePurchase: () => ({ message: '' }),
      onBlacksmithCraft: () => ({ message: '' }),
    });

    document.querySelector<HTMLButtonElement>('[data-lobby-inventory-index="0"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-item-action="equip"]')?.click();

    expect(store.snapshot().equipment.primaryWeapon).toBe('starter-sword');
    expect(store.snapshot().backpack).toEqual([]);
    expect(inventoryChanges).toBe(1);
    expect(document.getElementById('lobby-item-actions')?.classList.contains('hidden')).toBe(true);
    lobby.dispose();
  });

  it('returns one equipped sword to the backpack without duplicating it', () => {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const profile = createDefaultPlayerProfile();
    const store = InventoryStore.fromProfile(profile);
    const lobby = new LobbyScreen(createLobbyRenderer(), document.createElement('canvas'), createLobbyAssets(), profile, store);
    void lobby.show({
      firstRun: false,
      onClassConfirmed: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
      onHotkeysChanged: () => undefined,
      onAutoBasicAttackChanged: () => undefined,
      onLobbyInventoryChanged: () => undefined,
      onBlacksmithLicensePurchase: () => ({ message: '' }),
      onBlacksmithCraft: () => ({ message: '' }),
    });

    for (let cycle = 0; cycle < 3; cycle += 1) {
      document.querySelector<HTMLButtonElement>('[data-lobby-inventory-index="0"]')?.click();
      document.querySelector<HTMLButtonElement>('[data-item-action="equip"]')?.click();
      document.querySelector<HTMLButtonElement>('[data-lobby-equipped-slot="primaryWeapon"]')?.click();
      document.querySelector<HTMLButtonElement>('[data-item-action="equip"]')?.click();
    }

    expect(store.snapshot().equipment.weapon).toBeNull();
    expect(store.snapshot().equipment.primaryWeapon).toBeNull();
    expect(store.snapshot().backpack).toEqual([{ itemId: 'starter-sword', quantity: 1 }]);
    lobby.dispose();
  });

  it('destroy requires explicit confirmation and removes only after Confirmar', () => {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const profile = createDefaultPlayerProfile();
    const store = InventoryStore.fromProfile(profile);
    const lobby = new LobbyScreen(
      createLobbyRenderer(),
      document.createElement('canvas'),
      createLobbyAssets(),
      profile,
      store
    );
    void lobby.show({
      firstRun: false,
      onClassConfirmed: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
      onHotkeysChanged: () => undefined,
      onAutoBasicAttackChanged: () => undefined,
      onBlacksmithLicensePurchase: () => ({ message: '' }),
      onBlacksmithCraft: () => ({ message: '' }),
    });

    document.querySelector<HTMLButtonElement>('[data-lobby-inventory-index="0"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-item-action="destroy"]')?.click();

    const confirmDialog = document.getElementById('lobby-item-destroy-confirm')!;
    expect(confirmDialog.classList.contains('hidden')).toBe(false);
    expect(store.snapshot().backpack).toEqual([{ itemId: 'starter-sword', quantity: 1 }]);

    document.querySelector<HTMLButtonElement>('[data-destroy-confirm]')?.click();

    expect(store.snapshot().backpack).toEqual([]);
    expect(confirmDialog.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('lobby-item-actions')?.classList.contains('hidden')).toBe(true);
    lobby.dispose();
  });

  it('cancel keeps the item and closes only the confirmation', () => {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const profile = createDefaultPlayerProfile();
    const store = InventoryStore.fromProfile(profile);
    const lobby = new LobbyScreen(
      createLobbyRenderer(),
      document.createElement('canvas'),
      createLobbyAssets(),
      profile,
      store
    );
    void lobby.show({
      firstRun: false,
      onClassConfirmed: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
      onHotkeysChanged: () => undefined,
      onAutoBasicAttackChanged: () => undefined,
      onBlacksmithLicensePurchase: () => ({ message: '' }),
      onBlacksmithCraft: () => ({ message: '' }),
    });

    document.querySelector<HTMLButtonElement>('[data-lobby-inventory-index="0"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-item-action="destroy"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-destroy-cancel]')?.click();

    expect(store.snapshot().backpack).toEqual([{ itemId: 'starter-sword', quantity: 1 }]);
    expect(document.getElementById('lobby-item-destroy-confirm')?.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('lobby-item-actions')?.classList.contains('hidden')).toBe(false);
    lobby.dispose();
  });

  it('toggles the contextual menu closed when the same item is clicked twice', () => {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const profile = createDefaultPlayerProfile();
    const store = InventoryStore.fromProfile(profile);
    const lobby = new LobbyScreen(
      createLobbyRenderer(),
      document.createElement('canvas'),
      createLobbyAssets(),
      profile,
      store
    );
    void lobby.show({
      firstRun: false,
      onClassConfirmed: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
      onHotkeysChanged: () => undefined,
      onAutoBasicAttackChanged: () => undefined,
      onBlacksmithLicensePurchase: () => ({ message: '' }),
      onBlacksmithCraft: () => ({ message: '' }),
    });

    const slot = document.querySelector<HTMLButtonElement>('[data-lobby-inventory-index="0"]')!;
    slot.click();
    expect(document.getElementById('lobby-item-actions')?.classList.contains('hidden')).toBe(false);

    slot.click();
    expect(document.getElementById('lobby-item-actions')?.classList.contains('hidden')).toBe(true);
    expect(store.snapshot().backpack).toEqual([{ itemId: 'starter-sword', quantity: 1 }]);
    lobby.dispose();
  });

  it('shows a temporary development notice when Aprimorar is chosen', () => {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const profile = createDefaultPlayerProfile();
    const store = InventoryStore.fromProfile(profile);
    const lobby = new LobbyScreen(
      createLobbyRenderer(),
      document.createElement('canvas'),
      createLobbyAssets(),
      profile,
      store
    );
    void lobby.show({
      firstRun: false,
      onClassConfirmed: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
      onHotkeysChanged: () => undefined,
      onAutoBasicAttackChanged: () => undefined,
      onBlacksmithLicensePurchase: () => ({ message: '' }),
      onBlacksmithCraft: () => ({ message: '' }),
    });

    document.querySelector<HTMLButtonElement>('[data-lobby-inventory-index="0"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-item-action="upgrade"]')?.click();

    expect(document.getElementById('lobby-status')?.textContent)
      .toContain('aprimoramento em desenvolvimento');
    expect(store.snapshot().backpack).toEqual([{ itemId: 'starter-sword', quantity: 1 }]);
    expect(document.getElementById('lobby-item-actions')?.classList.contains('hidden')).toBe(true);
    lobby.dispose();
  });

  /** Mounts the lobby over a specific backpack so kind filtering can be tested. */
  function mountLobbyWithBackpack(backpack: InventoryStack[]): {
    lobby: LobbyScreen;
    store: InventoryStore;
  } {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const profile = createDefaultPlayerProfile();
    profile.backpack = backpack;
    const store = InventoryStore.fromProfile(profile);
    const lobby = new LobbyScreen(
      createLobbyRenderer(),
      document.createElement('canvas'),
      createLobbyAssets(),
      profile,
      store
    );
    void lobby.show({
      firstRun: false,
      onClassConfirmed: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
      onHotkeysChanged: () => undefined,
      onAutoBasicAttackChanged: () => undefined,
      onLobbyInventoryChanged: () => undefined,
      onBlacksmithLicensePurchase: () => ({ message: '' }),
      onBlacksmithCraft: () => ({ message: '' }),
    });
    return { lobby, store };
  }

  it('offers only Destruir for a material in the backpack', () => {
    const { lobby, store } = mountLobbyWithBackpack([{ itemId: 'runic-crystal', quantity: 4 }]);

    document.querySelector<HTMLButtonElement>('[data-lobby-inventory-index="0"]')?.click();

    const equip = document.querySelector<HTMLButtonElement>('[data-item-action="equip"]')!;
    const upgrade = document.querySelector<HTMLButtonElement>('[data-item-action="upgrade"]')!;
    const destroy = document.querySelector<HTMLButtonElement>('[data-item-action="destroy"]')!;
    // Materials are not wearable: equip/upgrade must not even be offered.
    expect(equip.hidden).toBe(true);
    expect(upgrade.hidden).toBe(true);
    expect(destroy.hidden).toBe(false);
    expect(destroy.disabled).toBe(false);
    // The keyboard/pointer focus must land on an action that is really there.
    expect(document.activeElement).toBe(destroy);
    // No lore and no attributes: the bordered details box must not stay empty.
    expect(document.querySelector<HTMLElement>('.lobby-item-actions__details')?.hidden).toBe(true);

    destroy.click();
    document.querySelector<HTMLButtonElement>('[data-destroy-confirm]')?.click();

    expect(store.snapshot().backpack).toEqual([]);
    lobby.dispose();
  });

  it('offers the full action set for gear and restores it after a material was clicked', () => {
    const { lobby } = mountLobbyWithBackpack([
      { itemId: 'runic-crystal', quantity: 2 },
      { itemId: 'starter-sword', quantity: 1 },
    ]);

    document.querySelector<HTMLButtonElement>('[data-lobby-inventory-index="0"]')?.click();
    expect(document.querySelector<HTMLButtonElement>('[data-item-action="equip"]')?.hidden).toBe(true);

    document.querySelector<HTMLButtonElement>('[data-lobby-inventory-index="1"]')?.click();

    const equip = document.querySelector<HTMLButtonElement>('[data-item-action="equip"]')!;
    const upgrade = document.querySelector<HTMLButtonElement>('[data-item-action="upgrade"]')!;
    const destroy = document.querySelector<HTMLButtonElement>('[data-item-action="destroy"]')!;
    expect(equip.hidden).toBe(false);
    expect(equip.textContent).toBe('Equipar');
    expect(upgrade.hidden).toBe(false);
    expect(destroy.hidden).toBe(false);
    expect(destroy.disabled).toBe(false);
    expect(document.activeElement).toBe(equip);
    // Gear keeps its details box: the sword has lore and an attack value.
    expect(document.querySelector<HTMLElement>('.lobby-item-actions__details')?.hidden).toBe(false);
    lobby.dispose();
  });

  it('shows Desequipar and Aprimorar for worn gear and disables destruction', () => {
    const { lobby } = mountLobbyWithBackpack([{ itemId: 'starter-sword', quantity: 1 }]);

    document.querySelector<HTMLButtonElement>('[data-lobby-inventory-index="0"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-item-action="equip"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-lobby-equipped-slot="primaryWeapon"]')?.click();

    const equip = document.querySelector<HTMLButtonElement>('[data-item-action="equip"]')!;
    expect(equip.hidden).toBe(false);
    expect(equip.textContent).toBe('Desequipar');
    expect(equip.classList.contains('is-unequip')).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('[data-item-action="upgrade"]')?.hidden).toBe(false);
    const destroy = document.querySelector<HTMLButtonElement>('[data-item-action="destroy"]')!;
    expect(destroy.hidden).toBe(false);
    expect(destroy.disabled).toBe(true);
    lobby.dispose();
  });
});
