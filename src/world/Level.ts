import * as THREE from 'three';
import type { NavigationObstacle } from './NavigationObstacle';
import {
  selectNearestTorchIndices,
  shouldTorchLightBeActive,
} from './ProximityLighting';

const TORCH_LIGHT_POOL_SIZE = 4;

/**
 * Cenário estilo Diablo 2/3: chão de pedra, paredes de dungeon,
 * pilares decorativos, tochas com luz dinâmica e plataforma do boss.
 */
export class Level {
  public group = new THREE.Group();
  public groundMeshes: THREE.Object3D[] = [];
  public readonly navigationObstacles: NavigationObstacle[] = [];

  private torchLights: THREE.PointLight[] = [];
  private torchVisuals: { flame: THREE.Mesh; baseIntensity: number; active: boolean }[] = [];
  private activeTorchIndices: number[] = [];
  private size = 50;

  constructor() {
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

  public getBossSpawnPoint(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -18);
  }

  /** Spawns de inimigos: bordas/cantos do cenário — eles vêm "de fora" para dentro. */
  public getEnemySpawnPoints(): THREE.Vector3[] {
    const half = this.size / 2 - 1.5;
    return [
      // cantos
      new THREE.Vector3(-half + 2, 0, -half + 2),
      new THREE.Vector3(half - 2, 0, -half + 2),
      new THREE.Vector3(-half + 2, 0, half - 2),
      new THREE.Vector3(half - 2, 0, half - 2),
      // meio das bordas
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

  /**
   * Posições de spawn dos lacaios/monstros que lutam ao lado do Dragonic Overlord.
   * Suporta até 10 monstros (5 guardiões na linha de frente e 5 arqueiros na retaguarda/flancos).
   */
  public getFinalBattleMinionSpawnPoints(count = 10): THREE.Vector3[] {
    const points: THREE.Vector3[] = [
      // Linha de frente / flanco próximo (guardiões ou monstros normais)
      new THREE.Vector3(-6, 0, -14),
      new THREE.Vector3(-3, 0, -12),
      new THREE.Vector3(0, 0, -11),
      new THREE.Vector3(3, 0, -12),
      new THREE.Vector3(6, 0, -14),
      // Linha de trás / flancos abertos (arqueiros)
      new THREE.Vector3(-9, 0, -18),
      new THREE.Vector3(-5, 0, -8),
      new THREE.Vector3(0, 0, -7),
      new THREE.Vector3(5, 0, -8),
      new THREE.Vector3(9, 0, -18),
    ];
    return points.slice(0, Math.max(0, count));
  }

  public update(time: number, playerPosition?: THREE.Vector3) {
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
