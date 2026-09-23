import * as THREE from 'three';

/**
 * Handle for one pooled point light. The light itself lives in the scene for
 * the whole run; effects only borrow it and animate intensity/color/position.
 */
export class VFXLightHandle {
  private released = false;

  /** @internal Only VFXLightPool creates handles. */
  public constructor(
    public readonly light: THREE.PointLight,
    private readonly pool: VFXLightPool
  ) {}

  public get isReleased(): boolean {
    return this.released;
  }

  /**
   * Returns the light to the pool with intensity zero. Idempotent: releasing
   * twice (hide + dispose paths) is safe and never double-returns the slot.
   */
  public release(): void {
    if (this.released) return;
    this.released = true;
    this.light.intensity = 0;
    this.pool.releaseHandle(this);
  }

  /** @internal Only VFXLightPool reuses handles. */
  public reuse(): void {
    this.released = false;
  }
}

/**
 * Fixed set of persistent point lights shared by every temporary VFX effect
 * (mage charge/projectile/impact/laser plus enemy shock auras).
 *
 * Why this exists: in three.js the number of point lights in the scene is
 * part of every lit shader's program cache key. Adding or removing a light —
 * even with intensity zero — recompiles ALL lit programs synchronously on the
 * next frame. The old per-effect lights therefore froze the game on the first
 * skill cast (charge/projectile/impact/laser/shock lights all entering the
 * scene) and again whenever an unseen light-count combination appeared.
 *
 * With this pool the light count never changes after construction: effects
 * acquire a slot while visible and only animate intensity/color/position/
 * distance, which are uniforms and never recompile shaders. When every slot
 * is busy, acquire() returns null and the effect renders unlit — the same
 * graceful degradation the old maxTemporaryLights gate provided.
 */
export class VFXLightPool {
  private readonly handles: VFXLightHandle[] = [];
  private freeCount = 0;
  private disposed = false;

  public constructor(
    private readonly scene: THREE.Scene,
    size: number,
    name = 'VFXPooledLight'
  ) {
    const count = Math.max(1, Math.floor(size));
    for (let index = 0; index < count; index += 1) {
      const light = new THREE.PointLight(0xffffff, 0, 4, 2);
      light.name = `${name}${index}`;
      light.castShadow = false;
      light.visible = true;
      scene.add(light);
      this.handles.push(new VFXLightHandle(light, this));
    }
    this.freeCount = this.handles.length;
  }

  public get size(): number {
    return this.handles.length;
  }

  public get availableCount(): number {
    return this.freeCount;
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  public acquire(): VFXLightHandle | null {
    if (this.disposed || this.freeCount <= 0) return null;
    this.freeCount -= 1;
    const handle = this.handles[this.freeCount];
    handle.reuse();
    return handle;
  }

  /** @internal Only VFXLightHandle calls back here. */
  public releaseHandle(handle: VFXLightHandle): void {
    if (this.disposed) return;
    if (this.freeCount >= this.handles.length) return;
    this.handles[this.freeCount] = handle;
    this.freeCount += 1;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const handle of this.handles) {
      handle.light.intensity = 0;
      handle.light.removeFromParent();
    }
    this.handles.length = 0;
    this.freeCount = 0;
  }
}
