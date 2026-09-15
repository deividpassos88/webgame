import * as THREE from 'three';
import type { EquipmentId } from '../equipment/EquipmentCatalog';

export interface RewardPreviewPort {
  show(availability: Readonly<Record<EquipmentId, boolean>>): void;
  hide(): void;
  dispose(): void;
}

export interface RewardPreviewAssets {
  createWeapon(id: EquipmentId): THREE.Group;
}

interface PreviewRenderer {
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

export interface RewardWeaponPreviewOptions {
  createRenderer?: (canvas: HTMLCanvasElement) => PreviewRenderer;
  scheduleFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
  reducedMotion?: () => boolean;
  canvasFor?: (id: EquipmentId) => HTMLCanvasElement | null;
  fallbackFor?: (id: EquipmentId) => HTMLElement | null;
}

interface PreviewEntry {
  renderer: PreviewRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  pivot: THREE.Group;
  resources: Array<{ dispose(): void }>;
}

const IDS: readonly EquipmentId[] = ['sword', 'axe'];

export class RewardWeaponPreview implements RewardPreviewPort {
  private readonly entries: PreviewEntry[] = [];
  private frameId: number | null = null;
  private visible = false;
  private lastTimestamp = 0;

  constructor(
    private readonly assets: RewardPreviewAssets,
    private readonly options: RewardWeaponPreviewOptions = {}
  ) {}

  public show(availability: Readonly<Record<EquipmentId, boolean>>): void {
    this.hide();
    this.disposeEntries();
    this.visible = true;
    for (const id of IDS) {
      const fallback = this.fallbackFor(id);
      if (!availability[id]) {
        if (fallback) fallback.hidden = false;
        continue;
      }
      try {
        const canvas = this.canvasFor(id);
        if (!canvas) throw new Error(`Canvas da arma não encontrado: ${id}`);
        const entry = this.createEntry(id, canvas);
        this.entries.push(entry);
        if (fallback) fallback.hidden = true;
        entry.renderer.render(entry.scene, entry.camera);
      } catch {
        if (fallback) fallback.hidden = false;
      }
    }
    if (!this.isReducedMotion() && this.entries.length > 0) {
      this.frameId = this.schedule(this.animate);
    }
  }

  public hide(): void {
    this.visible = false;
    if (this.frameId !== null) this.cancel(this.frameId);
    this.frameId = null;
    this.lastTimestamp = 0;
  }

  public dispose(): void {
    this.hide();
    this.disposeEntries();
  }

  private readonly animate: FrameRequestCallback = (timestamp) => {
    if (!this.visible) return;
    const delta = this.lastTimestamp === 0 ? 0 : Math.min(0.1, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    for (const entry of this.entries) {
      entry.pivot.rotation.y += delta * 0.55;
      entry.renderer.render(entry.scene, entry.camera);
    }
    this.frameId = this.schedule(this.animate);
  };

  private createEntry(id: EquipmentId, canvas: HTMLCanvasElement): PreviewEntry {
    const model = this.assets.createWeapon(id);
    const renderer = (this.options.createRenderer ?? ((target) => new THREE.WebGLRenderer({
      canvas: target,
      alpha: true,
      antialias: true,
    })))(canvas);
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    const width = Math.max(1, canvas.clientWidth || 480);
    const height = Math.max(1, canvas.clientHeight || 270);
    renderer.setSize(width, height, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 20);
    camera.position.set(0, 0.15, 4.4);
    const pivot = new THREE.Group();
    pivot.rotation.y = id === 'sword' ? Math.PI / 4 : -Math.PI / 6;
    const resources: Array<{ dispose(): void }> = [];
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry = mesh.geometry.clone();
      resources.push(mesh.geometry);
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        .map((material) => material.clone());
      resources.push(...materials);
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
    });
    normalizeToUnitBox(model, 2.25);
    pivot.add(model);
    scene.add(pivot, new THREE.HemisphereLight(0xdfefff, 0x171006, 2.1));
    const key = new THREE.DirectionalLight(0xffd27a, 3.2);
    key.position.set(2, 3, 4);
    scene.add(key);
    return { renderer, scene, camera, pivot, resources };
  }

  private disposeEntries(): void {
    for (const entry of this.entries) {
      for (const resource of entry.resources) resource.dispose();
      entry.renderer.dispose();
    }
    this.entries.length = 0;
  }

  private canvasFor(id: EquipmentId): HTMLCanvasElement | null {
    return this.options.canvasFor?.(id)
      ?? document.querySelector<HTMLCanvasElement>(`[data-weapon-preview="${id}"]`);
  }

  private fallbackFor(id: EquipmentId): HTMLElement | null {
    return this.options.fallbackFor?.(id)
      ?? document.querySelector<HTMLElement>(
        `[data-equipment-id="${id}"] .reward-preview-fallback`
      );
  }

  private isReducedMotion(): boolean {
    return this.options.reducedMotion?.()
      ?? globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ?? false;
  }

  private schedule(callback: FrameRequestCallback): number {
    return (this.options.scheduleFrame ?? requestAnimationFrame)(callback);
  }

  private cancel(id: number): void {
    (this.options.cancelFrame ?? cancelAnimationFrame)(id);
  }
}

function normalizeToUnitBox(model: THREE.Group, targetSize: number): void {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z);
  if (largest > 0) model.scale.multiplyScalar(targetSize / largest);
  model.updateMatrixWorld(true);
  const normalized = new THREE.Box3().setFromObject(model);
  const center = normalized.getCenter(new THREE.Vector3());
  model.position.sub(center);
}
