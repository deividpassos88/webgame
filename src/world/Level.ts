import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { NavigationObstacle } from './NavigationObstacle';
import {
  selectNearestTorchIndices,
  shouldTorchLightBeActive,
} from './ProximityLighting';
import { Logger } from '../utils/Logger';

const TORCH_LIGHT_POOL_SIZE = 4;
const DRACO_DECODER_PATH = '/draco/';

// Prioridade de cenários: tenta cenario3.glb primeiro (teste do usuário), depois fallback procedural
export const SCENARIO_MODEL_PATHS = [
  '/models/cenario3.glb',
  '/models/cenario3.glb', // duplicate intentional for cache bust? keep one
] as const;

export const PRIMARY_SCENARIO_PATH = '/models/cenario3.glb';

function createScenarioLoader(): GLTFLoader {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  dracoLoader.setDecoderConfig({ type: 'wasm' });
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

/**
 * Cenário estilo Diablo 2/3: chão de pedra, paredes de dungeon,
 * pilares decorativos, tochas com luz dinâmica e plataforma do boss.
 * Agora suporta cenário customizado via GLB (cenario3.glb) para teste.
 */
export class Level {
  public group = new THREE.Group();
  public groundMeshes: THREE.Object3D[] = [];
  public readonly navigationObstacles: NavigationObstacle[] = [];

  private torchLights: THREE.PointLight[] = [];
  private torchVisuals: { flame: THREE.Mesh; baseIntensity: number; active: boolean }[] = [];
  private activeTorchIndices: number[] = [];
  private size = 50;
  private scenarioLoaded = false;
  private scenarioPath: string | null = null;
  private customBounds: THREE.Box3 | null = null;

  constructor() {
    this.buildProcedural();
  }

  private buildProcedural() {
    this.group.clear();
    this.groundMeshes = [];
    this.navigationObstacles.length = 0;
    this.torchLights = [];
    this.torchVisuals = [];
    this.activeTorchIndices = [];
    this.size = 50;
    this.buildGround();
    this.buildWalls();
    this.buildPillars();
    this.buildTorches();
    this.buildBossPlatform();
  }

  private makeStoneTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#3a3530';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 400; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = Math.random() * 2 + 0.5;
      const shade = Math.random() * 40 - 20;
      ctx.fillStyle = `rgba(${50 + shade},${45 + shade},${40 + shade},0.5)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    const tile = 64;
    for (let x = 0; x <= 256; x += tile) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    for (let y = 0; y <= 256; y += tile) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(this.size / 4, this.size / 4);
    return texture;
  }

  private buildGround() {
    const texture = this.makeStoneTexture();
    const geometry = new THREE.PlaneGeometry(this.size, this.size);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.95,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.isGround = true;
    this.group.add(ground);
    this.groundMeshes.push(ground);
  }

  private buildWalls() {
    const wallHeight = 4.5;
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2b2620,
      roughness: 0.9,
    });
    const half = this.size / 2;

    const wallDefs = [
      { pos: [0, wallHeight / 2, -half], size: [this.size, wallHeight, 1] },
      { pos: [0, wallHeight / 2, half], size: [this.size, wallHeight, 1] },
      { pos: [-half, wallHeight / 2, 0], size: [1, wallHeight, this.size] },
      { pos: [half, wallHeight / 2, 0], size: [1, wallHeight, this.size] },
    ];

    for (const def of wallDefs) {
      const geo = new THREE.BoxGeometry(def.size[0], def.size[1], def.size[2]);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(def.pos[0], def.pos[1], def.pos[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  private buildPillars() {
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x4a4038,
      roughness: 0.8,
    });
    const positions: [number, number][] = [
      [-18, -18], [18, -18], [-18, 18], [18, 18],
      [-18, 0], [18, 0], [0, -18],
    ];

    for (const [x, z] of positions) {
      this.navigationObstacles.push({ x, z, radius: 0.9 });
      const geo = new THREE.CylinderGeometry(0.6, 0.7, 5, 8);
      const pillar = new THREE.Mesh(geo, pillarMat);
      pillar.position.set(x, 2.5, z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.group.add(pillar);

      const capGeo = new THREE.BoxGeometry(1.6, 0.4, 1.6);
      const cap = new THREE.Mesh(capGeo, pillarMat);
      cap.position.set(x, 5.2, z);
      cap.castShadow = true;
      this.group.add(cap);
    }
  }

  private buildTorches() {
    const positions: [number, number, number][] = [
      [-24.3, 2.2, -12], [-24.3, 2.2, 12],
      [24.3, 2.2, -12], [24.3, 2.2, 12],
      [-12, 2.2, -24.3], [12, 2.2, -24.3],
      [-12, 2.2, 24.3], [12, 2.2, 24.3],
      [-20.3, 2.2, -4], [20.3, 2.2, -4],
    ];

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1a1410 });

    for (const [x, y, z] of positions) {
      const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x, y, z);
      this.group.add(pole);

      const flameGeo = new THREE.SphereGeometry(0.12, 8, 8);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(x, y + 0.6, z);
      this.group.add(flame);

      this.torchVisuals.push({ flame, baseIntensity: 3, active: false });
    }

    for (let index = 0; index < TORCH_LIGHT_POOL_SIZE; index++) {
      const light = new THREE.PointLight(0xff6a1a, 0, 9, 2);
      light.position.copy(this.torchVisuals[index].flame.position);
      this.group.add(light);
      this.torchLights.push(light);
    }
  }

  private buildBossPlatform() {
    const geo = new THREE.CylinderGeometry(6, 6.4, 0.3, 32);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a1010,
      roughness: 0.7,
      emissive: 0x330000,
      emissiveIntensity: 0.3,
    });
    const platform = new THREE.Mesh(geo, mat);
    platform.position.set(0, 0.15, -14);
    platform.receiveShadow = true;
    this.group.add(platform);
  }

  /**
   * Tenta carregar cenário customizado (cenario3.glb). Se falhar, mantém procedural.
   * Deve ser chamado antes de adicionar o level à cena.
   */
  public async loadScenario(path: string = PRIMARY_SCENARIO_PATH): Promise<boolean> {
    const loader = createScenarioLoader();
    try {
      Logger.info('Level', `Tentando carregar cenário customizado: ${path}`);
      const gltf = await loader.loadAsync(path);
      const scene = gltf.scene;

      // Prepara materiais: sombras, etc
      const box = new THREE.Box3();
      const meshes: THREE.Object3D[] = [];
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          // Marca tudo como chão potencial para raycast de movimento
          mesh.userData.isGround = true;
          meshes.push(mesh);
          // Se o material não tem roughness, garante um default
          if ((mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (mat.roughness === undefined) mat.roughness = 0.8;
          }
          box.expandByObject(mesh);
        }
      });

      if (meshes.length === 0) {
        Logger.warn('Level', `Cenário ${path} não contém meshes, mantendo procedural`);
        return false;
      }

      // Centraliza cenário no 0,0 e ajusta altura para o chão ficar em y=0
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      // Move para que o centro XZ fique em 0,0 e o min Y fique em 0
      scene.position.set(-center.x, -box.min.y, -center.z);

      // Recalcula bounds após reposicionamento
      const newBox = new THREE.Box3().setFromObject(scene);
      this.customBounds = newBox;
      this.size = Math.max(newBox.getSize(new THREE.Vector3()).x, newBox.getSize(new THREE.Vector3()).z, 50);

      // Limpa procedural e adiciona cenário customizado
      this.group.clear();
      this.groundMeshes = [];
      this.navigationObstacles.length = 0;
      this.torchLights = [];
      this.torchVisuals = [];
      this.activeTorchIndices = [];

      this.group.add(scene);
      this.groundMeshes.push(...meshes);
      this.scenarioLoaded = true;
      this.scenarioPath = path;

      // Se o cenário tiver objetos nomeados como "obstacle", usa como bloqueio de navegação
      scene.traverse((obj) => {
        if (obj.name.toLowerCase().includes('obstacle') || obj.name.toLowerCase().includes('colisor') || obj.name.toLowerCase().includes('pillar') || obj.name.toLowerCase().includes('coluna')) {
          const pos = new THREE.Vector3();
          obj.getWorldPosition(pos);
          // Ajusta pela centralização já feita
          this.navigationObstacles.push({ x: pos.x, z: pos.z, radius: 1.0 });
        }
      });

      Logger.info('Level', `Cenário customizado carregado: ${path} | meshes: ${meshes.length} | size: ${this.size.toFixed(1)} | bounds: ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}`);
      return true;
    } catch (error) {
      Logger.warn('Level', `Falha ao carregar cenário ${path}, usando procedural. ${Logger.formatError(error)}`);
      return false;
    }
  }

  public isCustomScenario(): boolean {
    return this.scenarioLoaded;
  }

  public getScenarioPath(): string | null {
    return this.scenarioPath;
  }

  public getBossSpawnPoint(): THREE.Vector3 {
    if (this.customBounds) {
      // No cenário customizado, boss fica mais ao norte (z negativo) dentro dos bounds
      const center = this.customBounds.getCenter(new THREE.Vector3());
      const size = this.customBounds.getSize(new THREE.Vector3());
      // Tenta usar 35% do tamanho em direção norte
      return new THREE.Vector3(0, 0, center.z - size.z * 0.35);
    }
    return new THREE.Vector3(0, 0, -18);
  }

  /** Spawns de inimigos: bordas/cantos do cenário — eles vêm \"de fora\" para dentro. */
  public getEnemySpawnPoints(): THREE.Vector3[] {
    if (this.customBounds) {
      const min = this.customBounds.min;
      const max = this.customBounds.max;
      const pad = 1.5;
      return [
        new THREE.Vector3(min.x + pad, 0, min.z + pad),
        new THREE.Vector3(max.x - pad, 0, min.z + pad),
        new THREE.Vector3(min.x + pad, 0, max.z - pad),
        new THREE.Vector3(max.x - pad, 0, max.z - pad),
        new THREE.Vector3(0, 0, max.z - pad),
        new THREE.Vector3(0, 0, min.z + pad),
        new THREE.Vector3(min.x + pad, 0, 0),
        new THREE.Vector3(max.x - pad, 0, 0),
      ];
    }
    const half = this.size / 2 - 1.5;
    return [
      new THREE.Vector3(-half + 2, 0, -half + 2),
      new THREE.Vector3(half - 2, 0, -half + 2),
      new THREE.Vector3(-half + 2, 0, half - 2),
      new THREE.Vector3(half - 2, 0, half - 2),
      new THREE.Vector3(0, 0, half - 1.5),
      new THREE.Vector3(0, 0, -half + 1.5),
      new THREE.Vector3(-half + 1.5, 0, 0),
      new THREE.Vector3(half - 1.5, 0, 0),
    ];
  }

  public getWaveSpawnPoints(): THREE.Vector3[] {
    return this.getEnemySpawnPoints();
  }

  public getFinalBattleSpawnLayout(): {
    boss: THREE.Vector3;
    miniBosses: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  } {
    if (this.customBounds) {
      const boss = this.getBossSpawnPoint();
      return {
        boss,
        miniBosses: [
          new THREE.Vector3(boss.x - 5, 0, boss.z + 3),
          new THREE.Vector3(boss.x + 5, 0, boss.z + 3),
          new THREE.Vector3(boss.x - 5, 0, boss.z - 3),
          new THREE.Vector3(boss.x + 5, 0, boss.z - 3),
        ],
      };
    }
    return {
      boss: this.getBossSpawnPoint(),
      miniBosses: [
        new THREE.Vector3(-5, 0, -15),
        new THREE.Vector3(5, 0, -15),
        new THREE.Vector3(-5, 0, -21),
        new THREE.Vector3(5, 0, -21),
      ],
    };
  }

  public getFinalBattleMinionSpawnPoints(count = 10): THREE.Vector3[] {
    if (this.customBounds) {
      const boss = this.getBossSpawnPoint();
      const points: THREE.Vector3[] = [
        new THREE.Vector3(boss.x - 6, 0, boss.z + 4),
        new THREE.Vector3(boss.x - 3, 0, boss.z + 6),
        new THREE.Vector3(boss.x, 0, boss.z + 7),
        new THREE.Vector3(boss.x + 3, 0, boss.z + 6),
        new THREE.Vector3(boss.x + 6, 0, boss.z + 4),
        new THREE.Vector3(boss.x - 9, 0, boss.z),
        new THREE.Vector3(boss.x - 5, 0, boss.z + 10),
        new THREE.Vector3(boss.x, 0, boss.z + 11),
        new THREE.Vector3(boss.x + 5, 0, boss.z + 10),
        new THREE.Vector3(boss.x + 9, 0, boss.z),
      ];
      return points.slice(0, Math.max(0, count));
    }
    const points: THREE.Vector3[] = [
      new THREE.Vector3(-6, 0, -14),
      new THREE.Vector3(-3, 0, -12),
      new THREE.Vector3(0, 0, -11),
      new THREE.Vector3(3, 0, -12),
      new THREE.Vector3(6, 0, -14),
      new THREE.Vector3(-9, 0, -18),
      new THREE.Vector3(-5, 0, -8),
      new THREE.Vector3(0, 0, -7),
      new THREE.Vector3(5, 0, -8),
      new THREE.Vector3(9, 0, -18),
    ];
    return points.slice(0, Math.max(0, count));
  }

  public update(time: number, playerPosition?: THREE.Vector3) {
    // Se cenário customizado, não tem tochas procedurais para animar
    if (this.scenarioLoaded) return;

    for (const torch of this.torchVisuals) {
      torch.flame.scale.setScalar(
        1 + Math.sin(time * 10 + torch.flame.position.z) * 0.15
      );
    }
    if (playerPosition) {
      this.torchVisuals.forEach((torch) => {
        const distance = Math.hypot(
          torch.flame.position.x - playerPosition.x,
          torch.flame.position.z - playerPosition.z
        );
        torch.active = shouldTorchLightBeActive(distance, torch.active);
      });
      const activeIndices = this.torchVisuals
        .map((torch, index) => torch.active ? index : -1)
        .filter((index) => index >= 0);
      this.activeTorchIndices = selectNearestTorchIndices(
        playerPosition,
        activeIndices.map((index) => this.torchVisuals[index].flame.position),
        TORCH_LIGHT_POOL_SIZE
      ).map((index) => activeIndices[index]);
    }
    this.torchLights.forEach((light, poolIndex) => {
      const torchIndex = this.activeTorchIndices[poolIndex];
      if (torchIndex === undefined) {
        light.intensity = 0;
        return;
      }
      const torch = this.torchVisuals[torchIndex];
      light.position.copy(torch.flame.position);
      light.intensity =
        torch.baseIntensity + Math.sin(time * 8 + torch.flame.position.x) * 0.6;
    });
  }
}
