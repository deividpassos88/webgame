import * as THREE from 'three';
import { resolveCharacterClips } from '../characters/CharacterAnimations';
import { CharacterAssetStore } from '../characters/CharacterAssetStore';
import {
  getCharacterDefinition,
  getPlayableCharacters,
  type CharacterId,
} from '../characters/CharacterCatalog';
import { CharacterSelectionState } from './CharacterSelectionState';
import { prepareLobbyModel } from './LobbyPresentation';

interface PreviewCharacter {
  container: THREE.Group;
  modelHolder: THREE.Group;
  ringMaterial: THREE.MeshStandardMaterial;
  mixer: THREE.AnimationMixer;
}

export class CharacterSelectScreen {
  private readonly overlay = document.getElementById('character-select')!;
  private readonly confirmButton = document.getElementById(
    'confirm-character'
  ) as HTMLButtonElement;
  private readonly status = document.getElementById('selection-status')!;
  private readonly cards = new Map<CharacterId, HTMLButtonElement>();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly previews = new Map<CharacterId, PreviewCharacter>();
  private readonly cardHandlers = new Map<CharacterId, () => void>();
  private readonly ownedResources: Array<THREE.BufferGeometry | THREE.Material> = [];
  private readonly state: CharacterSelectionState;
  private readonly reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  );

  private frameId = 0;
  private elapsed = 0;
  private resolveSelection: ((id: CharacterId) => void) | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly canvas: HTMLCanvasElement,
    private readonly assets: CharacterAssetStore
  ) {
    const availableIds = getPlayableCharacters().filter((character) => assets.has(character.id)).map(
      (character) => character.id
    );
    this.state = new CharacterSelectionState(availableIds);

    document.querySelectorAll<HTMLButtonElement>('.character-card').forEach((card) => {
      const id = card.dataset.characterId as CharacterId;
      this.cards.set(id, card);
      const handler = () => this.selectCharacter(id);
      this.cardHandlers.set(id, handler);
      card.addEventListener('click', handler);

      if (!this.state.isAvailable(id)) {
        card.disabled = true;
        const detail = card.querySelector<HTMLElement>('.character-status');
        if (detail) detail.textContent = 'Modelo indisponível';
      }
    });

    this.confirmButton.addEventListener('click', this.confirmSelection);
    this.setupScene();
  }

  public select(): Promise<CharacterId> {
    this.overlay.classList.remove('hidden');
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.handleKeyDown);
    this.canvas.addEventListener('pointerdown', this.handleCanvasPointer);
    this.clock.start();
    this.frameId = requestAnimationFrame(this.render);

    const firstAvailable = getPlayableCharacters().find((character) =>
      this.state.isAvailable(character.id)
    );
    if (firstAvailable) {
      this.selectCharacter(firstAvailable.id);
      this.cards.get(firstAvailable.id)?.focus();
    }

    return new Promise<CharacterId>((resolve) => {
      this.resolveSelection = resolve;
    });
  }

  public dispose() {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.canvas.removeEventListener('pointerdown', this.handleCanvasPointer);
    this.cards.forEach((card, id) => {
      const handler = this.cardHandlers.get(id);
      if (handler) card.removeEventListener('click', handler);
    });
    this.confirmButton.removeEventListener('click', this.confirmSelection);
    this.previews.forEach((preview) => preview.mixer.stopAllAction());
    this.ownedResources.forEach((resource) => resource.dispose());
    this.overlay.classList.add('hidden');
    this.scene.clear();
  }

  private setupScene() {
    this.scene.background = new THREE.Color(0x11130f);
    this.scene.fog = new THREE.Fog(0x11130f, 7, 15);

    const ambient = new THREE.HemisphereLight(0xe8dcc7, 0x292d25, 1.6);
    this.scene.add(ambient);

    const fireLight = new THREE.PointLight(0xc66b3d, 18, 9, 2);
    fireLight.position.set(0, 3.8, 2.5);
    this.scene.add(fireLight);

    const mossLight = new THREE.DirectionalLight(0x8b9d83, 2.5);
    mossLight.position.set(-5, 6, 4);
    this.scene.add(mossLight);

    const frontLight = new THREE.DirectionalLight(0xe8dcc7, 3.2);
    frontLight.position.set(0, 4, 6);
    this.scene.add(frontLight);

    const floorGeometry = new THREE.CircleGeometry(8, 64);
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x292d25,
        roughness: 0.96,
        metalness: 0.04,
      });
    this.ownedResources.push(floorGeometry, floorMaterial);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.19;
    floor.receiveShadow = true;
    this.scene.add(floor);

    for (const definition of getPlayableCharacters()) {
      if (!this.assets.has(definition.id)) continue;
      this.addCharacterPreview(definition.id);
    }
  }

  private addCharacterPreview(id: CharacterId) {
    const definition = getCharacterDefinition(id);
    const container = new THREE.Group();
    container.userData.characterId = id;

    const pedestalGeometry = new THREE.CylinderGeometry(0.92, 1.08, 0.22, 48);
    const pedestalMaterial = new THREE.MeshStandardMaterial({
        color: 0x292d25,
        roughness: 0.72,
        metalness: 0.3,
      });
    this.ownedResources.push(pedestalGeometry, pedestalMaterial);
    const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
    pedestal.position.y = -0.08;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    container.add(pedestal);

    const ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x606c38,
      emissive: 0x606c38,
      emissiveIntensity: 0.3,
      roughness: 0.35,
      metalness: 0.65,
    });
    const ringGeometry = new THREE.TorusGeometry(0.94, 0.035, 12, 64);
    this.ownedResources.push(ringGeometry, ringMaterial);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.055;
    container.add(ring);

    const model = this.assets.createModel(id, 'lobby');
    prepareLobbyModel(model);
    model.scale.setScalar(definition.previewScale);
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -bounds.min.y, -center.z);

    const modelHolder = new THREE.Group();
    modelHolder.position.y = definition.previewYOffset ?? 0;
    modelHolder.add(model);
    modelHolder.userData.characterId = id;
    container.add(modelHolder);

    const mixer = new THREE.AnimationMixer(model);
    const lobbyIdleNames = new Set([
      definition.clipMap.idle,
      'idle',
      ...(definition.clipAliases?.idle ?? []),
    ].filter((name): name is string => Boolean(name)));
    const lobbyIdle = this.assets.getAnimations(id, 'lobby').find((clip) =>
      lobbyIdleNames.has(clip.name)
    );
    const idle = lobbyIdle ?? resolveCharacterClips(id, this.assets).idle;
    if (idle) mixer.clipAction(idle).play();

    this.previews.set(id, { container, modelHolder, ringMaterial, mixer });
    this.scene.add(container);
  }

  private selectCharacter(id: CharacterId) {
    if (!this.state.select(id)) return;
    const selected = getCharacterDefinition(id);
    this.status.textContent = `${selected.name} selecionado`;
    this.confirmButton.disabled = false;

    this.cards.forEach((card, cardId) => {
      const active = cardId === id;
      card.classList.toggle('is-selected', active);
      card.setAttribute('aria-pressed', String(active));
    });

    this.previews.forEach((preview, previewId) => {
      const active = previewId === id;
      preview.ringMaterial.color.setHex(active ? 0xc08e3a : 0x606c38);
      preview.ringMaterial.emissive.setHex(active ? 0xc08e3a : 0x606c38);
      preview.ringMaterial.emissiveIntensity = active ? 1.6 : 0.3;
      preview.modelHolder.position.z = active ? 0.32 : 0;
      preview.modelHolder.scale.setScalar(active ? 1.06 : 1);
    });
  }

  private confirmSelection = () => {
    const selected = this.state.confirm();
    if (!selected || !this.resolveSelection) return;
    const resolve = this.resolveSelection;
    this.resolveSelection = null;
    this.dispose();
    resolve(selected);
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    let next: CharacterId | null = null;
    if (key === 'arrowright' || key === 'd') next = this.state.move(1);
    if (key === 'arrowleft' || key === 'a') next = this.state.move(-1);
    if (next) {
      event.preventDefault();
      this.selectCharacter(next);
      this.cards.get(next)?.focus();
    } else if (key === 'enter') {
      const target = event.target;
      if (target instanceof HTMLButtonElement && target.classList.contains('character-card')) {
        event.preventDefault();
        const id = target.dataset.characterId as CharacterId;
        if (this.state.selectedId === id) this.confirmSelection();
        else this.selectCharacter(id);
        return;
      }
      if (!(target instanceof HTMLButtonElement)) this.confirmSelection();
    }
  };

  private handleCanvasPointer = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const roots = Array.from(this.previews.values()).map((preview) => preview.container);
    const hit = this.raycaster.intersectObjects(roots, true)[0];
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object && !object.userData.characterId) object = object.parent;
    if (object?.userData.characterId) {
      this.selectCharacter(object.userData.characterId as CharacterId);
    }
  };

  private resize = () => {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const aspect = width / height;
    this.camera.aspect = aspect;
    this.camera.position.set(0, 2.15, aspect < 0.8 ? 9.4 : 7.2);
    this.camera.lookAt(0, 1.05, 0);
    this.camera.updateProjectionMatrix();

    const ids = getPlayableCharacters()
      .map((character) => character.id)
      .filter((id) => this.previews.has(id));
    const separation = aspect < 0.8 ? 0.82 : 1.65;
    const origin = ((ids.length - 1) * separation) / 2;
    ids.forEach((id, index) => {
      this.previews.get(id)?.container.position.set(index * separation - origin, 0, 0);
    });
  };

  private render = () => {
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.elapsed += delta;
    this.previews.forEach((preview) => {
      preview.mixer.update(delta);
      preview.modelHolder.rotation.y = this.reducedMotion.matches
        ? 0
        : Math.sin(this.elapsed * 0.45) * 0.22;
    });
    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(this.render);
  };
}
