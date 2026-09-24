// @vitest-environment happy-dom
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adjustLobbyPreview,
  LobbyScreen,
  lobbyMotionPolicy,
  itemStatSummary,
  MAGE_LOBBY_FACE_LIGHT_SCALE,
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
    <section id="class-select-screen" class="hidden">
      <button id="select-warrior" type="button" data-class-choice="paladin">Guerreiro</button>
      <button id="select-mage" type="button" data-class-choice="mage">Maga</button>
    </section>
    <section id="lobby-screen">
      <button type="button" data-lobby-tab="hero" aria-pressed="true">Herói</button>
      <button type="button" data-lobby-tab="blacksmith" aria-pressed="false">Oficina</button>
      <main class="lobby-hero-stage"><strong data-lobby-class-name>Guerreiro</strong><span data-lobby-class-role></span></main>
      <section data-lobby-panel="hero"><h2 data-lobby-class-panel-name>Guerreiro</h2><dd data-lobby-class-weapon>Espada</dd></section>
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
    outputColorSpace: THREE.LinearSRGBColorSpace,
    shadowMap: { enabled: false, type: THREE.BasicShadowMap },
    capabilities: { getMaxAnisotropy: () => 4 },
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
    has: () => true,
    createModel: () => model.clone(),
    getAnimations: () => [],
    getBoneNames: () => new Set<string>(),
    getBoneRestRotations: () => new Map<string, THREE.Quaternion>(),
    getBoneRestTranslations: () => new Map<string, THREE.Vector3>(),
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
  it('keeps idle animation and continuous rendering on even under reduced motion', () => {
    // Decisao do projeto: o lobby nunca congela, independente do pedido de
    // "movimento reduzido" do SO/navegador.
    expect(lobbyMotionPolicy(true)).toEqual({ animateIdle: true, continuousRender: true });
    expect(lobbyMotionPolicy(false)).toEqual({ animateIdle: true, continuousRender: true });
  });
});

describe('lobby character preparation', () => {
  it('confirms Maga from the first-run class screen and opens the lobby with her preview selected', () => {
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
    let confirmed: string | null = null;
    void lobby.show({
      firstRun: true,
      onClassConfirmed: (id) => { confirmed = id; },
      onGuildTokenBackpackExpansion: () => '',
      onHotkeysChanged: () => undefined,
      onAutoBasicAttackChanged: () => undefined,
      onBlacksmithLicensePurchase: () => ({ message: '' }),
      onBlacksmithCraft: () => ({ message: '' }),
    });

    document.getElementById('select-mage')?.click();

    expect(confirmed).toBe('mage');
    expect(profile.selectedClass).toBe('mage');
    expect(document.getElementById('class-select-screen')?.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('lobby-screen')?.classList.contains('hidden')).toBe(false);
    expect(document.querySelector('[data-lobby-class-name]')?.textContent).toBe('Maga');
    expect(document.querySelector('[data-lobby-class-weapon]')?.textContent).toBe('Cajado Arcano');
    expect(document.querySelector('.lobby-hero-stage')?.getAttribute('aria-label')).toContain('Maga');
    lobby.dispose();
  });

  it('lights the Mage with the Warrior rig and only dims her face', () => {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());

    const mageMaterial = new THREE.MeshPhysicalMaterial({ roughness: 1, metalness: 0 });
    mageMaterial.normalMap = new THREE.Texture();
    const mageMiswiredRoughnessTexture = new THREE.Texture();
    mageMaterial.specularIntensityMap = mageMiswiredRoughnessTexture;
    mageMaterial.specularIntensity = 0.2;
    const warriorMaterial = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    warriorMaterial.normalMap = new THREE.Texture();
    const makeModel = (material: THREE.Material): THREE.Group => {
      const model = new THREE.Group();
      model.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
      return model;
    };
    const assets = {
      has: () => true,
      createModel: (id: string) => makeModel(id === 'mage' ? mageMaterial : warriorMaterial),
      getAnimations: () => [],
      getBoneNames: () => new Set<string>(),
      getBoneRestRotations: () => new Map<string, THREE.Quaternion>(),
      getBoneRestTranslations: () => new Map<string, THREE.Vector3>(),
    } as unknown as CharacterAssetStore;

    const renderer = createLobbyRenderer();
    renderer.capabilities = { getMaxAnisotropy: () => 16 } as THREE.WebGLCapabilities;
    const profile = createDefaultPlayerProfile();
    profile.selectedClass = 'mage';
    const lobby = new LobbyScreen(
      renderer,
      document.createElement('canvas'),
      assets,
      profile,
      InventoryStore.fromProfile(profile)
    );

    expect(mageMaterial.envMapIntensity).toBe(1);
    expect(mageMaterial.roughness).toBe(1);
    expect(mageMaterial.roughnessMap).toBeNull();
    expect(mageMaterial.metalness).toBe(0);
    expect(mageMaterial.color.r).toBe(1);
    expect(mageMaterial.color.g).toBe(1);
    expect(mageMaterial.color.b).toBe(1);
    expect(mageMaterial.normalScale.x).toBe(1);
    expect(mageMaterial.normalScale.y).toBe(1);
    expect(mageMaterial.specularIntensity).toBe(0.2);
    expect(mageMaterial.normalMap.anisotropy).toBe(4);
    const mageLights = (lobby as unknown as {
      lobbyLights: {
        key: THREE.DirectionalLight;
        fill: THREE.DirectionalLight;
        rim: THREE.DirectionalLight;
        ambient: THREE.AmbientLight;
        hemisphere: THREE.HemisphereLight;
      };
    }).lobbyLights;
    expect(mageLights.key.intensity).toBe(5.6);
    expect(mageLights.fill.intensity).toBe(2.4);
    expect(mageLights.rim.intensity).toBe(3.6);
    expect(mageLights.ambient.intensity).toBe(0.8);
    expect(mageLights.hemisphere.intensity).toBe(1.35);

    lobby.dispose();
    mountLobbyRouteMarkup();
    const warriorProfile = createDefaultPlayerProfile();
    warriorProfile.selectedClass = 'paladin';
    const warriorLobby = new LobbyScreen(
      renderer,
      document.createElement('canvas'),
      assets,
      warriorProfile,
      InventoryStore.fromProfile(warriorProfile)
    );

    expect(warriorMaterial.envMapIntensity).toBe(1);
    expect(warriorMaterial.roughness).toBe(1);
    expect(warriorMaterial.roughnessMap).toBeNull();
    expect(warriorMaterial.color.r).toBe(1);
    expect(warriorMaterial.color.g).toBe(1);
    expect(warriorMaterial.color.b).toBe(1);
    expect(warriorMaterial.normalScale.x).toBe(1);
    expect(warriorMaterial.normalScale.y).toBe(1);
    const warriorLights = (warriorLobby as unknown as { lobbyLights: typeof mageLights }).lobbyLights;
    expect(warriorLights.key.intensity).toBe(mageLights.key.intensity);
    expect(warriorLights.rim.intensity).toBe(mageLights.rim.intensity);
    expect(warriorLights.ambient.intensity).toBe(mageLights.ambient.intensity);
    warriorLobby.dispose();
  });

  it('dims only the Mage head and neck and keeps look_around as her only lobby clip', () => {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());

    const material = new THREE.MeshStandardMaterial();
    const hips = new THREE.Bone();
    hips.name = 'mixamorig:Hips';
    const neck = new THREE.Bone();
    neck.name = 'mixamorig:Neck';
    const head = new THREE.Bone();
    head.name = 'mixamorig:Head';
    hips.add(neck);
    neck.add(head);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const vertexCount = geometry.getAttribute('position').count;
    const skinIndex = new THREE.Uint16BufferAttribute(vertexCount * 4, 4);
    const skinWeight = new THREE.Float32BufferAttribute(vertexCount * 4, 4);
    for (let index = 0; index < vertexCount; index += 1) {
      skinIndex.setXYZW(index, 2, 1, 0, 0);
      skinWeight.setXYZW(index, 1, 0, 0, 0);
    }
    geometry.setAttribute('skinIndex', skinIndex);
    geometry.setAttribute('skinWeight', skinWeight);
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.add(hips);
    mesh.bind(new THREE.Skeleton([hips, neck, head]));
    const model = new THREE.Group();
    model.add(mesh);
    const lookAround = new THREE.AnimationClip('look_around', 15.5, []);
    const wait = new THREE.AnimationClip('wait', 6, []);
    const assets = {
      has: () => true,
      createModel: () => model,
      getAnimations: () => [wait, lookAround],
      getBoneNames: () => new Set(['mixamorig:Hips', 'mixamorig:Neck', 'mixamorig:Head']),
      getBoneRestRotations: () => new Map<string, THREE.Quaternion>(),
      getBoneRestTranslations: () => new Map<string, THREE.Vector3>(),
    } as unknown as CharacterAssetStore;
    const profile = createDefaultPlayerProfile();
    profile.selectedClass = 'mage';
    const lobby = new LobbyScreen(
      createLobbyRenderer(),
      document.createElement('canvas'),
      assets,
      profile,
      InventoryStore.fromProfile(profile)
    );

    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\n#include <skinning_vertex>\n',
      fragmentShader: '#include <common>\n#include <opaque_fragment>\n',
    };
    material.onBeforeCompile(
      shader as unknown as Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0],
      {} as THREE.WebGLRenderer
    );
    expect(shader.uniforms.uMageFaceLight?.value).toBe(MAGE_LOBBY_FACE_LIGHT_SCALE);
    expect(shader.uniforms.uMageFaceBones?.value).toEqual(new THREE.Vector2(2, 1));
    expect(shader.fragmentShader).toContain('outgoingLight *= mix(1.0, uMageFaceLight');
    expect(shader.vertexShader).toContain('skinIndex.x - uMageFaceBones.x');
    const idleAction = (lobby as unknown as { fallbackIdleAction: THREE.AnimationAction | null }).fallbackIdleAction;
    expect(idleAction?.getClip().name).toBe('mage:idle');
    expect(idleAction?.getClip().duration).toBeCloseTo(15.5);
    expect((lobby as unknown as { lobbyIdleAction: THREE.AnimationAction | null }).lobbyIdleAction).toBeNull();
    lobby.dispose();
  });

  it('spins the Mage around her own grounded center instead of orbiting the pivot', () => {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const profile = createDefaultPlayerProfile();
    profile.selectedClass = 'mage';
    const lobby = new LobbyScreen(
      createLobbyRenderer(),
      document.createElement('canvas'),
      createLobbyAssets(),
      profile,
      InventoryStore.fromProfile(profile)
    );

    const holder = (lobby as unknown as { modelHolder: THREE.Group }).modelHolder;
    const model = holder.children[0] as THREE.Object3D;
    // The depth framing offset lives on the spin pivot, never inside it:
    // the body center stays exactly on the rotation axis, grounded.
    expect(holder.position.z).toBeCloseTo(-0.42);
    expect(model.position.x).toBeCloseTo(0);
    expect(model.position.z).toBeCloseTo(0);
    holder.updateMatrixWorld(true);
    const before = new THREE.Vector3();
    model.getWorldPosition(before);

    // A half turn must leave her world ground spot untouched: same framing
    // as before, but turning in place like the Guerreiro instead of orbiting.
    holder.rotation.y = Math.PI;
    holder.updateMatrixWorld(true);
    const after = new THREE.Vector3();
    model.getWorldPosition(after);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(after.z).toBeCloseTo(before.z);
    expect(after.z).toBeCloseTo(-0.42);
    lobby.dispose();
  });

  it('keeps the Guerreiro spin pivot at the stage origin', () => {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const profile = createDefaultPlayerProfile();
    profile.selectedClass = 'paladin';
    const lobby = new LobbyScreen(
      createLobbyRenderer(),
      document.createElement('canvas'),
      createLobbyAssets(),
      profile,
      InventoryStore.fromProfile(profile)
    );

    const holder = (lobby as unknown as { modelHolder: THREE.Group }).modelHolder;
    expect(holder.position.z).toBe(0);
    expect((holder.children[0] as THREE.Object3D).position.z).toBeCloseTo(0);
    lobby.dispose();
  });

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

    expect(document.getElementById('start-admin-training')?.classList.contains('hidden')).toBe(true);

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


  it('uses the MODO ADM toggle to make Iniciar partida open the no-monster training run', async () => {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const profile = createDefaultPlayerProfile();
    // O gate de Iniciar partida exige arma equipada desde o primeiro clique.
    profile.equipment.weapon = 'starter-sword';
    profile.equipment.primaryWeapon = 'starter-sword';
    const lobby = new LobbyScreen(
      createLobbyRenderer(),
      document.createElement('canvas'),
      createLobbyAssets(),
      profile,
      InventoryStore.fromProfile(profile)
    );
    let selectedMode: string | null = null;
    const shown = lobby.show({
      firstRun: false,
      onClassConfirmed: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
      onHotkeysChanged: () => undefined,
      onAutoBasicAttackChanged: () => undefined,
      onBlacksmithLicensePurchase: () => ({ message: '' }),
      onBlacksmithCraft: () => ({ message: '' }),
      adminTrainingEnabled: true,
      onRunModeSelected: (mode) => { selectedMode = mode; },
    });

    const toggle = document.getElementById('start-admin-training') as HTMLButtonElement;
    expect(toggle.classList.contains('hidden')).toBe(false);
    expect(toggle.disabled).toBe(false);
    expect(toggle.textContent).toContain('MODO ADM');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    toggle.click();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent).toContain('Ligado');

    document.getElementById('start-game')?.click();
    await shown;

    expect(selectedMode).toBe('admin-training');
  });

  it('keeps Iniciar partida on the normal campaign when MODO ADM stays off', async () => {
    mountLobbyRouteMarkup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const profile = createDefaultPlayerProfile();
    // O gate de Iniciar partida exige arma equipada desde o primeiro clique.
    profile.equipment.weapon = 'starter-sword';
    profile.equipment.primaryWeapon = 'starter-sword';
    const lobby = new LobbyScreen(
      createLobbyRenderer(),
      document.createElement('canvas'),
      createLobbyAssets(),
      profile,
      InventoryStore.fromProfile(profile)
    );
    let selectedMode: string | null = null;
    const shown = lobby.show({
      firstRun: false,
      onClassConfirmed: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
      onHotkeysChanged: () => undefined,
      onAutoBasicAttackChanged: () => undefined,
      onBlacksmithLicensePurchase: () => ({ message: '' }),
      onBlacksmithCraft: () => ({ message: '' }),
      adminTrainingEnabled: true,
      onRunModeSelected: (mode) => { selectedMode = mode; },
    });

    const toggle = document.getElementById('start-admin-training') as HTMLButtonElement;
    toggle.click();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    toggle.click();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    document.getElementById('start-game')?.click();
    await shown;

    expect(selectedMode).toBe('campaign');
  });

  it('blocks Iniciar partida until a weapon is equipped and shows the center notice', async () => {
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
    let selectedMode: string | null = null;
    const shown = lobby.show({
      firstRun: false,
      onClassConfirmed: () => undefined,
      onGuildTokenBackpackExpansion: () => '',
      onHotkeysChanged: () => undefined,
      onAutoBasicAttackChanged: () => undefined,
      onBlacksmithLicensePurchase: () => ({ message: '' }),
      onBlacksmithCraft: () => ({ message: '' }),
      adminTrainingEnabled: true,
      onRunModeSelected: (mode) => { selectedMode = mode; },
    });

    const startButton = document.getElementById('start-game') as HTMLButtonElement;
    expect(startButton.classList.contains('is-weapon-locked')).toBe(true);
    expect(startButton.getAttribute('aria-disabled')).toBe('true');

    startButton.click();
    const notice = document.querySelector('.lobby-start-notice');
    expect(notice?.classList.contains('hidden')).toBe(false);
    expect(notice?.textContent).toBe('Equipe sua arma antes de iniciar a partida.');
    expect(selectedMode).toBeNull();

    // Equipar a arma pela mochila libera o botão e recolhe o aviso.
    document.querySelector<HTMLButtonElement>('[data-lobby-inventory-index="0"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-item-action="equip"]')?.click();

    expect(store.snapshot().equipment.primaryWeapon).toBe('starter-sword');
    expect(startButton.classList.contains('is-weapon-locked')).toBe(false);
    expect(startButton.getAttribute('aria-disabled')).toBe('false');
    expect(notice?.classList.contains('hidden')).toBe(true);

    startButton.click();
    await shown;

    expect(selectedMode).toBe('campaign');
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

  it('prints the strike damage the fight uses, not a decorative attack number', () => {
    const profile = createDefaultPlayerProfile();
    profile.attributes = { ...createDefaultCharacterAttributes(), vitality: 10, attack: 5 };
    const renderStatus = (LobbyScreenModule as unknown as {
      renderLobbyCurrentStatus?: (status: unknown) => string;
    }).renderLobbyCurrentStatus;

    if (typeof renderStatus !== 'function') {
      expect(typeof renderStatus).toBe('function');
      return;
    }

    const statusOf = () =>
      buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot()).currentStatus;
    const unarmed = statusOf();
    // The Attack reading has to be the damage of one strike: it is what the
    // player compares against the floating numbers in the dungeon.
    expect(unarmed.derived.attackDamage).toBe(5);
    expect(renderStatus(unarmed)).toContain('<dt>Ataque</dt><dd>5</dd>');

    profile.equipment.weapon = 'starter-sword';
    profile.equipment.primaryWeapon = 'starter-sword';
    const armed = statusOf();
    // 5 from the novice sword + 1 per allocated attack point (5 points = 5 + 5 = 10).
    expect(armed.derived.attackDamage).toBe(10);
    expect(renderStatus(armed)).toContain('<dt>Ataque</dt><dd>10</dd>');
  });

  it('captions every status with its combat effect', () => {
    const profile = createDefaultPlayerProfile();
    profile.attributes = {
      ...createDefaultCharacterAttributes(),
      vitality: 10,
      attack: 5,
      defense: 15,
      agility: 10,
    };
    const renderStatus = (LobbyScreenModule as unknown as {
      renderLobbyCurrentStatus?: (status: unknown) => string;
    }).renderLobbyCurrentStatus;

    if (typeof renderStatus !== 'function') {
      expect(typeof renderStatus).toBe('function');
      return;
    }

    const status = buildRpgUiViewModel(
      profile,
      InventoryStore.fromProfile(profile).snapshot()
    ).currentStatus;
    const markup = renderStatus(status);
    // Defense 15 = 15/55 of reduction; the caption is what makes "Defesa"
    // readable in combat.
    expect(status.derived.damageReduction).toBeCloseTo(15 / 55);
    expect(markup).toContain('lobby-current-status-hint');
    expect(markup).toContain('+30 vida');
    expect(markup).toContain('dano do golpe');
    expect(markup).toContain(`-${Math.round((15 / 55) * 100)}% do dano`);
    expect(markup).toContain('+4.0% velocidade');
    expect(markup).toContain('0% de chance');
    expect(markup).toContain('100 + 3/Vitalidade');
  });

  it('labels weapon damage as Dano and keeps Ataque for the attribute', () => {
    // The sword grants flat damage, so its card must not promise attribute
    // points the status sheet would never show.
    expect(itemStatSummary(getInventoryItem('starter-sword'))).toBe('Dano +5');
    expect(itemStatSummary(getInventoryItem('common-forged-gloves'))).toBe('Defesa +3 · Agilidade +1');
    expect(itemStatSummary(getInventoryItem('common-forged-gloves-atk'))).toBe('Ataque +4');
    expect(itemStatSummary(getInventoryItem('iron-shard'))).toBe('');
    expect(itemStatSummary(undefined)).toBe('');
  });

  it('adds the equipped weapon bonus to the attack reading in the status sheet', () => {
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
    // Vitality is worth 3 HP a point; without a weapon the attack reading is
    // only what was allocated.
    expect(before).toContain('<dt>Vida máxima</dt><dd>130</dd>');
    expect(before).toContain('<dt>Ataque</dt><dd>5</dd>');

    profile.equipment.weapon = 'starter-sword';
    profile.equipment.primaryWeapon = 'starter-sword';
    const withSword = renderStatus(
      buildRpgUiViewModel(profile, InventoryStore.fromProfile(profile).snapshot()).currentStatus
    );
    // The sword's own 5 damage shows up in the status, exactly as promised.
    expect(withSword).toContain('<dt>Ataque</dt><dd>10</dd>');
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
    // The tier suffix renders in its own span, so the title reads the full name.
    expect(document.getElementById('lobby-item-actions-title')?.textContent)
      .toBe('Sword Novice');
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
