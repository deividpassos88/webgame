import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const MODEL_PATH = '/blacksmith/ferreiro.glb';
const DRACO_DECODER_PATH = '/draco/';
const PARTICLE_COUNT = 150;

/**
 * The blacksmith keeps hammering for the whole craft wait, so the clip is
 * stretched to span it. `WORKING_SPEED_MULTIPLIER` is the knob the workshop
 * requested: 2 makes the "trabalhando" loop run twice as fast as before.
 */
const FORGE_WORK_SECONDS = 15;
const WORKING_SPEED_MULTIPLIER = 2;
const WORKING_ANIMATION_SECONDS = FORGE_WORK_SECONDS / WORKING_SPEED_MULTIPLIER;

/** How many embers the anvil throws per second while the smith is hammering. */
const EMBER_SPAWN_RATE = 210;
/** Seconds between hammer strikes; every strike gets an extra burst. */
const STRIKE_INTERVAL_SECONDS = 0.92;
const STRIKE_BURST = 34;
const SPARK_LIFETIME_MIN = 0.42;
const SPARK_LIFETIME_MAX = 0.98;
const SPARK_GRAVITY = 1.45;

/** Hot-to-cool ember palette, in linear-ish 0..1 RGB. */
const EMBER_PALETTE: readonly (readonly [number, number, number])[] = [
  [1, 0.95, 0.74],
  [1, 0.74, 0.26],
  [1, 0.45, 0.09],
  [1, 0.24, 0.05],
];

export type BlacksmithForgeAnimation = 'idle' | 'working' | 'delivery';

/**
 * Owns the small WebGL scene used by the workshop. It deliberately has its
 * own renderer so it can live above the lobby's character renderer.
 */
export class BlacksmithForgePresentation {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(31, 1, 0.1, 30);
  private readonly mixerClock = new THREE.Clock();
  private readonly resizeObserver?: ResizeObserver;
  private readonly particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  private readonly particleColors = new Float32Array(PARTICLE_COUNT * 3);
  private readonly particleBaseColors = new Float32Array(PARTICLE_COUNT * 3);
  private readonly particleLifetimes = new Float32Array(PARTICLE_COUNT);
  private readonly particleAges = new Float32Array(PARTICLE_COUNT);
  private readonly particleVelocities = Array.from({ length: PARTICLE_COUNT }, () => new THREE.Vector3());
  private readonly particleGeometry = new THREE.BufferGeometry();
  private readonly handPosition = new THREE.Vector3();
  private readonly target = new THREE.Vector3(0, 1.88, 0);
  private readonly fireLight = new THREE.PointLight(0xff7628, 0, 5.4);
  private readonly glowTexture: THREE.Texture;
  private readonly sparkGlow: THREE.Sprite;
  private readonly particles: THREE.Points;
  private mixer?: THREE.AnimationMixer;
  private model?: THREE.Group;
  private hand?: THREE.Object3D;
  private hammer?: THREE.Object3D;
  private readonly actions = new Map<BlacksmithForgeAnimation, THREE.AnimationAction>();
  private currentAction?: THREE.AnimationAction;
  private currentAnimation: BlacksmithForgeAnimation = 'idle';
  private targetYaw = 0.22;
  private frameId: number | null = null;
  private lastTimestamp = 0;
  private observedHost?: HTMLElement;
  private disposed = false;
  private emberBudget = 0;
  private lastStrikeIndex = -1;
  private strikeFlash = 0;

  public static create(): BlacksmithForgePresentation | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    try {
      const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (!context) return null;
      const renderer = new THREE.WebGLRenderer({
        canvas,
        context,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
      return new BlacksmithForgePresentation(canvas, renderer);
    } catch {
      return null;
    }
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: THREE.WebGLRenderer,
  ) {
    this.canvas.className = 'blacksmith-scene__canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);

    this.camera.position.set(0, 1.48, 5.9);
    this.camera.lookAt(this.target);
    this.scene.add(new THREE.HemisphereLight(0x83a7bb, 0x120906, 2.1));
    const key = new THREE.DirectionalLight(0xffd3a2, 3.5);
    key.position.set(-2.4, 4.3, 3.8);
    this.scene.add(key);
    const forgeGlow = new THREE.PointLight(0xff5c1f, 1.3, 6.5);
    forgeGlow.position.set(0.5, 0.75, 1.5);
    this.scene.add(forgeGlow, this.fireLight);

    this.glowTexture = createGlowTexture();
    this.sparkGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.sparkGlow.scale.setScalar(1.2);
    this.sparkGlow.visible = false;
    this.scene.add(this.sparkGlow);

    this.particlePositions.fill(999);
    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.13,
      map: this.glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.particles = new THREE.Points(this.particleGeometry, material);
    this.scene.add(this.particles);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
    }
    void this.loadModel();
    this.frameId = requestAnimationFrame(this.animate);
  }

  public attach(host: HTMLElement): void {
    if (this.disposed) return;
    if (this.observedHost && this.observedHost !== host) this.resizeObserver?.unobserve(this.observedHost);
    host.replaceChildren(this.canvas);
    this.observedHost = host;
    this.resizeObserver?.observe(host);
    this.resize();
  }

  public setAnimation(animation: BlacksmithForgeAnimation): void {
    this.currentAnimation = animation;
    this.targetYaw = animation === 'working' ? Math.PI : 0.22;
    if (this.hammer) this.hammer.visible = animation !== 'delivery';
    const next = this.actions.get(animation);
    if (!next || next === this.currentAction) return;
    this.currentAction?.fadeOut(0.28);
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(
      animation === 'working' ? next.getClip().duration / WORKING_ANIMATION_SECONDS : 1,
    );
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.play();
    next.fadeIn(0.28);
    this.currentAction = next;
  }

  public dispose(): void {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.mixer?.stopAllAction();
    this.particleGeometry.dispose();
    (this.particles.material as THREE.Material).dispose();
    (this.sparkGlow.material as THREE.Material).dispose();
    this.glowTexture.dispose();
    this.renderer.dispose();
  }

  private async loadModel(): Promise<void> {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    dracoLoader.setDecoderConfig({ type: 'wasm' });
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);
    try {
      const gltf = await loader.loadAsync(MODEL_PATH);
      if (this.disposed) return;
      const model = gltf.scene;
      normalizeModel(model);
      model.rotation.y = this.targetYaw;
      this.model = model;
      this.scene.add(model);
      this.canvas.dataset.blacksmithModelReady = 'true';
      this.hand = model.getObjectByName('mixamorig:RightHand')
        ?? model.getObjectByName('mixamorig:LeftHand');
      this.hammer = model.getObjectByName('martelo');
      this.mixer = new THREE.AnimationMixer(model);
      this.addAction('idle', gltf.animations, 'idle');
      this.addAction('working', gltf.animations, 'trabalhando');
      this.addAction('delivery', gltf.animations, 'Entrega');
      this.setAnimation(this.currentAnimation);
    } catch (error) {
      this.canvas.dataset.blacksmithModelError = 'true';
      console.error('Nao foi possivel carregar o modelo 3D do ferreiro.', error);
    } finally {
      dracoLoader.dispose();
    }
  }

  private addAction(
    state: BlacksmithForgeAnimation,
    clips: readonly THREE.AnimationClip[],
    clipName: string,
  ): void {
    const clip = clips.find(({ name }) => name === clipName);
    if (clip && this.mixer) this.actions.set(state, this.mixer.clipAction(clip));
  }

  private readonly animate: FrameRequestCallback = (timestamp) => {
    if (this.disposed) return;
    const delta = this.lastTimestamp === 0 ? 0 : Math.min(0.05, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    this.mixer?.update(delta);
    if (this.model) {
      this.model.rotation.y = THREE.MathUtils.damp(this.model.rotation.y, this.targetYaw, 7, delta);
    }
    this.updateFire(delta, this.mixerClock.getElapsedTime());
    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(this.animate);
  };

  /**
   * Drives the forge fire: a flickering point light, an additive glow sprite
   * and a stream of embers, all anchored to the hammer hand while the smith
   * works the player's armor.
   */
  private updateFire(delta: number, elapsed: number): void {
    const active = this.currentAnimation === 'working' && this.hand;
    if (!active || !this.hand) {
      this.fireLight.intensity = 0;
      this.sparkGlow.visible = false;
      this.sparkGlow.material.opacity = 0;
      this.particleAges.fill(0);
      this.particlePositions.fill(999);
      (this.particleGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      this.clearSparkAnchor();
      return;
    }

    this.hand.getWorldPosition(this.handPosition);
    this.fireLight.position.copy(this.handPosition);
    this.strikeFlash = Math.max(0, this.strikeFlash - delta * 4.2);

    // Every strike throws a denser burst so the sparks read as hammer blows.
    const strikeIndex = Math.floor(elapsed / STRIKE_INTERVAL_SECONDS);
    if (strikeIndex !== this.lastStrikeIndex) {
      this.lastStrikeIndex = strikeIndex;
      this.strikeFlash = 1;
    }

    const flicker = 0.7 + Math.abs(Math.sin(elapsed * 17)) * 0.3;
    this.fireLight.intensity = (3.1 + this.strikeFlash * 5.2) * flicker;
    this.sparkGlow.visible = true;
    this.sparkGlow.position.copy(this.handPosition);
    this.sparkGlow.material.opacity = 0.42 + this.strikeFlash * 0.38;
    this.sparkGlow.scale.setScalar(1.05 + this.strikeFlash * 0.55 + flicker * 0.12);

    this.emberBudget += delta * EMBER_SPAWN_RATE + (this.strikeFlash > 0.98 ? STRIKE_BURST : 0);
    const spawnQuota = Math.min(PARTICLE_COUNT, Math.floor(this.emberBudget));
    this.emberBudget -= spawnQuota;

    let spawned = 0;
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const offset = index * 3;
      if (this.particleAges[index] > 0) {
        this.particleAges[index] -= delta;
        if (this.particleAges[index] <= 0) {
          this.particlePositions[offset + 1] = 999;
          continue;
        }
        const velocity = this.particleVelocities[index];
        velocity.y -= SPARK_GRAVITY * delta;
        velocity.multiplyScalar(1 - Math.min(0.85, 1.9 * delta));
        this.particlePositions[offset] += velocity.x * delta;
        this.particlePositions[offset + 1] += velocity.y * delta;
        this.particlePositions[offset + 2] += velocity.z * delta;
        // Embers cool down as they fly, so the trail fades instead of popping out.
        const life = Math.max(0, this.particleAges[index] / this.particleLifetimes[index]);
        const fade = life * life;
        this.particleColors[offset] = this.particleBaseColors[offset] * fade;
        this.particleColors[offset + 1] = this.particleBaseColors[offset + 1] * fade;
        this.particleColors[offset + 2] = this.particleBaseColors[offset + 2] * fade;
      } else if (spawned < spawnQuota) {
        this.spawnEmber(index, this.strikeFlash);
        spawned += 1;
      }
    }

    (this.particleGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.particleGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.updateSparkAnchor();
  }

  private spawnEmber(index: number, boost: number): void {
    const offset = index * 3;
    this.particlePositions[offset] = this.handPosition.x + (Math.random() - 0.5) * 0.17;
    this.particlePositions[offset + 1] = this.handPosition.y + (Math.random() - 0.5) * 0.13;
    this.particlePositions[offset + 2] = this.handPosition.z + (Math.random() - 0.5) * 0.17;
    const angle = Math.random() * Math.PI * 2;
    const radial = (0.4 + Math.random() * 1.1) * (1 + boost * 0.9);
    this.particleVelocities[index].set(
      Math.cos(angle) * radial,
      0.85 + Math.random() * 1.55 + boost * 0.8,
      Math.sin(angle) * radial * 0.75,
    );
    const lifetime = SPARK_LIFETIME_MIN + Math.random() * (SPARK_LIFETIME_MAX - SPARK_LIFETIME_MIN);
    this.particleLifetimes[index] = lifetime;
    this.particleAges[index] = lifetime;
    const [red, green, blue] = EMBER_PALETTE[Math.floor(Math.random() * EMBER_PALETTE.length)];
    this.particleBaseColors[offset] = red;
    this.particleBaseColors[offset + 1] = green;
    this.particleBaseColors[offset + 2] = blue;
    this.particleColors[offset] = red;
    this.particleColors[offset + 1] = green;
    this.particleColors[offset + 2] = blue;
  }

  /** Publishes the hammer's screen position so the CSS glow can follow it. */
  private updateSparkAnchor(): void {
    const host = this.observedHost;
    if (!host) return;
    const projected = this.handPosition.clone().project(this.camera);
    host.style.setProperty('--forge-spark-x', `${((projected.x * 0.5 + 0.5) * 100).toFixed(2)}%`);
    host.style.setProperty('--forge-spark-y', `${((-projected.y * 0.5 + 0.5) * 100).toFixed(2)}%`);
    host.dataset.forgeSparking = 'true';
  }

  private clearSparkAnchor(): void {
    if (!this.observedHost) return;
    delete this.observedHost.dataset.forgeSparking;
  }

  private resize(): void {
    const host = this.canvas.parentElement;
    if (!host || this.disposed) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}

function createGlowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 248, 224, 1)');
    gradient.addColorStop(0.22, 'rgba(255, 190, 92, 0.72)');
    gradient.addColorStop(0.55, 'rgba(255, 112, 26, 0.26)');
    gradient.addColorStop(1, 'rgba(255, 80, 10, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Pushes the smith forward so he stands in front of the painted bench. */
const MODEL_FORWARD_OFFSET = 0.32;

function normalizeModel(model: THREE.Group): void {
  model.updateMatrixWorld(true);
  const initialBounds = new THREE.Box3().setFromObject(model);
  const initialSize = initialBounds.getSize(new THREE.Vector3());
  const largest = Math.max(initialSize.x, initialSize.y, initialSize.z);
  if (largest > 0) model.scale.setScalar(3.35 / largest);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -bounds.min.y, -center.z + MODEL_FORWARD_OFFSET);
}
