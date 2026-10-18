import * as THREE from 'three';
import {
  ARENA,
  ARENA_CAMERAS,
  arenaBannerPlacements,
  cornerGemPositions,
  createSeededRandom,
  brazierPositions,
  enemySpawnPoints,
  pillarBannerPlacements,
  plinthPositions,
  standBannerPlacements,
  type BannerPlacement,
} from './CelestialConfig';
import {
  MeshBatch,
  createBannerGeometry,
  createBrazierBowlGeometry,
  createBushGeometry,
  createRockGeometry,
  diamondShape,
  horizontalPlate,
} from './CelestialGeometry';
import { CelestialMaterials } from './CelestialMaterials';
import { CelestialSky } from './CelestialSky';
import { CelestialTribunes } from './CelestialTribunes';
import { makeSkyEnvironmentTexture } from './CelestialTextures';

export type CelestialLightingStyle = 'celestial';

export interface CelestialArenaOptions {
  /** Céu, ilhas e nuvens (desligado em testes de performance). */
  sky?: boolean;
  /** Arquibancadas e multidão. */
  tribunes?: boolean;
  /** Nível de detalhe: reduz sombras e multidão no perfil baixo. */
  quality?: 'high' | 'medium' | 'low';
}

interface SwayingBanner {
  group: THREE.Group;
  baseRotation: number;
  phase: number;
  amplitude: number;
}

interface FlickeringFlame {
  group: THREE.Group;
  phase: number;
  baseScale: number;
}

/**
 * Arena Celeste: piso de mármore com marchetaria dourada, plintos, bandeiras,
 * brasseiros, arquibancadas, céu e ilhas suspensas.
 *
 * A API pública é a mesma do `Level` antigo (group, groundMeshes,
 * navigationObstacles, spawns e update), então o `Game` troca de cenário sem
 * mudar nenhuma regra de combate. Tudo é procedural e determinístico.
 */
export class CelestialArena {
  public readonly group = new THREE.Group();
  public readonly groundMeshes: THREE.Object3D[] = [];
  public readonly navigationObstacles: { x: number; z: number; radius: number }[] = [];
  public readonly lightingStyle: CelestialLightingStyle = 'celestial';

  public readonly layers: {
    floor: THREE.Group;
    inlays: THREE.Group;
    props: THREE.Group;
    banners: THREE.Group;
    tribunes: THREE.Group;
    sky: THREE.Group;
  };

  private readonly materials: CelestialMaterials;
  private readonly sky: CelestialSky | null;
  private readonly tribunes: CelestialTribunes | null;
  private readonly banners: SwayingBanner[] = [];
  private readonly flames: FlickeringFlame[] = [];
  private readonly localMaterials: THREE.Material[] = [];
  private readonly localTextures: THREE.Texture[] = [];
  private readonly quality: 'high' | 'medium' | 'low';
  private environmentTexture: THREE.Texture | null = null;
  private floorMesh: THREE.Mesh | null = null;

  public constructor(options: CelestialArenaOptions = {}) {
    this.quality = options.quality ?? 'high';
    this.group.name = 'celestial-arena';
    this.materials = new CelestialMaterials();

    const floor = new THREE.Group();
    floor.name = 'celestial-floor';
    const inlays = new THREE.Group();
    inlays.name = 'celestial-inlays';
    const props = new THREE.Group();
    props.name = 'celestial-props';
    const banners = new THREE.Group();
    banners.name = 'celestial-banners';
    const tribunes = new THREE.Group();
    tribunes.name = 'celestial-tribunes-layer';
    const sky = new THREE.Group();
    sky.name = 'celestial-sky-layer';

    floor.add(inlays);
    this.group.add(sky, tribunes, floor, props, banners);
    this.layers = { floor, inlays, props, banners, tribunes, sky };

    this.buildFloor(floor);
    this.buildFoundation(floor);
    this.buildPlinths(floor);
    this.buildBorder(inlays);
    this.buildMedallion(inlays);
    this.buildCornerGems(inlays);
    this.buildBraziers(props);
    this.buildBenches(props);
    this.buildBanners(banners);

    this.tribunes = options.tribunes === false ? null : new CelestialTribunes(this.materials);
    if (this.tribunes) tribunes.add(this.tribunes.group);

    this.sky = options.sky === false ? null : new CelestialSky(this.materials);
    if (this.sky) sky.add(this.sky.group);
    this.buildHazeRing(sky);
  }

  // ------------------------------------------------------------------ piso/base

  private cloneWithRepeat(
    material: THREE.MeshStandardMaterial,
    repeatX: number,
    repeatY: number
  ): THREE.MeshStandardMaterial {
    const clone = material.clone();
    if (material.map) {
      const map = material.map.clone();
      map.needsUpdate = true;
      map.repeat.set(repeatX, repeatY);
      clone.map = map;
      this.localTextures.push(map);
    }
    this.localMaterials.push(clone);
    return clone;
  }

  private buildFloor(floor: THREE.Group): void {
    const materials = this.materials;
    const size = ARENA.size;

    const slabMaterial = this.cloneWithRepeat(materials.limestoneBlock, 6, 1);
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(size - 0.04, ARENA.slabThickness, size - 0.04),
      slabMaterial
    );
    slab.position.y = -ARENA.slabThickness / 2 - 0.005;
    slab.castShadow = false;
    slab.receiveShadow = true;
    slab.name = 'celestial-slab';
    floor.add(slab);

    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      materials.marbleFloor
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    floorMesh.name = 'celestial-ground';
    floorMesh.userData.isGround = true;
    floor.add(floorMesh);
    this.groundMeshes.push(floorMesh);
    this.floorMesh = floorMesh;

    // Cornija dourada e faixa inferior na face externa da laje.
    const trim = new MeshBatch();
    for (const z of [-1, 1] as const) {
      trim.add(
        new THREE.BoxGeometry(size + 0.7, 0.13, 0.3),
        materials.goldInlay,
        new THREE.Matrix4().setPosition(0, -0.065, z * (ARENA.half + 0.04))
      );
      trim.add(
        new THREE.BoxGeometry(size + 0.45, 0.07, 0.24),
        materials.goldDark,
        new THREE.Matrix4().setPosition(0, -0.3, z * (ARENA.half + 0.03))
      );
    }
    for (const x of [-1, 1] as const) {
      trim.add(
        new THREE.BoxGeometry(0.3, 0.13, size + 0.7),
        materials.goldInlay,
        new THREE.Matrix4().setPosition(x * (ARENA.half + 0.04), -0.065, 0)
      );
      trim.add(
        new THREE.BoxGeometry(0.24, 0.07, size + 0.45),
        materials.goldDark,
        new THREE.Matrix4().setPosition(x * (ARENA.half + 0.03), -0.3, 0)
      );
    }

    // Curb perimetral: mármore com topo dourado.
    const curbHalf = ARENA.half - ARENA.curbWidth / 2;
    for (const z of [-1, 1] as const) {
      trim.add(
        new THREE.BoxGeometry(size, ARENA.curbHeight, ARENA.curbWidth),
        materials.marblePolished,
        new THREE.Matrix4().setPosition(0, ARENA.curbHeight / 2, z * curbHalf)
      );
      trim.add(
        new THREE.BoxGeometry(size + 0.06, 0.05, ARENA.curbWidth + 0.06),
        materials.gold,
        new THREE.Matrix4().setPosition(0, ARENA.curbHeight + 0.02, z * curbHalf)
      );
    }
    for (const x of [-1, 1] as const) {
      trim.add(
        new THREE.BoxGeometry(ARENA.curbWidth, ARENA.curbHeight, size),
        materials.marblePolished,
        new THREE.Matrix4().setPosition(x * curbHalf, ARENA.curbHeight / 2, 0)
      );
      trim.add(
        new THREE.BoxGeometry(ARENA.curbWidth + 0.06, 0.05, size + 0.06),
        materials.gold,
        new THREE.Matrix4().setPosition(x * curbHalf, ARENA.curbHeight + 0.02, 0)
      );
    }
    trim.build(floor, { castShadow: true, receiveShadow: true, name: 'celestial-trim' });
  }

  /**
   * Fundação sob a laje: bloco de pedra escalonado (a laje "arrancada" da ilha),
   * com cornija dourada, rocha irregular nos cantos e vegetação pendurada —
   * a leitura da ref 2, sem virar uma pilha de pedras soltas.
   */
  private buildFoundation(floor: THREE.Group): void {
    const materials = this.materials;
    const batch = new MeshBatch();
    const stone = this.cloneWithRepeat(materials.limestoneBlock, 10, 2);
    const stoneDark = this.cloneWithRepeat(materials.rockDark, 4, 2);

    // Bloco principal, afinando para baixo (dois degraus).
    batch.add(
      new THREE.BoxGeometry(ARENA.size - 1.2, 2.6, ARENA.size - 1.2),
      stone,
      new THREE.Matrix4().setPosition(0, -1.55, 0)
    );
    batch.add(
      new THREE.BoxGeometry(ARENA.size - 3.4, 2.2, ARENA.size - 3.4),
      stoneDark,
      new THREE.Matrix4().setPosition(0, -3.9, 0)
    );
    batch.add(
      new THREE.BoxGeometry(ARENA.size - 1.0, 0.22, ARENA.size - 1.0),
      materials.goldDark,
      new THREE.Matrix4().setPosition(0, -2.86, 0)
    );

    // Rocha irregular só nos cantos (a massa central já é o bloco).
    const rand = createSeededRandom(0xba5e);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + rand() * 0.25;
      const radius = ARENA.half * (0.78 + rand() * 0.12);
      const size = 2.2 + rand() * 2.6;
      const outcrop = createRockGeometry(0x1000 + i, 2, 0.55, 0.5);
      const matrix = new THREE.Matrix4()
        .makeRotationY(rand() * Math.PI)
        .scale(new THREE.Vector3(size, size * 1.25, size))
        .setPosition(
          Math.cos(angle) * radius,
          -3.6 - size * 0.8 - rand() * 1.2,
          Math.sin(angle) * radius
        );
      batch.add(outcrop, materials.rockDark, matrix);
    }

    // Vegetação pendurada na borda inferior, em tufos pequenos (ref 2).
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + 0.06;
      const radius = ARENA.half * 0.985;
      const bush = createBushGeometry(0x3000 + i);
      const scale = 0.55 + rand() * 0.4;
      const matrix = new THREE.Matrix4()
        .makeRotationY(angle)
        .scale(new THREE.Vector3(scale * 1.5, scale, scale * 1.5))
        .setPosition(Math.cos(angle) * radius, -1.15 - rand() * 0.3, Math.sin(angle) * radius);
      batch.add(bush, materials.moss, matrix);
    }

    // Pendentes nas quatro faces (ref 1: face frontal com medalhão pendurado).
    const front = ARENA.half;
    batch.add(
      new THREE.BoxGeometry(0.34, 0.9, 0.1),
      materials.goldInlay,
      new THREE.Matrix4().setPosition(0, -0.55, front + 0.05)
    );
    const facePlate = (size: number, depth: number, material: THREE.Material, y: number, z: number) => {
      const geometry = horizontalPlate(diamondShape(size), depth, 0.03, 0);
      const matrix = new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, y, z);
      batch.add(geometry, material, matrix);
    };
    facePlate(1.15, 0.06, materials.goldInlay, -1.16, front + 0.12);
    facePlate(0.62, 0.05, materials.ivory, -1.16, front + 0.16);
    facePlate(0.26, 0.04, materials.goldInlay, -1.16, front + 0.19);

    batch.build(floor, { castShadow: false, receiveShadow: true, name: 'celestial-foundation' });
  }

  /** Plintos de canto: mármore escalonado, tampa dourada e esmalte azul. */
  private buildPlinths(floor: THREE.Group): void {
    const materials = this.materials;
    const batch = new MeshBatch();
    const width = ARENA.plinthWidth;

    for (const { x, z } of plinthPositions()) {
      this.navigationObstacles.push({ x, z, radius: width * 0.72 });
      batch.add(
        new THREE.BoxGeometry(width + 0.24, 0.28, width + 0.24),
        materials.marblePolished,
        new THREE.Matrix4().setPosition(x, 0.14, z)
      );
      batch.add(
        new THREE.BoxGeometry(width, 0.34, width),
        materials.ivory,
        new THREE.Matrix4().setPosition(x, 0.45, z)
      );
      batch.add(
        new THREE.BoxGeometry(width + 0.16, 0.1, width + 0.16),
        materials.gold,
        new THREE.Matrix4().setPosition(x, 0.67, z)
      );
      const cap = new THREE.CylinderGeometry(width * 0.52, width * 0.66, 0.28, 4);
      cap.rotateY(Math.PI / 4);
      batch.add(cap, materials.gold, new THREE.Matrix4().setPosition(x, 0.86, z));
      // Tampa de esmalte com moldura dourada e emblema.
      batch.add(
        new THREE.BoxGeometry(width * 0.68, 0.07, width * 0.68),
        materials.enamel,
        new THREE.Matrix4().setPosition(x, 1.035, z)
      );
      const frame = width * 0.74;
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        batch.add(
          new THREE.BoxGeometry(
            dx === 0 ? frame : 0.09,
            0.07,
            dz === 0 ? frame : 0.09
          ),
          materials.gold,
          new THREE.Matrix4().setPosition(x + dx * frame * 0.5, 1.04, z + dz * frame * 0.5)
        );
      }
      // Emblema dourado sobre o azul (ref 2): losango vazado + losango central.
      const emblem = horizontalPlate(diamondShape(width * 0.46), 0.018, 0.012, 1.07);
      batch.add(emblem, materials.goldInlay, new THREE.Matrix4().setPosition(x, 0, z));
      const emblemHole = horizontalPlate(diamondShape(width * 0.3), 0.02, 0.008, 1.08);
      batch.add(emblemHole, materials.enamel, new THREE.Matrix4().setPosition(x, 0, z));
      const inner = horizontalPlate(diamondShape(width * 0.14), 0.016, 0.008, 1.095);
      batch.add(inner, materials.goldInlay, new THREE.Matrix4().setPosition(x, 0, z));

      // Estátua de mármore coroando o plinto (refs 1 e 2: figuras nos cantos).
      this.addStatue(batch, x, 1.12, z);
    }
    batch.build(floor, { castShadow: true, receiveShadow: true, name: 'celestial-plinths' });
  }

  /** Silhueta clássica de mármore: manto cônico, tronco, braços e cabeça. */
  private addStatue(batch: MeshBatch, x: number, baseY: number, z: number): void {
    const materials = this.materials;
    const at = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number, scale = 1) => {
      const matrix = new THREE.Matrix4()
        .makeScale(scale, scale, scale)
        .setPosition(x, baseY + y * scale, z);
      batch.add(geometry, material, matrix);
    };
    // Base, manto, tronco, cabeça e coroa dourada — leitura de estátua a 20 m.
    at(new THREE.CylinderGeometry(0.55, 0.72, 0.24, 12), materials.goldInlay, 0.12);
    at(new THREE.CylinderGeometry(0.46, 0.66, 1.5, 12), materials.ivory, 0.95);
    at(new THREE.CylinderGeometry(0.32, 0.46, 0.62, 12), materials.ivory, 1.9);
    at(new THREE.SphereGeometry(0.38, 12, 10), materials.ivory, 2.5);
    for (const side of [-1, 1] as const) {
      const arm = new THREE.CylinderGeometry(0.1, 0.13, 0.86, 8);
      const matrix = new THREE.Matrix4()
        .makeRotationZ(side * 0.9)
        .setPosition(x + side * 0.58, baseY + 1.92, z);
      batch.add(arm, materials.ivory, matrix);
    }
    at(new THREE.ConeGeometry(0.42, 0.34, 10), materials.goldInlay, 2.94);
    at(new THREE.SphereGeometry(0.2, 8, 6), materials.goldInlay, 3.14);
  }

  // ------------------------------------------------------------------ marchetaria

  private buildBorder(inlays: THREE.Group): void {
    const batch = new MeshBatch();
    const materials = this.materials;
    const offset = ARENA.half - ARENA.borderInset;
    const width = ARENA.borderWidth;
    const length = offset * 2;
    const y = ARENA.borderHeight;

    for (const sign of [-1, 1] as const) {
      // Ranhura escura sob a moldura (contraste das referências).
      batch.add(
        new THREE.BoxGeometry(length + width + 0.24, 0.018, width + 0.24),
        materials.groove,
        new THREE.Matrix4().setPosition(0, 0.009, sign * offset)
      );
      batch.add(
        new THREE.BoxGeometry(width + 0.24, 0.018, length + width + 0.24),
        materials.groove,
        new THREE.Matrix4().setPosition(sign * offset, 0.009, 0)
      );
      batch.add(
        new THREE.BoxGeometry(length + width, y, width),
        materials.goldInlay,
        new THREE.Matrix4().setPosition(0, y / 2 + 0.018, sign * offset)
      );
      batch.add(
        new THREE.BoxGeometry(width, y, length + width),
        materials.goldInlay,
        new THREE.Matrix4().setPosition(sign * offset, y / 2 + 0.018, 0)
      );
    }
    // Filetes: mármore claro por fora, ouro fino por dentro.
    for (const sign of [-1, 1] as const) {
      for (const side of [-1, 1] as const) {
        const outerLine = offset + sign * (width / 2 + 0.2);
        batch.add(
          new THREE.BoxGeometry(length + width + 0.7, 0.026, 0.15),
          materials.ivory,
          new THREE.Matrix4().setPosition(0, 0.013, side * outerLine)
        );
        batch.add(
          new THREE.BoxGeometry(0.15, 0.026, length + width + 0.7),
          materials.ivory,
          new THREE.Matrix4().setPosition(side * outerLine, 0.013, 0)
        );
        const innerLine = offset - sign * (width / 2 + 0.62);
        batch.add(
          new THREE.BoxGeometry(length + width - 1.2, 0.024, 0.1),
          materials.goldInlay,
          new THREE.Matrix4().setPosition(0, 0.012, side * innerLine)
        );
        batch.add(
          new THREE.BoxGeometry(0.1, 0.024, length + width - 1.2),
          materials.goldInlay,
          new THREE.Matrix4().setPosition(side * innerLine, 0.012, 0)
        );
      }
    }
    // Losangos nos quatro cantos da moldura.
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const groove = horizontalPlate(diamondShape(1.45), 0.014, 0.03, 0.05);
        batch.add(groove, materials.groove, new THREE.Matrix4().setPosition(sx * offset, 0, sz * offset));
        const diamond = horizontalPlate(diamondShape(1.25), 0.02, 0.03, 0.062);
        batch.add(diamond, materials.goldInlay, new THREE.Matrix4().setPosition(sx * offset, 0, sz * offset));
        const inner = horizontalPlate(diamondShape(0.55), 0.02, 0.015, 0.085);
        batch.add(inner, materials.ivory, new THREE.Matrix4().setPosition(sx * offset, 0, sz * offset));
      }
    }
    batch.build(inlays, { castShadow: false, receiveShadow: true, name: 'celestial-border' });
  }

  private buildMedallion(inlays: THREE.Group): void {
    const materials = this.materials;
    const batch = new MeshBatch();

    const addRing = (
      radius: number,
      width: number,
      material: THREE.Material,
      y: number
    ) => {
      const ring = new THREE.RingGeometry(radius - width / 2, radius + width / 2, 160);
      batch.add(
        ring,
        material,
        new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, y, 0)
      );
    };
    const addTorus = (radius: number, tube: number, material: THREE.Material, y: number) => {
      const torus = new THREE.TorusGeometry(radius, tube, 8, 160);
      batch.add(
        torus,
        material,
        new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, y, 0)
      );
    };
    const addGrooveRing = (radius: number, width: number) => {
      const ring = new THREE.RingGeometry(radius - width / 2, radius + width / 2, 160);
      batch.add(
        ring,
        materials.groove,
        new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, 0.006, 0)
      );
    };

    // Ranhuras + anéis (dois grossos, um fio de acento).
    addGrooveRing(ARENA.medallionAccentRadius, 0.16);
    addGrooveRing(ARENA.medallionInnerRadius, 0.34);
    addGrooveRing(ARENA.medallionOuterRadius, 0.36);
    addRing(ARENA.medallionAccentRadius, 0.07, materials.goldInlay, 0.024);
    addRing(ARENA.medallionInnerRadius, 0.19, materials.goldInlay, 0.03);
    addTorus(ARENA.medallionInnerRadius, 0.026, materials.goldLight, 0.05);
    addRing(ARENA.medallionOuterRadius, 0.21, materials.goldInlay, 0.03);
    addTorus(ARENA.medallionOuterRadius, 0.028, materials.goldLight, 0.05);
    addRing(ARENA.medallionInnerRadius + 0.34, 0.05, materials.ivory, 0.014);

    // Emblema central em camadas (ranhura → ouro → marfim → ouro → marfim).
    const layers: { size: number; height: number; material: THREE.Material; y: number }[] = [
      { size: ARENA.centerDiamond * 1.12, height: 0.012, material: materials.groove, y: 0.006 },
      { size: ARENA.centerDiamond, height: 0.022, material: materials.goldInlay, y: 0.016 },
      { size: ARENA.centerDiamond * 0.76, height: 0.026, material: materials.ivory, y: 0.04 },
      { size: ARENA.centerDiamond * 0.54, height: 0.022, material: materials.goldInlay, y: 0.068 },
      { size: ARENA.centerDiamond * 0.26, height: 0.016, material: materials.ivory, y: 0.092 },
    ];
    for (const layer of layers) {
      const plate = horizontalPlate(diamondShape(layer.size), layer.height, 0.02, layer.y);
      batch.add(plate, layer.material);
    }
    // Quatro pontas curtas saindo do losango central (detalhe da ref 1).
    for (const rotation of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const spike = new THREE.BoxGeometry(0.16, 0.02, 0.9);
      const matrix = new THREE.Matrix4().makeRotationY(rotation).setPosition(
        Math.sin(rotation) * -1.35,
        0.07,
        Math.cos(rotation) * -1.35
      );
      batch.add(spike, materials.goldInlay, matrix);
    }

    // Braços cardeais: placa de marfim + nervura dourada + ponta em losango.
    const armShape = new THREE.Shape();
    armShape.moveTo(-1.0, 9.0);
    armShape.lineTo(1.0, 9.0);
    armShape.lineTo(0.76, 10.4);
    armShape.lineTo(0.6, 19.4);
    armShape.lineTo(0.4, 20.2);
    armShape.lineTo(0, 20.7);
    armShape.lineTo(-0.4, 20.2);
    armShape.lineTo(-0.6, 19.4);
    armShape.lineTo(-0.76, 7.0);
    armShape.closePath();
    const armCore = new THREE.Shape();
    armCore.moveTo(-0.42, 9.4);
    armCore.lineTo(0.42, 9.4);
    armCore.lineTo(0.3, 19.5);
    armCore.lineTo(0.18, 20.0);
    armCore.lineTo(0, 20.26);
    armCore.lineTo(-0.18, 20.0);
    armCore.lineTo(-0.3, 19.5);
    armCore.closePath();
    const armGroove = horizontalPlate(armShape, 0.014, 0.02, 0.02);
    const armBase = horizontalPlate(armShape, 0.032, 0.024, 0.034);
    const core = horizontalPlate(armCore, 0.045, 0.018, 0.066);
    // Placa interna de marfim: o braco le como fita dourada com eixo claro.
    const armInner = horizontalPlate(armShape, 0.02, 0.01, 0.052);
    const wing = new THREE.BoxGeometry(0.72, 0.022, 0.1);
    const armRotations = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
    for (const rotation of armRotations) {
      const matrix = new THREE.Matrix4().makeRotationY(rotation);
      // Camadas (de baixo para cima): ranhura, base dourada lapidada, placa de
      // marfim e nervura dourada — o relevo da ref 1.
      batch.add(armGroove, materials.groove, matrix);
      batch.add(armBase, materials.goldInlay, matrix);
      batch.add(armInner, materials.ivory, matrix);
      batch.add(core, materials.goldInlay, matrix);
      for (const sign of [-1, 1] as const) {
        // Asas finas na ponta do braço (ref 1), deitadas sobre o piso.
        const localX = sign * 0.52;
        const localZ = -19.9;
        const x = localX * Math.cos(rotation) + localZ * Math.sin(rotation);
        const z = -localX * Math.sin(rotation) + localZ * Math.cos(rotation);
        const wingMatrix = new THREE.Matrix4()
          .makeRotationY(rotation + sign * 0.62)
          .setPosition(x, 0.055, z);
        batch.add(wing, materials.goldInlay, wingMatrix);
      }
    }

    // Losangos na ponta de cada braço (sobre a moldura).
    const tips: [number, number][] = [
      [0, -ARENA.half + ARENA.borderInset],
      [ARENA.half - ARENA.borderInset, 0],
      [0, ARENA.half - ARENA.borderInset],
      [-ARENA.half + ARENA.borderInset, 0],
    ];
    for (const [x, z] of tips) {
      const groove = horizontalPlate(diamondShape(1.5), 0.012, 0.03, 0.05);
      batch.add(groove, materials.groove, new THREE.Matrix4().setPosition(x, 0, z));
      const plate = horizontalPlate(diamondShape(1.3), 0.03, 0.03, 0.062);
      batch.add(plate, materials.goldInlay, new THREE.Matrix4().setPosition(x, 0, z));
      const inner = horizontalPlate(diamondShape(0.5), 0.02, 0.015, 0.095);
      batch.add(inner, materials.ivory, new THREE.Matrix4().setPosition(x, 0, z));
    }

    batch.build(inlays, { castShadow: false, receiveShadow: true, name: 'celestial-medallion' });
  }

  /** Gemas azuis nos quatro cantos internos da moldura. */
  private buildCornerGems(inlays: THREE.Group): void {
    const materials = this.materials;
    const batch = new MeshBatch();
    for (const { x, z } of cornerGemPositions()) {
      const base = horizontalPlate(diamondShape(ARENA.cornerGemSize), 0.03, 0.03, 0.012);
      batch.add(base, materials.ivory, new THREE.Matrix4().setPosition(x, 0, z));
      const gold = horizontalPlate(diamondShape(ARENA.cornerGemSize * 0.78), 0.025, 0.025, 0.04);
      batch.add(gold, materials.gold, new THREE.Matrix4().setPosition(x, 0, z));
      const socket = horizontalPlate(diamondShape(ARENA.cornerGemSize * 0.46), 0.02, 0.02, 0.066);
      batch.add(socket, materials.enamel, new THREE.Matrix4().setPosition(x, 0, z));
      const gem = new THREE.OctahedronGeometry(0.34, 0);
      gem.scale(1, 0.55, 1);
      batch.add(gem, materials.sapphire, new THREE.Matrix4().setPosition(x, 0.12, z));
    }
    batch.build(inlays, { castShadow: false, receiveShadow: true, name: 'celestial-gems' });
  }

  // -------------------------------------------------------------------- bandeiras

  private buildBanners(parent: THREE.Group): void {
    const placements: BannerPlacement[] = [
      ...arenaBannerPlacements(),
      ...pillarBannerPlacements(),
      ...standBannerPlacements(),
    ];
    const geometries = new Map<string, THREE.BufferGeometry>();
    let seed = 1;
    for (const placement of placements) {
      const key = `${placement.width}x${placement.height}`;
      let geometry = geometries.get(key);
      if (!geometry) {
        geometry = createBannerGeometry(
          placement.width,
          placement.height,
          ARENA.bannerTip,
          seed
        );
        geometries.set(key, geometry);
      }
      const sway = new THREE.Group();
      sway.position.set(placement.x, placement.y, placement.z);
      sway.rotation.y = placement.rotationY;

      const cloth = new THREE.Mesh(geometry, this.materials.banner);
      cloth.castShadow = false;
      cloth.receiveShadow = false;
      sway.add(cloth);

      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, placement.width + 0.34, 8),
        this.materials.gold
      );
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, 0.04, 0.05);
      sway.add(rod);

      parent.add(sway);
      this.banners.push({
        group: sway,
        baseRotation: 0,
        phase: seed * 1.7,
        amplitude: placement.mount === 'arena' ? 0.022 : 0.014,
      });
      seed++;
    }
  }

  // ---------------------------------------------------------------------- fogo

  private buildBraziers(parent: THREE.Group): void {
    const materials = this.materials;
    const batch = new MeshBatch();
    const bowlGeometry = createBrazierBowlGeometry(0.98, 0.68);
    // Colunas altas como na ref 2: a chama fica acima do entablamento (≈13 m).
    const heightScale = 1.62;
    const widthScale = 1.12;

    for (const { x, z, scale } of brazierPositions()) {
      if (Math.abs(x) < ARENA.half - 0.5 && Math.abs(z) < ARENA.half - 0.5) {
        this.navigationObstacles.push({ x, z, radius: 1.05 });
      }
      const add = (
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        localY: number,
        localScale = 1
      ) => {
        const matrix = new THREE.Matrix4()
          .makeScale(widthScale * scale * localScale, heightScale * scale * localScale, widthScale * scale * localScale)
          .setPosition(x, localY * heightScale * scale, z);
        batch.add(geometry, material, matrix);
      };
      add(new THREE.BoxGeometry(1.65, 0.3, 1.65), materials.ivory, 0.15);
      add(new THREE.BoxGeometry(1.36, 0.24, 1.36), materials.gold, 0.42);
      add(new THREE.BoxGeometry(1.5, 0.16, 1.5), materials.goldDark, 0.24);
      add(new THREE.CylinderGeometry(0.46, 0.56, 0.8, 12), materials.marblePolished, 0.92);
      add(new THREE.CylinderGeometry(0.3, 0.38, 4.9, 16), materials.marblePolished, 3.7);
      add(new THREE.TorusGeometry(0.34, 0.055, 6, 20), materials.gold, 2.2);
      add(new THREE.TorusGeometry(0.31, 0.055, 6, 20), materials.gold, 5.3);
      add(new THREE.CylinderGeometry(0.6, 0.38, 0.36, 14), materials.gold, 6.32);
      add(new THREE.CylinderGeometry(0.66, 0.66, 0.09, 16), materials.gold, 6.52);
      add(bowlGeometry, materials.gold, 6.6);
      add(new THREE.CylinderGeometry(0.95, 0.95, 0.06, 16), materials.goldDark, 6.7);

      const flameGroup = new THREE.Group();
      flameGroup.position.set(x, 7.35 * heightScale * scale, z);
      const spark = new THREE.Sprite(materials.flame);
      spark.scale.set(1.5, 2.5, 1);
      spark.position.y = 0.85;
      spark.renderOrder = 2;
      flameGroup.add(spark);
      const core = new THREE.Sprite(materials.flame);
      core.scale.set(0.85, 1.5, 1);
      core.position.y = 0.5;
      core.renderOrder = 3;
      flameGroup.add(core);
      parent.add(flameGroup);
      this.flames.push({ group: flameGroup, phase: x * 0.37 + z * 0.11, baseScale: scale });
    }
    batch.build(parent, { castShadow: true, receiveShadow: false, name: 'celestial-braziers' });
  }

  private buildBenches(parent: THREE.Group): void {
    const batch = new MeshBatch();
    for (const side of [-1, 1] as const) {
      for (const z of [-14, 0, 14, 28]) {
        batch.add(
          new THREE.BoxGeometry(1.45, 0.42, 0.9),
          this.materials.ivory,
          new THREE.Matrix4().setPosition(side * 26.1, 0.21, z)
        );
        batch.add(
          new THREE.BoxGeometry(1.55, 0.07, 1.0),
          this.materials.gold,
          new THREE.Matrix4().setPosition(side * 26.1, 0.45, z)
        );
      }
    }
    batch.build(parent, { castShadow: true, receiveShadow: true, name: 'celestial-benches' });
  }

  // -------------------------------------------------------------------- ambiente

  /**
   * Liga o ambiente da arena na cena: fundo, neblina, envmap (reflexo dourado)
   * e anisotropia do piso. Chamar depois de criar o renderer.
   */
  public configureScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    scene.background = new THREE.Color(0xa9d2ee);
    scene.fog = new THREE.Fog(0xdceaf7, 210, 800);

    const source = makeSkyEnvironmentTexture();
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const environment = pmrem.fromEquirectangular(source).texture;
    scene.environment = environment;
    this.environmentTexture = environment;
    source.dispose();
    pmrem.dispose();

    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (this.floorMesh) {
      const material = this.floorMesh.material as THREE.MeshStandardMaterial;
      if (material.map) {
        material.map.anisotropy = anisotropy;
        material.map.needsUpdate = true;
      }
      material.needsUpdate = true;
    }
  }

  /** Nuvens rentes à base da arena: reforça a leitura de "flutuando". */
  private buildHazeRing(parent: THREE.Group): void {
    const rand = createSeededRandom(0x4a2e);
    const ring = new THREE.Group();
    ring.name = 'celestial-haze';
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2 + rand() * 0.18;
      const radius = 31 + rand() * 12;
      const sprite = new THREE.Sprite(this.materials.cloudHaze);
      sprite.position.set(
        Math.cos(angle) * radius,
        -10 - rand() * 7,
        Math.sin(angle) * radius
      );
      const scale = 26 + rand() * 30;
      sprite.scale.set(scale, scale * 0.42, 1);
      ring.add(sprite);
    }
    parent.add(ring);
  }

  public update(time: number, _playerPosition?: THREE.Vector3): void {
    for (const flame of this.flames) {
      const flicker =
        0.9 + Math.sin(time * 9 + flame.phase) * 0.07 + Math.sin(time * 21 + flame.phase * 2) * 0.04;
      flame.group.scale.set(
        flame.baseScale * (0.96 + Math.sin(time * 7 + flame.phase) * 0.04),
        flame.baseScale * flicker,
        flame.baseScale
      );
      flame.group.rotation.y = Math.sin(time * 1.7 + flame.phase) * 0.12;
    }
    for (const banner of this.banners) {
      banner.group.rotation.x =
        banner.baseRotation + Math.sin(time * 0.9 + banner.phase) * banner.amplitude;
      banner.group.rotation.z = Math.sin(time * 0.61 + banner.phase * 1.3) * banner.amplitude * 0.6;
    }
    this.sky?.update(time);
  }

  public setQuality(quality: 'high' | 'medium' | 'low'): void {
    const shadows = quality !== 'low';
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = object.castShadow && shadows;
      }
    });
  }

  // ------------------------------------------------------------- API de cenário

  public getBossSpawnPoint(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -18);
  }

  public getEnemySpawnPoints(): THREE.Vector3[] {
    return enemySpawnPoints().map((point) => new THREE.Vector3(point.x, 0, point.z));
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

  public getFinalBattleMinionSpawnPoints(count = 10): THREE.Vector3[] {
    const points = [
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

  /** Enquadramento de QA/visão geral (usado pelo laboratório). */
  public getCameraPreset(name: keyof typeof ARENA_CAMERAS | string) {
    return ARENA_CAMERAS[name] ?? ARENA_CAMERAS.overview;
  }

  public dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    this.sky?.dispose();
    this.tribunes?.dispose();
    this.materials.dispose();
    for (const material of this.localMaterials) material.dispose();
    for (const texture of this.localTextures) texture.dispose();
    this.environmentTexture?.dispose();
    this.localMaterials.length = 0;
    this.localTextures.length = 0;
  }
}
