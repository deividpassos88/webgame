import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const MODEL_PATH = '/blacksmith/ferreiro.glb';
const DRACO_DECODER_PATH = '/draco/';
const PARTICLE_COUNT = 58;

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
  private readonly particleVelocities = Array.from({ length: PARTICLE_COUNT }, () => new THREE.Vector3());
  private readonly particleGeometry = new THREE.BufferGeometry();
  private readonly handPosition = new THREE.Vector3();
  private readonly target = new THREE.Vector3(0, 1.88, 0);
  private readonly fireLight = new THREE.PointLight(0xff7628, 0, 4.2);
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

    this.particlePositions.fill(999);
    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffb14a,
      size: 0.085,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
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
    next.setEffectiveTimeScale(animation === 'working' ? next.getClip().duration / 15 : 1);
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
    this.updateFire(delta, timestamp / 1000);
    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(this.animate);
  };

  private updateFire(delta: number, elapsed: number): void {
    const active = this.currentAnimation === 'working' && this.hand;
    if (active && this.hand) {
      this.hand.getWorldPosition(this.handPosition);
      this.fireLight.position.copy(this.handPosition);
      this.fireLight.intensity = 2.4 + Math.sin(elapsed * 19) * 0.75;
      for (let index = 0; index < PARTICLE_COUNT; index += 1) {
        const offset = index * 3;
        const x = this.particlePositions[offset];
        const y = this.particlePositions[offset + 1];
        const z = this.particlePositions[offset + 2];
        const distance = Math.hypot(x - this.handPosition.x, y - this.handPosition.y, z - this.handPosition.z);
        if (distance > 0.68 || x > 900) this.spawnEmber(index);
        this.particlePositions[offset] += this.particleVelocities[index].x * delta;
        this.particlePositions[offset + 1] += this.particleVelocities[index].y * delta;
        this.particlePositions[offset + 2] += this.particleVelocities[index].z * delta;
        this.particleVelocities[index].y -= delta * 0.22;
      }
    } else {
      this.fireLight.intensity = 0;
      this.particlePositions.fill(999);
    }
    (this.particleGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private spawnEmber(index: number): void {
    const offset = index * 3;
    this.particlePositions[offset] = this.handPosition.x + (Math.random() - 0.5) * 0.14;
    this.particlePositions[offset + 1] = this.handPosition.y + (Math.random() - 0.5) * 0.1;
    this.particlePositions[offset + 2] = this.handPosition.z + (Math.random() - 0.5) * 0.14;
    this.particleVelocities[index].set(
      (Math.random() - 0.5) * 0.45,
      0.34 + Math.random() * 0.58,
      (Math.random() - 0.5) * 0.45,
    );
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

function normalizeModel(model: THREE.Group): void {
  model.updateMatrixWorld(true);
  const initialBounds = new THREE.Box3().setFromObject(model);
  const initialSize = initialBounds.getSize(new THREE.Vector3());
  const largest = Math.max(initialSize.x, initialSize.y, initialSize.z);
  if (largest > 0) model.scale.setScalar(3.35 / largest);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -bounds.min.y, -center.z);
}
