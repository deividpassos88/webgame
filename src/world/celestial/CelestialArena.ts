import * as THREE from 'three';
import {
  ARENA,
  ARENA_CAMERAS,
  FASCIA,
  arenaBannerPlacements,
  cornerGemPositions,
  createSeededRandom,
  brazierPositions,
  enemySpawnPoints,
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
    // O padrão do piso (moldura, medalhão e gemas) vem retificado da própria
    // referência em `floor-albedo.png`: nenhuma peça procedural por cima.
    void inlays;
    // Brasseiros e bancos dentro da arena não existem na ref 1: as chamas da
    // referência ficam nos pilares das tribunas (ver CelestialTribunes).
    void props;
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
    slab.position.y = -ARENA.slabThickness / 2 - 0.006;
    slab.castShadow = false;
    slab.receiveShadow = true;
    slab.name = 'celestial-slab';
    floor.add(slab);

    // Piso: albedo retificado da referência. É uma textura plana, então vale
    // de qualquer ângulo — o padrão e os veios não se distorcem.
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      materials.floorReference
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0.002;
    floorMesh.receiveShadow = false;
    floorMesh.name = 'celestial-ground';
    floorMesh.userData.isGround = true;
    floor.add(floorMesh);
    this.groundMeshes.push(floorMesh);
    this.floorMesh = floorMesh;

    // Borda da laje em três faixas, como na ref 1: gola dourada, faixa de
    // mármore e moldura dourada saliente.
    const trim = new MeshBatch();
    const half = ARENA.half;
    const bull = FASCIA.bullnoseHeight;
    const marble = FASCIA.marbleHeight;
    const molding = FASCIA.moldingHeight;
    const faces: { axis: 'x' | 'z'; sign: 1 | -1 }[] = [
      { axis: 'z', sign: 1 }, { axis: 'z', sign: -1 },
      { axis: 'x', sign: 1 }, { axis: 'x', sign: -1 },
    ];
    for (const { axis, sign } of faces) {
      const along = size + 0.5;
      const place = (depth: number, height: number, y: number, out: number, material: THREE.Material, geomAlong = along) => {
        const geometry = axis === 'z'
          ? new THREE.BoxGeometry(geomAlong, height, depth)
          : new THREE.BoxGeometry(depth, height, geomAlong);
        const matrix = new THREE.Matrix4().setPosition(
          axis === 'x' ? sign * (half + out - depth / 2) : 0,
          y,
          axis === 'z' ? sign * (half + out - depth / 2) : 0
        );
        trim.add(geometry, material, matrix);
      };
      // gola dourada fina (bojo) no topo
      place(0.42, bull, -bull / 2 - 0.004, FASCIA.bullnoseOut, materials.gold);
      // faixa de mármore logo abaixo
      place(0.34, marble, -bull - marble / 2, 0.05, materials.marbleTrim);
      // filete dourado na base do mármore
      place(0.4, 0.1, -bull - marble - 0.05, 0.1, materials.goldDark);
      // cornija de pedra saliente sob o mármore
      place(0.62, molding, -bull - marble - 0.12 - molding / 2, FASCIA.moldingOut, materials.marbleTrim);
      place(0.7, 0.12, -bull - marble - 0.14, 0.06, materials.goldLight);
    }
    trim.build(floor, { castShadow: true, receiveShadow: false, name: 'celestial-trim' });
  }

  /**
   * Fundação: a fachada alta da ref 1. Sob a moldura dourada corre uma parede
   * de pedra de ~17 m com pilastras douradas, corbelos, bandeiras penduradas e
   * o pendente central em losango; na base, rocha e vegetação.
   */
  private buildFoundation(floor: THREE.Group): void {
    const materials = this.materials;
    const batch = new MeshBatch();
    const half = ARENA.half;
    const top = FASCIA.stoneTop;
    const bottom = FASCIA.stoneBottom;
    const height = top - bottom;
    const centerY = (top + bottom) / 2;
    const stone = this.cloneWithRepeat(materials.facadeStone, 8, 4);
    const stoneDark = this.cloneWithRepeat(materials.rockDark, 4, 2);

    batch.add(
      new THREE.BoxGeometry(ARENA.size - 0.24, height, ARENA.size - 0.24),
      stone,
      new THREE.Matrix4().setPosition(0, centerY, 0)
    );

    const faces: { axis: 'x' | 'z'; sign: 1 | -1 }[] = [
      { axis: 'z', sign: 1 }, { axis: 'z', sign: -1 },
      { axis: 'x', sign: 1 }, { axis: 'x', sign: -1 },
    ];
    const at = (axis: 'x' | 'z', sign: 1 | -1, along: number, out: number, y: number) =>
      new THREE.Matrix4().setPosition(
        axis === 'x' ? sign * (half - 0.12 + out) : along,
        y,
        axis === 'z' ? sign * (half - 0.12 + out) : along
      );
    const strip = (
      axis: 'x' | 'z',
      sign: 1 | -1,
      w: number,
      h: number,
      d: number,
      along: number,
      out: number,
      y: number,
      material: THREE.Material
    ) => {
      const geometry = axis === 'z' ? new THREE.BoxGeometry(w, h, d) : new THREE.BoxGeometry(d, h, w);
      batch.add(geometry, material, at(axis, sign, along, out, y));
    };

    for (const { axis, sign } of faces) {
      // Pilastras de pedra: a referência não tem pilastras douradas na fachada.
      for (const along of [-18.2, -9.6, 9.6, 18.2]) {
        strip(axis, sign, 0.7, height - 0.4, 0.34, along, 0.14, centerY, stoneDark);
        strip(axis, sign, 0.5, height - 0.5, 0.32, along, 0.24, centerY, stone);
      }
      // Cornija de pedra no topo e plinto na base.
      strip(axis, sign, ARENA.size - 0.1, 0.36, 0.5, 0, 0.2, top - 0.2, stone);
      strip(axis, sign, ARENA.size - 0.1, 0.22, 0.46, 0, 0.16, top - 0.5, stoneDark);
      strip(axis, sign, ARENA.size - 0.1, 0.7, 0.44, 0, 0.12, bottom + 0.5, stoneDark);

      // Corbelos de pedra sob a cornija: degraus salientes a cada 3,4 m.
      for (let along = -20.4; along <= 20.5; along += 3.4) {
        strip(axis, sign, 0.95, 0.95, 0.66, along, 0.3, top - 1.1, stone);
        strip(axis, sign, 0.66, 0.5, 0.54, along, 0.34, top - 1.72, stoneDark);
      }

      // Painéis rebaixados entre as pilastras: dão relevo à parede.
      for (const along of [-14, 0, 14]) {
        strip(axis, sign, 5.8, height - 4.2, 0.14, along, 0.01, centerY - 0.6, stoneDark);
        strip(axis, sign, 5.2, height - 5.0, 0.16, along, 0.04, centerY - 0.6, stone);
      }
    }

    // Pendente central: placa, haste e losango vazado com losango interno.
    const vertical = (w: number, h: number, depth: number, bevel: number) =>
      new THREE.ExtrudeGeometry(diamondShape(w, h), {
        depth,
        bevelEnabled: true,
        bevelThickness: bevel * 0.6,
        bevelSize: bevel,
        bevelSegments: 2,
        curveSegments: 4,
      });
    const face = half + 0.1;
    const pendantAt = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number, z = face) =>
      batch.add(geometry, material, new THREE.Matrix4().setPosition(0, y, z));
    pendantAt(vertical(4.6, 1.9, 0.3, 0.1), materials.gold, -1.2, face + 0.22);
    pendantAt(vertical(3.2, 1.3, 0.26, 0.08), materials.ivory, -1.2, face + 0.36);
    pendantAt(vertical(1.0, 0.48, 0.24, 0.06), materials.goldInlay, -1.2, face + 0.5);
    batch.add(
      new THREE.BoxGeometry(0.62, 2.2, 0.34),
      materials.gold,
      new THREE.Matrix4().setPosition(0, -3.2, face + 0.18)
    );
    pendantAt(vertical(5.2, 8.4, 0.34, 0.12), materials.gold, -6.6, face + 0.24);
    pendantAt(vertical(3.8, 6.4, 0.36, 0.1), materials.enamel, -6.6, face + 0.34);
    pendantAt(vertical(2.4, 2.4, 0.3, 0.08), materials.gold, -6.6, face + 0.5);

    // Rocha e vegetação na base da fachada (a ilha suspensa).
    const rand = createSeededRandom(0xba5e);
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + rand() * 0.3;
      const radius = half * (0.72 + rand() * 0.18);
      const size = 3 + rand() * 3.4;
      const outcrop = createRockGeometry(0x1000 + i, 2, 0.55, 0.5);
      const matrix = new THREE.Matrix4()
        .makeRotationY(rand() * Math.PI)
        .scale(new THREE.Vector3(size, size * 1.4, size))
        .setPosition(
          Math.cos(angle) * radius,
          bottom - size * 0.7 - rand() * 2,
          Math.sin(angle) * radius
        );
      batch.add(outcrop, materials.rockDark, matrix);
    }
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2 + 0.06;
      const radius = half * 0.99;
      const bush = createBushGeometry(0x3000 + i);
      const scale = 0.7 + rand() * 0.6;
      const matrix = new THREE.Matrix4()
        .makeRotationY(angle)
        .scale(new THREE.Vector3(scale * 1.6, scale, scale * 1.6))
        .setPosition(Math.cos(angle) * radius, bottom - 0.1 - rand() * 0.5, Math.sin(angle) * radius);
      batch.add(bush, materials.moss, matrix);
    }

    batch.build(floor, { castShadow: false, receiveShadow: false, name: 'celestial-foundation' });
  }

  /** Plintos de canto: pedestal de pedra, moldura dourada e tampa de safira. */
  private buildPlinths(floor: THREE.Group): void {
    const materials = this.materials;
    const batch = new MeshBatch();
    const width = 3.0;

    for (const { x, z } of plinthPositions()) {
      this.navigationObstacles.push({ x, z, radius: width * 0.66 });
      batch.add(
        new THREE.BoxGeometry(width + 1.1, 0.26, width + 1.1),
        materials.facadeStone,
        new THREE.Matrix4().setPosition(x, 0.13, z)
      );
      batch.add(
        new THREE.BoxGeometry(width + 0.72, 0.18, width + 0.72),
        materials.gold,
        new THREE.Matrix4().setPosition(x, 0.35, z)
      );
      batch.add(
        new THREE.BoxGeometry(width + 0.2, 0.62, width + 0.2),
        materials.facadeStone,
        new THREE.Matrix4().setPosition(x, 0.75, z)
      );
      batch.add(
        new THREE.BoxGeometry(width + 0.5, 0.16, width + 0.5),
        materials.gold,
        new THREE.Matrix4().setPosition(x, 1.13, z)
      );
      batch.add(
        new THREE.BoxGeometry(width - 0.15, 0.18, width - 0.15),
        materials.gold,
        new THREE.Matrix4().setPosition(x, 1.3, z)
      );
      batch.add(
        new THREE.BoxGeometry(width - 0.75, 0.1, width - 0.75),
        materials.sapphire,
        new THREE.Matrix4().setPosition(x, 1.44, z)
      );
      batch.add(
        new THREE.BoxGeometry(width - 0.55, 0.05, width - 0.55),
        materials.goldLight,
        new THREE.Matrix4().setPosition(x, 1.5, z)
      );
    }
    batch.build(floor, { castShadow: true, receiveShadow: true, name: 'celestial-plinths' });
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
          placement.tip ?? ARENA.bannerTip,
          seed
        );
        geometries.set(key, geometry);
      }
      const sway = new THREE.Group();
      sway.position.set(placement.x, placement.y, placement.z);
      sway.rotation.y = placement.rotationY;

      const cloth = new THREE.Mesh(geometry, this.materials.bannerCloth);
      cloth.castShadow = false;
      cloth.receiveShadow = false;
      sway.add(cloth);

      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, placement.width + 0.3, 8),
        this.materials.gold
      );
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, 0.02, 0.02);
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
    ring.visible = false;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + rand() * 0.18;
      const radius = 31 + rand() * 12;
      const sprite = new THREE.Sprite(this.materials.cloudHaze);
      sprite.position.set(
        Math.cos(angle) * radius,
        -10 - rand() * 7,
        Math.sin(angle) * radius
      );
      const scale = 16 + rand() * 16;
      sprite.scale.set(scale, scale * 0.42, 1);
      ring.add(sprite);
    }
    parent.add(ring);
  }

  public update(time: number, _playerPosition?: THREE.Vector3): void {
    this.tribunes?.update(time);
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
